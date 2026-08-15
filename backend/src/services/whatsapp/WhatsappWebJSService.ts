import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { Client, LocalAuth } from 'whatsapp-web.js';
import type { WhatsappConnection } from '@prisma/client';
import { config } from '../../config';
import { ApiError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { AntiBanLogic } from './AntiBanLogic';
import { whatsappConversationService, type WhatsAppSendEngine } from './WhatsAppConversationService';

/**
 * المحرك الحر (whatsapp-web.js + QR).
 * القواعد الصارمة لمنع الحظر:
 * - Inbound فقط (بدون Outbound Broadcasts — outboundBlocked إجباري)
 * - تأخير عشوائي 3-5 ثوانٍ قبل الرد + حالة "يكتب الآن" + Spintax
 */
export class WhatsappWebJSService {
  private clients = new Map<string, { client: Client; ban: AntiBanLogic; engine: WhatsAppSendEngine }>();

  private sessionPath(connection: WhatsappConnection): string {
    return path.join(config.storageDir, 'wa-sessions', connection.tenantId, connection.id);
  }

  private banFor(connection: WhatsappConnection): AntiBanLogic {
    return new AntiBanLogic({
      typingDelayMs: connection.typingDelayMs,
      spintaxEnabled: connection.spintaxEnabled,
      outboundBlocked: connection.outboundBlocked,
    });
  }

  async ensureClient(connection: WhatsappConnection): Promise<Client> {
    const existing = this.clients.get(connection.id);
    if (existing) return existing.client;

    if (connection.engine !== 'FREE_QR') {
      throw new ApiError(400, 'هذا الاتصال ليس محركًا حرًا (web.js)', 'WRONG_ENGINE');
    }

    fs.mkdirSync(this.sessionPath(connection), { recursive: true });

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: this.sessionPath(connection) }),
      puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    });

    const ban = this.banFor(connection);
    const engine: WhatsAppSendEngine = {
      kind: 'webjs',
      send: async (to, text) => {
        const expanded = ban.expandSpintax(text);
        const result = await client.sendMessage(to, expanded);
        return result.id?.id ?? String(result.id);
      },
      simulateTyping: async (to) => {
        // تأخير بشري 3-5 ثوانٍ + حالة "يكتب الآن" قبل الإرسال (منع الحظر)
        await ban.waitHuman();
        try {
          const chatId = to.includes('@') ? to : `${to}@c.us`;
          const chat = await client.getChatById(chatId);
          await chat.sendStateTyping();
          await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
        } catch {
          /* تجاهل إن تعذر تحديد المحادثة */
        }
      },
    };

    // — الأحداث —
    client.on('qr', async (qr) => {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
        await prisma.whatsappConnection.update({
          where: { id: connection.id },
          data: { status: 'QR_PENDING', qrCode: dataUrl, qrExpiresAt: new Date(Date.now() + 5 * 60_000), error: null },
        });
      } catch (err) {
        await prisma.whatsappConnection.update({
          where: { id: connection.id },
          data: { status: 'BROKEN', error: `فشل توليد QR: ${(err as Error).message}` },
        });
      }
    });

    client.on('authenticated', async () => {
      await prisma.whatsappConnection.update({
        where: { id: connection.id },
        data: { qrCode: null, qrExpiresAt: null, error: null },
      });
    });

    client.on('ready', async () => {
      await prisma.whatsappConnection.update({
        where: { id: connection.id },
        data: { status: 'CONNECTED', lastHeartbeatAt: new Date(), error: null },
      });
    });

    client.on('auth_failure', async (msg) => {
      await prisma.whatsappConnection.update({
        where: { id: connection.id },
        data: { status: 'BROKEN', error: `فشل المصادقة: ${msg}` },
      });
    });

    client.on('disconnected', async (reason) => {
      await prisma.whatsappConnection.update({
        where: { id: connection.id },
        data: { status: 'DISCONNECTED', error: `انقطع الاتصال: ${reason}` },
      });
      this.clients.delete(connection.id);
    });

    client.on('message_create', async (msg) => {
      // Inbound فقط + تجاهل الرسائل من جهازنا والجروبات والوسائط
      if (msg.fromMe) return;
      if (msg.from.includes('@g.us') || msg.from.includes('@broadcast')) return;
      if (msg.hasMedia) return;
      const body = (msg.body ?? '').trim();
      if (!body) return;

      await whatsappConversationService.handleInboundText(connection, msg.from, body, engine).catch((err) => {
        console.error('webjs inbound error:', err);
        void engine.send(msg.from, 'عذرًا، حدث خلل مؤقت. الرجاء المحاولة لاحقًا.').catch(() => undefined);
      });
    });

    this.clients.set(connection.id, { client, ban, engine });

    // لا ننتظر جاهزية المتصفح — نرجع QR فورًا من الأحداث
    try {
      void client.initialize().catch(async (err) => {
        await prisma.whatsappConnection.update({
          where: { id: connection.id },
          data: {
            status: 'BROKEN',
            error: `تعذّر تشغيل المتصفح (يتطلب تثبيت Chromium): ${(err as Error).message}`,
          },
        });
        this.clients.delete(connection.id);
      });
    } catch {
      /* initialize يرمي فقط داخل الـ promise */
    }

    return client;
  }

  engineFor(connection: WhatsappConnection): WhatsAppSendEngine | null {
    return this.clients.get(connection.id)?.engine ?? null;
  }

  async disconnect(connection: WhatsappConnection): Promise<void> {
    const entry = this.clients.get(connection.id);
    if (!entry) return;
    try {
      await entry.client.logout();
    } catch {
      /* تجاهل */
    }
    try {
      await entry.client.destroy();
    } catch {
      /* تجاهل */
    }
    this.clients.delete(connection.id);
    await prisma.whatsappConnection.update({
      where: { id: connection.id },
      data: { status: 'DISCONNECTED', qrCode: null },
    });
  }
}

export const whatsappWebJSService = new WhatsappWebJSService();
