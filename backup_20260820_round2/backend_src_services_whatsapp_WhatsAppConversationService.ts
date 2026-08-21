import type { Agent, Conversation, Customer, WhatsappConnection } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hub } from '../../ws/hub';
import { ragService } from '../rag/RagService';
import { aiService } from '../ai/AiProcessorService';

/**
 * محرك إرسال يستخدمه المسار المشترك للمحادثة — كل محرك واتساب يوفر تنفيذه.
 */
export interface WhatsAppSendEngine {
  readonly kind: 'webjs' | 'meta';
  send(to: string, text: string): Promise<string>;
  simulateTyping?(to: string): Promise<void>;
}

/**
 * مسار المحادثة الموحدة للواتساب (يعمل مع المحركين الحر والرسمي):
 * استقبال ← حفظ ← AI (gpt-4o-mini مع RAG + بيانات العميل) ← مكافحة حظر ← إرسال ← حفظ وبث مباشر.
 */
export class WhatsAppConversationService {
  async handleInboundText(connection: WhatsappConnection, from: string, body: string, engine: WhatsAppSendEngine): Promise<void> {
    const tenantId = connection.tenantId;
    const conversation = await this.ensureConversation(tenantId, connection.id, from);

    // 1) حفظ رسالة العميل + بث مباشر (بشكل WhatsappMessage)
    const inbound = await prisma.whatsappMessage.create({
      data: {
        tenantId,
        connectionId: connection.id,
        conversationId: conversation.id,
        direction: 'INBOUND',
        body,
        status: 'DELIVERED',
      },
    });
    await prisma.conversationMessage.create({
      data: { tenantId, conversationId: conversation.id, role: 'USER', content: body, provider: engine.kind },
    });
    hub.broadcast(tenantId, { type: 'message.new', message: inbound as unknown as Record<string, unknown> });

    // 2) الوكيل النشط للمستأجر
    const agent = await this.activeAgent(tenantId);
    if (!agent) {
      const fallback = 'عذرًا، الوكيل غير مهيأ حاليًا. الرجاء المحاولة لاحقًا.';
      await this.sendAgentReply(conversation, connection, fallback, engine);
      return;
    }

    // 2.5) البحث عن العميل من رقم الهاتف + تحديث الحالة عند ورد رسالة
    const customer = await this.findCustomer(tenantId, from);
    if (customer) {
      if (!conversation.customerId) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { customerId: customer.id },
        });
      }
      if (customer.status !== 'DONE') {
        await prisma.customer.update({ where: { id: customer.id }, data: { status: 'DONE' } }).catch(() => undefined);
      }
    }

    // 3) RAG + حقول ديناميكية ثم توليد الرد مع بيانات العميل
    const ragContext = await ragService.search(tenantId, body, agent.id, 4);
    const dynamicFields = await prisma.dynamicField.findMany({
      where: { tenantId, enabled: true },
      orderBy: { position: 'asc' },
    });
    const history = await prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const reply = await aiService.generateReply({ tenantId, agent, conversation, history, ragContext, dynamicFields, customer });
    await this.sendAgentReply(conversation, connection, reply, engine);
  }

  /** إرسال رد الوكيل مع مكافحة الحظر وحفظه وبثّه */
  private async sendAgentReply(
    conversation: Conversation,
    connection: WhatsappConnection,
    reply: string,
    engine: WhatsAppSendEngine,
  ): Promise<void> {
    // مكافحة الحظر: كتابة محاكاة (إن دُعمت) + تأخير بشري 3-5 ثوانٍ
    if (engine.simulateTyping) await engine.simulateTyping(conversation.contactNumber);
    else await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2000));
    const waId = await engine.send(conversation.contactNumber, reply);

    const outbound = await prisma.whatsappMessage.create({
      data: {
        tenantId: conversation.tenantId,
        connectionId: connection.id,
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        body: reply,
        waMessageId: waId,
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    await prisma.conversationMessage.create({
      data: { tenantId: conversation.tenantId, conversationId: conversation.id, role: 'ASSISTANT', content: reply, provider: engine.kind },
    });
    hub.broadcast(conversation.tenantId, {
      type: 'message.new',
      message: outbound as unknown as Record<string, unknown>,
    });
  }

  /** رد بشري بعد الـ Human Takeover (مباشرة عبر المحرك دون AI) */
  async sendHumanReply(tenantId: string, conversationId: string, text: string, engine: WhatsAppSendEngine): Promise<void> {
    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
    if (!conversation) throw new Error('المحادثة غير موجودة');
    const connection = await prisma.whatsappConnection.findFirst({ where: { tenantId } });

    const waId = await engine.send(conversation.contactNumber, text);
    await prisma.conversationMessage.create({
      data: { tenantId, conversationId, role: 'HUMAN', content: text, provider: 'human' },
    });
    const outbound = connection
      ? await prisma.whatsappMessage.create({
          data: {
            tenantId,
            connectionId: connection.id,
            conversationId,
            direction: 'OUTBOUND',
            body: text,
            waMessageId: waId,
            status: 'SENT',
            sentAt: new Date(),
          },
        })
      : null;
    hub.broadcast(tenantId, {
      type: 'message.new',
      message: (outbound ?? { conversationId, direction: 'OUTBOUND', body: text, status: 'SENT', createdAt: new Date().toISOString() }) as unknown as Record<string, unknown>,
    });
  }

  /** إيجاد أو إنشاء محادثة واتساب مفتوحة مع جهة الاتصال */
  private async ensureConversation(tenantId: string, connectionId: string, from: string): Promise<Conversation> {
    const existing = await prisma.conversation.findFirst({
      where: { tenantId, channel: 'WHATSAPP', contactNumber: from, status: 'OPEN' },
    });
    if (existing) return existing;

    const created = await prisma.conversation.create({
      data: {
        tenantId,
        channel: 'WHATSAPP',
        status: 'OPEN',
        contactNumber: from,
        lastMessageAt: new Date(),
      },
    });
    hub.broadcast(tenantId, {
      type: 'conversation.open',
      conversation: {
        id: created.id,
        channel: 'WHATSAPP',
        status: created.status,
        contactNumber: created.contactNumber,
        createdAt: created.createdAt.toISOString(),
        lastMessageAt: created.lastMessageAt?.toISOString() ?? null,
      },
    });
    return created;
  }

  private async activeAgent(tenantId: string): Promise<(Agent & { tenant: { name: string } }) | null> {
    return prisma.agent.findFirst({ where: { tenantId, status: 'ACTIVE' }, include: { tenant: { select: { name: true } } } });
  }

  private async findCustomer(tenantId: string, phone: string): Promise<Customer | null> {
    const normalized = phone.replace(/@c\.us$/, '').trim();
    if (!normalized) return null;
    return prisma.customer.findFirst({ where: { tenantId, phone: normalized } });
  }

  /** إغلاق محادثة + تلخيص + استخراج حقول ديناميكية + تصنيف تلقائي + تحديث حالة العميل */
  async closeConversation(tenantId: string, conversationId: string): Promise<void> {
    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
    if (!conversation || conversation.status === 'CLOSED') return;

    await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'CLOSED' } });

    const dynamicFields = await prisma.dynamicField.findMany({ where: { tenantId, enabled: true } });
    if (dynamicFields.length > 0) {
      await aiService.extractFields(conversation, { dynamicFields }).catch(() => undefined);
    }
    await aiService.summarizeConversation(conversation).catch(() => undefined);

    if (conversation.customerId) {
      await aiService.classifyConversation(tenantId, conversationId, conversation.customerId).catch(() => undefined);
      await this.updateCustomerStatus(tenantId, conversation).catch(() => undefined);
    }

    hub.broadcast(tenantId, { type: 'conversation.close', conversationId });
  }

  private async updateCustomerStatus(tenantId: string, conversation: Conversation): Promise<void> {
    if (!conversation.customerId) return;

    if (conversation.channel === 'VOICE') {
      const call = await prisma.call.findFirst({ where: { conversationId: conversation.id } });
      if (call) {
        if (call.status === 'COMPLETED') {
          await prisma.customer.update({ where: { id: conversation.customerId }, data: { status: 'DONE' } });
        }
      }
    }
  }
}

function agentFallback(connection: WhatsappConnection) {
  return { kind: connection.engine };
}

export const whatsappConversationService = new WhatsAppConversationService();
