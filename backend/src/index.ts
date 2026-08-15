import http from 'node:http';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { config } from './config';
import { prisma } from './lib/prisma';
import { hashPassword } from './lib/password';
import { errorHandler, notFound } from './lib/errors';
import { router } from './routes';
import { hub } from './ws/hub';
import { takeoverConversation } from './services/takeoverService';
import { whatsappConversationService, type WhatsAppSendEngine } from './services/whatsapp/WhatsAppConversationService';
import { whatsappWebJSService } from './services/whatsapp/WhatsappWebJSService';
import { metaOfficialService } from './services/whatsapp/MetaOfficialService';

async function resolveWhatsAppEngine(tenantId: string): Promise<WhatsAppSendEngine | null> {
  const connection = await prisma.whatsappConnection.findFirst({ where: { tenantId } });
  if (!connection) return null;
  if (connection.engine === 'FREE_QR') {
    const engine = whatsappWebJSService.engineFor(connection);
    if (engine) return engine;
  }
  if (connection.engine === 'OFFICIAL_META') {
    return {
      kind: 'meta' as const,
      send: (to, text) => metaOfficialService.sendText(connection, to, text),
    };
  }
  return null;
}

async function seedDevData(): Promise<void> {
  if (!config.devAuthEnabled) return;
  try {
    const tenant = await prisma.tenant.upsert({
      where: { slug: 'demo' },
      create: { name: 'شركة التجربة', slug: 'demo' },
      update: {},
    });
    await prisma.tierLimit.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id }, update: {} });
    await prisma.featureToggle.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id }, update: {} });
    await prisma.user.upsert({
      where: { email: 'admin@demo.local' },
      create: {
        email: 'admin@demo.local',
        name: 'مدير التجربة',
        role: 'CLIENT_ADMIN',
        tenantId: tenant.id,
        active: true,
        passwordHash: await hashPassword('Admin@123'),
      },
      update: { tenantId: tenant.id, passwordHash: await hashPassword('Admin@123') },
    });

    await prisma.user.upsert({
      where: { email: 'owner@demo.local' },
      create: {
        email: 'owner@demo.local',
        name: 'مالك المنصة',
        role: 'SUPER_ADMIN',
        active: true,
        passwordHash: await hashPassword('Owner@123'),
      },
      update: { role: 'SUPER_ADMIN', passwordHash: await hashPassword('Owner@123') },
    });

    const fieldCount = await prisma.dynamicField.count({ where: { tenantId: tenant.id } });
    if (fieldCount === 0) {
      const agent = await prisma.agent.findFirst({ where: { tenantId: tenant.id } });
      await prisma.dynamicField.createMany({
        data: [
          { tenantId: tenant.id, agentId: agent?.id ?? null, key: 'budget', label: 'الميزانية', type: 'CURRENCY', description: 'القيمة المالية القصوى التي يقبلها العميل', position: 0 },
          { tenantId: tenant.id, agentId: agent?.id ?? null, key: 'followup_date', label: 'موعد المتابعة', type: 'DATE', description: 'الموعد المقترح لمعاودة الاتصال', position: 1 },
          { tenantId: tenant.id, agentId: agent?.id ?? null, key: 'interested', label: 'جاهز للشراء', type: 'BOOLEAN', description: 'هل أبدى العميل اهتمامًا فعليًا؟', position: 2 },
        ],
      });
    }

    console.log('[dev] تم تجهيز بيانات التجربة');
  } catch (err) {
    console.warn('[dev] قاعدة البيانات غير متاحة:', (err as Error).message);
  }
}

// إنشاء التطبيق وتصديره لـ Vercel
const app = express();
app.use(cors({ origin: config.corsOrigin.split(','), credentials: true }));
app.use(express.json({ limit: '10mb' }));

const ttsDir = path.join(config.storageDir, 'tts');
app.use('/tts', express.static(ttsDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'universal-ai-agent-backend', ts: new Date().toISOString() });
});

app.use('/api', router);
app.use(notFound);
app.use(errorHandler);

// تشغيل الـ WebSocket والـ Seed فقط إذا كنا نشغل الكود محلياً وليس على Vercel
if (process.env.NODE_ENV !== 'production') {
  void seedDevData().then(() => {
    const server = http.createServer(app);
    hub.attach(server);
    hub.setMessageHandler(async (tenantId, userId, msg) => {
       // معالجة الرسائل
    });
    server.listen(config.port, () => console.log(`Backend running on port ${config.port}`));
  });
}

// تصدير التطبيق لـ Vercel
export default app;
