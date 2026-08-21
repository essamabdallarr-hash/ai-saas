import type { Agent, Conversation, ConversationMessage, Customer, DynamicField, TenantOutcome } from '@prisma/client';
import { ApiError } from '../../lib/errors';
import { openAIClientFor } from '../../lib/openai';
import { prisma } from '../../lib/prisma';
import { hub } from '../../ws/hub';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * معالجة الردود عبر OpenAI gpt-4o-mini.
 * يبني System Prompt من: prompt الوكيل (المخفي من Super Admin) + أهدافه
 * + تعليمات الحقول الديناميكية + سياق RAG (يُحقن خارجياً قبل الاستدعاء)
 * + بيانات العميل (إن وُجدت).
 * المفتاح/النموذج يُحسمان لكل مستأجر (مفتاحه المشفر في DB يسبق مفتاح المنصة).
 */
export class AiProcessorService {

  buildSystemPrompt(agent: Agent, dynamicFields: DynamicField[], ragContext: string[], customer?: Customer | null): string {
    const fieldsSection =
      dynamicFields.length > 0
        ? dynamicFields
            .map(
              (f) =>
                `- ${f.key} (${f.type})${f.description ? ` — اسأل عنه: "${f.description}"` : ''}${f.required ? ' [إلزامي]' : ''}`,
            )
            .join('\n')
        : 'لا توجد حقول محددة — استخرج أي معلومات مفيدة برفق.';

    const ragSection =
      ragContext.length > 0
        ? `\n\n## المعرفة المرجعية (من ملفات العميل — استخدمها حرفيًا، لا تخترع):\n${ragContext
            .map((c, i) => `[${i + 1}] ${c}`)
            .join('\n')}`
        : '';

    const customerSection = buildCustomerSection(customer);

    return `أنت "خادم مبيعات ذكي" تعمل لصالح عميلك. اتبع النبرة والتعليمات التالية بدقة.

${agent.systemPrompt ?? 'كن محترفًا وودودًا، وتحدث بالعربية، وأجب باختصار ووضوح.'}

## الهدف
${agent.objective || 'مساعدة العميل وإتمام المهمة بنجاح.'}
${customerSection}

## الحقول التي يجب استخراجها أثناء المحادثة
${fieldsSection}

## قواعد الرد
- ردّ على ما قاله العميل فقط، لا تكرر المقدمة.
- إذا احتجت معلومة غير موجودة في المعرفة المرجعية، اطلبها من العميل مباشرة.
- حافظ على الأسلوب المحدد ولا تخرج عن الدور.${ragSection}`;
  }

  /**
   * توليد رد لمحادثة واتساب أو نصية مع حفظ السجل والبث المباشر.
   * @returns نص الرد
   */
  async generateReply(args: {
    tenantId: string;
    agent: Agent;
    conversation: Conversation;
    history: ConversationMessage[];
    ragContext: string[];
    dynamicFields: DynamicField[];
    customer?: Customer | null;
  }): Promise<string> {
    const { client, llmModel } = await openAIClientFor(args.tenantId);
    const system = this.buildSystemPrompt(args.agent, args.dynamicFields, args.ragContext, args.customer);
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...args.history.slice(-12).map((m) => ({
        role: (m.role === 'USER' ? 'user' : m.role === 'ASSISTANT' ? 'assistant' : m.role === 'HUMAN' ? 'user' : 'system') as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ];

    const completion = await client.chat.completions.create({
      model: llmModel,
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('auth')) throw new ApiError(503, 'مفتاح OpenAI غير صالح', 'AI_AUTH_FAILED');
      if (msg.includes('429') || msg.includes('rate')) throw new ApiError(429, 'تم تجاوز حد الاستدعاءات', 'AI_RATE_LIMITED');
      throw new ApiError(502, 'فشل الاتصال بـ OpenAI', 'AI_UNAVAILABLE');
    });

    const reply: string = completion.choices?.[0]?.message?.content ?? '';
    if (!reply.trim()) throw new ApiError(502, 'الـ LLM أرجع ردًا فارغًا', 'EMPTY_LLM_REPLY');

    await prisma.conversationMessage.create({
      data: {
        tenantId: args.tenantId,
        conversationId: args.conversation.id,
        role: 'ASSISTANT',
        content: reply,
        provider: 'openai',
        meta: { model: llmModel },
      },
    });

    return reply;
  }

  /** تلخيص محادثة منتهية (للـ ai.summary في لوحة LiveInbox). */
  async summarizeConversation(conversation: Conversation): Promise<string> {
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    if (messages.length === 0) return 'لا توجد رسائل كافية للتلخيص.';
    const { client, llmModel } = await openAIClientFor(conversation.tenantId);

    const transcript = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
    const completion = await client.chat.completions.create({
      model: llmModel,
      messages: [
        {
          role: 'system',
          content:
            'لخّص محادثة العميل التالية في 3-5 نقاط مختصرة بالعربية: نتائج المكالمة، القرارات، المتابعات المطلوبة، ومدى جاهزية العميل.',
        },
        { role: 'user', content: transcript },
      ],
      max_tokens: 300,
      temperature: 0.3,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('auth')) throw new ApiError(503, 'مفتاح OpenAI غير صالح', 'AI_AUTH_FAILED');
      if (msg.includes('429') || msg.includes('rate')) throw new ApiError(429, 'تم تجاوز حد الاستدعاءات', 'AI_RATE_LIMITED');
      throw new ApiError(502, 'فشل الاتصال بـ OpenAI', 'AI_UNAVAILABLE');
    });
    const summary: string = completion.choices?.[0]?.message?.content ?? '';
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { summary: summary || null },
    });
    const call = await prisma.call.findFirst({ where: { conversationId: conversation.id } });
    if (call) {
      hub.broadcast(conversation.tenantId, { type: 'ai.summary', callId: call.id, summary });
    }
    return summary;
  }
  /** استخراج الحقول الديناميكية في نهاية المحادثة وتخزينها + بثها. */
  async extractFields(conversation: Conversation, opts: { dynamicFields: DynamicField[] }): Promise<Record<string, string>> {
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    if (messages.length === 0 || opts.dynamicFields.length === 0) return {};

    const { client, llmModel } = await openAIClientFor(conversation.tenantId);
    const transcript = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
    const completion = await client.chat.completions.create({
      model: llmModel,
      messages: [
        {
          role: 'system',
          content: `استخرج من المحادثة قيم الحقول التالية وأرجع JSON فقط بدون أي نص إضافي:
${opts.dynamicFields.map((f) => `"${f.key}": <قيمة نصية أو null>`).join('\n')}`,
        },
        { role: 'user', content: transcript },
      ],
      max_tokens: 400,
      temperature: 0,
      response_format: { type: 'json_object' },
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('auth')) throw new ApiError(503, 'مفتاح OpenAI غير صالح', 'AI_AUTH_FAILED');
      if (msg.includes('429') || msg.includes('rate')) throw new ApiError(429, 'تم تجاوز حد الاستدعاءات', 'AI_RATE_LIMITED');
      throw new ApiError(502, 'فشل الاتصال بـ OpenAI', 'AI_UNAVAILABLE');
    });

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');
    } catch {
      parsed = {};
    }

    const values: Record<string, string> = {};
    for (const field of opts.dynamicFields) {
      const raw = parsed[field.key];
      if (raw === null || raw === undefined) continue;
      const value = String(raw);
      await prisma.extractedValue.upsert({
        where: { conversationId_fieldId: { conversationId: conversation.id, fieldId: field.id } },
        create: { tenantId: conversation.tenantId, conversationId: conversation.id, fieldId: field.id, value },
        update: { value },
      });
      values[field.key] = value;
    }

    const call = await prisma.call.findFirst({ where: { conversationId: conversation.id } });
    if (call) {
      hub.broadcast(conversation.tenantId, {
        type: 'extraction.updated',
        callId: call.id,
        extractedData: values,
      });
    }
    return values;
  }

  /**
   * التصنيف التلقائي: يطلب من LLM اختيار نتيجة واحدة من TenantOutcome النشطة.
   * يُستدعى بعد انتهاء المحادثة (صوت أو واتساب).
   * - إذا لم تكن هناك نتائج معرفة → لا يصنف، لا يعتبر خطأ.
   * - إذا أعاد LLM نتيجة غير موجودة → لا يحفظ، يحافظ على النتيجة السابقة.
   */
  async classifyConversation(
    tenantId: string,
    conversationId: string,
    customerId: string,
  ): Promise<void> {
    const outcomes = await prisma.tenantOutcome.findMany({
      where: { tenantId },
      orderBy: { position: 'asc' },
    });
    if (outcomes.length === 0) return;

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    if (messages.length === 0) return;

    const { client, llmModel } = await openAIClientFor(tenantId);
    const transcript = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    const outcomeList = outcomes.map((o) => `- ${o.label} (id: ${o.id})`).join('\n');

    const completion = await client.chat.completions.create({
      model: llmModel,
      messages: [
        {
          role: 'system',
          content: `أنت مصنف محادثات عملاء. اختر نتيجة واحدة فقط من القائمة التالية:${outcomeList}

أرجع JSON فقط:${'\n'}{ "outcomeId": "<id>" }

إذا لم تتمكن من التحديد بدقة، أرجع:${'\n'}{ "outcomeId": null }

لا تخترع نتائج جديدة. اختر فقط من القائمة.`,
        },
        { role: 'user', content: transcript },
      ],
      max_tokens: 100,
      temperature: 0,
      response_format: { type: 'json_object' },
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('auth')) throw new ApiError(503, 'مفتاح OpenAI غير صالح', 'AI_AUTH_FAILED');
      if (msg.includes('429') || msg.includes('rate')) throw new ApiError(429, 'تم تجاوز حد الاستدعاءات', 'AI_RATE_LIMITED');
      throw new ApiError(502, 'فشل الاتصال بـ OpenAI', 'AI_UNAVAILABLE');
    });

    let parsed: { outcomeId?: string | null } = {};
    try {
      parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');
    } catch {
      return;
    }

    const outcomeId = parsed.outcomeId;
    if (!outcomeId || typeof outcomeId !== 'string') return;

    const validOutcome = await prisma.tenantOutcome.findFirst({
      where: { id: outcomeId, tenantId },
    });
    if (!validOutcome) return;

    await prisma.customer.update({
      where: { id: customerId },
      data: { outcomeId: validOutcome.id },
    });
  }
}

function buildCustomerSection(customer?: Customer | null): string {
  if (!customer) return '';
  const parts: string[] = [];
  parts.push(`اسم العميل: ${customer.name}`);
  if (customer.phone) parts.push(`رقم الهاتف: ${customer.phone}`);
  if (customer.email) parts.push(`البريد الإلكتروني: ${customer.email}`);
  if (customer.customData && typeof customer.customData === 'object' && Object.keys(customer.customData).length > 0) {
    const entries = Object.entries(customer.customData as Record<string, unknown>);
    for (const [k, v] of entries) {
      if (v !== null && v !== undefined && String(v).trim()) {
        parts.push(`${k}: ${String(v)}`);
      }
    }
  }
  if (parts.length === 0) return '';
  return `\n\n## بيانات العميل الحالية\n${parts.join('\n')}`;
}

export const aiService = new AiProcessorService();
