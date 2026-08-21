import axios from 'axios';
import type { BroadcastCampaign, WhatsappConnection } from '@prisma/client';
import { config } from '../../config';
import { ApiError } from '../../lib/errors';
import { decryptSecret } from '../../lib/crypto';
import { prisma } from '../../lib/prisma';
import { whatsappConversationService, type WhatsAppSendEngine } from './WhatsAppConversationService';

/**
 * المحرك الرسمي (Meta WhatsApp Cloud API).
 * - Webhook Endpoint آمن (Verify Token)
 * - إرسال النصوص
 * - حملات القوالب الرسمية (sendTemplateBroadcast) — لا يُسمح بها للمحرك الحر
 */
export class MetaOfficialService {
  private base(phoneNumberId: string): string {
    return `https://graph.facebook.com/${config.metaGraphVersion}/${phoneNumberId}`;
  }

  verifyWebhook(mode: string | undefined, token: string | undefined, challenge: string | undefined): string {
    if (mode === 'subscribe' && token === config.metaWebhookVerifyToken) {
      return challenge ?? '';
    }
    throw new ApiError(403, 'توكن تحقق غير صالح', 'WEBHOOK_VERIFY_FAILED');
  }

  async handleWebhook(payload: unknown): Promise<void> {
    const body = payload as {
      entry?: { changes?: { value?: { messages?: { from: string; text?: { body?: string }; type?: string }[]; metadata?: { phone_number_id?: string } } }[] }[];
    };    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const connection = await prisma.whatsappConnection.findFirst({ where: { metaPhoneNumberId: phoneNumberId } });
        if (!connection) continue;
        await this.processMessages(connection, value.messages ?? []);
      }
    }
  }

  private async processMessages(connection: WhatsappConnection, messages: { from: string; text?: { body?: string }; type?: string }[]): Promise<void> {
    const engine: WhatsAppSendEngine = {
      kind: 'meta',
      send: async (to, text) => this.sendText(connection, to, text),
    };
    for (const msg of messages) {
      if (msg.type !== 'text' || !msg.text?.body?.trim()) continue;
      const from = msg.from.replace('@c.us', '');
      await whatsappConversationService.handleInboundText(connection, from, msg.text.body, engine).catch((err) => {
        console.error('meta inbound error:', err);
        void engine.send(from, 'عذرًا، حدث خلل مؤقت. الرجاء المحاولة لاحقًا.').catch(() => undefined);
      });
    }
  }

  async sendText(connection: WhatsappConnection, to: string, text: string): Promise<string> {
    if (!connection.metaPhoneNumberId || !connection.metaAccessTokenEnc) {
      throw new ApiError(400, 'الاتصال الرسمي غير مكتمل الإعداد', 'META_NOT_CONFIGURED');
    }
    const token = decryptSecret(connection.metaAccessTokenEnc);
    try {
      const res = await axios.post(
        `${this.base(connection.metaPhoneNumberId)}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: text },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return res.data?.messages?.[0]?.id ?? String(Date.now());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('auth')) throw new ApiError(503, 'مفتاح Meta غير صالح', 'META_AUTH_FAILED');
      if (msg.includes('429') || msg.includes('rate')) throw new ApiError(429, 'تم تجاوز حد استدعاءات Meta', 'META_RATE_LIMITED');
      throw new ApiError(502, 'فشل إرسال رسالة واتساب عبر Meta', 'META_SEND_FAILED');
    }
  }

  /**
   * حملة القوالب الرسمية (Template Messages) — تُسمح فقط عبر المحرك الرسمي.
   * المعاملات تُرسل كأجزاء (components) لكل مستلم حسب metaTemplateJson.
   */
  async sendTemplateBroadcast(connection: WhatsappConnection, campaign: BroadcastCampaign, recipients: { to: string; variables?: string[] }[]): Promise<void> {
    if (connection.engine !== 'OFFICIAL_META') {
      throw new ApiError(400, 'حملات القوالب متاحة فقط عبر المحرك الرسمي', 'TEMPLATE_NOT_ALLOWED');
    }
    if (campaign.status !== 'DRAFT') {
      throw new ApiError(400, 'الحملة في حالة غير قابلة للبدء', 'CAMPAIGN_NOT_DRAFT');
    }
    if (!connection.metaPhoneNumberId || !connection.metaAccessTokenEnc) {
      throw new ApiError(400, 'الاتصال الرسمي غير مكتمل الإعداد', 'META_NOT_CONFIGURED');
    }
    const token = decryptSecret(connection.metaAccessTokenEnc);
    const templateName = campaign.templateName;
    const templateJson = (campaign.metaTemplateJson ?? {}) as { language?: string; components?: unknown[] };

    await prisma.broadcastCampaign.update({
      where: { id: campaign.id },
      data: { status: 'RUNNING', totalRecipients: recipients.length, startedAt: new Date() },
    });

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      try {
        const components = recipient.variables?.length
          ? [{ type: 'body', parameters: recipient.variables.map((v) => ({ type: 'text', text: v })) }]
          : (templateJson.components ?? []);
        await axios.post(
          `${this.base(connection.metaPhoneNumberId)}/messages`,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient.to,
            type: 'template',
            template: { name: templateName, language: { code: (templateJson.language as string) ?? 'ar' }, components },
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        sent++;
        await prisma.whatsappMessage.create({
          data: {
            tenantId: connection.tenantId,
            connectionId: connection.id,
            direction: 'OUTBOUND',
            body: templateName,
            templateName,
            status: 'SENT',
            sentAt: new Date(),
          },
        }).catch(() => undefined);
      } catch (err) {
        failed++;
        console.error('broadcast template failed:', (err as Error).message);
      }
      // تهدئة بين الرسائل
      await new Promise((r) => setTimeout(r, 500));
    }

    await prisma.broadcastCampaign.update({
      where: { id: campaign.id },
      data: { status: sent === 0 ? 'FAILED' : 'COMPLETED', sentCount: sent, failedCount: failed, finishedAt: new Date() },
    });
  }
}

export const metaOfficialService = new MetaOfficialService();
