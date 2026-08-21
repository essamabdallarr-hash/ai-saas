# Apollo io (Multi-Tenant Omnichannel)

منصة SaaS متعددة المستأجرين تجمع بين المكالمات الصوتية الآلية (Voice AI) ومحادثات
الواتساب (WhatsApp) في واجهة موحدة (Omnichannel)، مع محرك صوتي مبني على
`rapidaai/voice-ai` (Go + gRPC) كـ Core Engine.

## البنية (Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│  React + Vite + Tailwind (Vercel)                           │
│  بوابة الإدارة المركزية (Super Admin) / مساحة عمل العميل     │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST (HTTPS) + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│  Node.js (Express) — API Gateway + SaaS Logic               │
│  • Tenant Isolation / Billing Limits                        │
│  • Prompt Studio (System Prompts مخفية)                    │
│  • Smart TTS Caching (Azure TTS)                            │
│  • WhatsApp Dual Engine (web.js QR / Meta Cloud API)        │
│  • Proxy إلى rapidaai + OpenAI                              │
│  • RAG (Embeddings + pgvector)                              │
└──────────────┬──────────────────────────────┬───────────────┘
               │ gRPC                         │ REST/WS
        ┌──────▼──────┐                ┌──────▼──────┐
        │ rapidaai     │                │ OpenAI      │
        │ voice-ai     │                │ (gpt-4o-mini)│
        │ (Go core)    │                └─────────────┘
        └──────┬──────┘
               │ Silero VAD محليًا (فلترة الصمت لتقليل STT)
               │ Deepgram (STT) / Azure (TTS) / Twilio أو Vonage (Telephony)
```

- **Frontend**: `saas/frontend` — React.js + Tailwind CSS (Vercel-ready).
- **Backend**: `saas/backend` — Node.js (Express) + Prisma + PostgreSQL.
- **Voice Core**: مستودع `rapidaai/voice-ai` (يُستخدم كـ submodule/service مستقل).
- **قاعدة البيانات**: PostgreSQL + امتداد `pgvector` لتخزين الـ Embeddings.

## الأهداف التكلفية

| البند | الهدف |
|---|---|
| STT (Deepgram + Silero VAD محلي) | تقليل الدقائق المُرسلة للـ API |
| LLM (GPT-4o-mini) | $0.0015/1K input، $0.6/1M output |
| TTS (Azure + Smart Caching للجمل المتكررة) | تخزين الصوت في السيرفر وإعادة استخدامه |
| **إجمالي الهدف** | **≈ $0.01–$0.015 للدقيقة** |

## هيكل المشروع

```
saas/
├── README.md
├── backend/                 # Node.js + Prisma + PostgreSQL
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── protos/              # [Step 3] إعادة بناء دقيقة لـ talk_api (gRPC)
│   │   ├── talk.proto       #   TalkService + AssistantTalk + CreatePhoneCall
│   │   ├── common.proto     #   AssistantDefinition / Error / AssistantConversation
│   │   └── google/protobuf/ #   نسخ مصغرة من any + timestamp (للتوافق السلكي)
│   ├── prisma/
│   │   ├── schema.prisma    # [Step 1] Multi-Tenancy + Data Extraction
│   │   └── seed.ts          # بيانات تجربة (tenant=demo / admin@demo.local)
│   └── src/
│       ├── index.ts         # [Step 3] Express + WebSocket Hub + seeding
│       ├── config.ts        # إعدادات البيئة
│       ├── lib/             # prisma / auth (JWT) / errors / crypto (AES-256-GCM)
│       ├── ws/hub.ts        # [Step 3] ناقل أحداث Live Inbox لكل Tenant
│       ├── services/
│       │   ├── rapida/      # [Step 3] RapidaProxyService (gRPC + دمج Prompt/RAG)
│       │   ├── ai/          # [Step 3] AiProcessorService (gpt-4o-mini) + TtsSmartCache
│       │   ├── rag/         # [Step 3] RagService (PDF/Excel/TXT → pgvector)
│       │   ├── whatsapp/    # [Step 3] Dual Engine: WebJS (QR+AntiBan) + Meta
│       │   └── takeoverService.ts  # Human Takeover (REST + WebSocket)
│       ├── controllers/     # auth / agent / call / conversation / document
│       │                    #  whatsapp / reports / tts / admin (Super Admin)
│       └── routes/index.ts  # [Step 3] كل المسارات + Meta Webhook
└── frontend/                # React + Vite + Tailwind
    └── src/
        ├── lib/             # api client + WebSocket (مع token) + types
        ├── components/      # layout + ui
        └── features/
            ├── agent/       # [Step 2] AgentBuilder.tsx
            ├── inbox/       # [Step 2] LiveInbox.tsx
            └── reports/     # [Step 2] DynamicReports.tsx
```

## التشغيل (بعد تثبيت Node.js 20+)

### 1) قاعدة البيانات (PostgreSQL + pgvector)

```bash
# على خادم Postgres المحلي:
CREATE DATABASE universal_ai_agent;
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2) Backend

```bash
cd saas/backend
cp .env.example .env        # ثم عدّل المفاتيح
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed          # بيانات تجربة: admin@demo.local
npm run dev                 # http://localhost:4000  |  ws://localhost:4000/ws/inbox
```

### 3) Frontend

```bash
cd saas/frontend
npm install
npm run dev                 # http://localhost:5173 (الـ Vite يوجّه /api و /ws إلى 4000)
```

### تسجيل الدخول للتجربة

`POST /api/auth/dev-login` بجسم `{ "email": "admin@demo.local" }` (وضع التطوير).
بوابات Super Admin: `/api/admin/tenants`, `/api/admin/metrics` — تتطلب مستخدمًا بدور `SUPER_ADMIN`.

## ملاحظات معمارية مهمة

1. **Tenant Isolation**: كل الجداول التابعة لمستأجر تحمل `tenantId` مع
   `@@index([tenantId])`، والتنفيذ الصارم على مستوى طبقة الخدمة (أو PostgreSQL RLS
   لاحقًا). لا توجد مشاركة بيانات بين المستأجرين.
2. **Smart TTS Caching**: جدول `tts_cache` يخزن تجزئة النص (hash) + مسار الصوت.
   الجمل المتكررة تُعاد دون استدعاء Azure.
3. **Prompt Studio مخفي**: `systemPrompt` في جدول `Agent` لا يُقرأ بواجهة العميل،
   بل يُدمج في الـ Backend عند إنشاء الجلسة مع `rapidaai`.
4. **WhatsApp Anti-Ban** (المحرك الحر QR): ردود على الرسائل الواردة فقط، تأخير
   كتابة 3–5 ثوانٍ، وSpintax لتنويع النص. الحظر على الحملات الجماعية إجباري.
