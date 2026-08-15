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

    // حساب مالك المنصة (Super Admin) — بوابة الإدارة المركزية
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

    // حقول استخراج افتراضية للوكيل التجريبي (تظهر في AI Studio و DynamicReports)
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

    console.log('[dev] تم تجهيز بيانات التجربة (tenant=demo / admin@demo.local / owner@demo.local)');
    const agentCount = await prisma.agent.count({ where: { tenantId: tenant.id } });
    if (agentCount === 0) {
      await prisma.agent.create({
        data: {
          tenantId: tenant.id,
          name: 'وكيل المبيعات التجريبي',
          status: 'ACTIVE',
          objective: 'استقبال العميل، التعرف على احتياجه، واستخراج الميزانية وموعد المتابعة.',
          voiceId: 'ar-EG-SalmaNeural',
          systemPrompt: 'أنت وكيل مبيعات ذكي يتحدث العربية بطلاقة. ابدأ بتحية ودية، واسأل عن احتياج العميل، ثم اقترح الحل.',
        },
      });
    }
    console.log('[dev] تم تجهيز بيانات التجربة (tenant=demo / admin@demo.local)');
  } catch (err) {
    console.warn('[dev] قاعدة البيانات غير متاحة الآن — نفّذ prisma migrate dev ثم أعد التشغيل. السبب:', (err as Error).message);
  }
}

async function main(): Promise<void> {
  await seedDevData();

  const app = express();
  app.use(cors({ origin: config.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '10mb' }));

  // ملفات TTS المُولّدة + الصوتيات
  const ttsDir = path.join(config.storageDir, 'tts');
  app.use('/tts', express.static(ttsDir));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'universal-ai-agent-backend', ts: new Date().toISOString() });
  });

  app.use('/api', router);
  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);
  hub.attach(server);
  hub.setMessageHandler(async (tenantId, userId, msg) => {
    try {
      if (msg.type === 'takeover.request' && msg.conversationId) {
        await takeoverConversation(tenantId, msg.conversationId, { userId: userId ?? 'anonymous' });
      } else if (msg.type === 'message.send' && msg.conversationId && typeof msg.text === 'string') {
        const engine = await resolveWhatsAppEngine(tenantId);
        if (!engine) return;
        await whatsappConversationService.sendHumanReply(tenantId, msg.conversationId, msg.text, engine);
      }
    } catch (err) {
      console.error('[ws] معالجة رسالة فشلت:', (err as Error).message);
    }
  });

  server.listen(config.port, () => {
    console.log(`[server] Universal AI Agent SaaS backend يعمل على http://localhost:${config.port}`);
    console.log(`[server] WebSocket Live Inbox: ws://localhost:${config.port}/ws/inbox`);
    console.log(`[server] Rapida gRPC: ${config.rapidaGrpcUrl || 'غير مهيأ (RAPIDA_ASSISTANT_GRPC_URL)'}`);
  });

  const shutdown = async () => {
    console.log('\n[server] إيقاف التشغيل...');
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
