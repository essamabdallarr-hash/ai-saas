# SYSTEM_DOCUMENTATION.md
## Universal AI Agent SaaS — Developer Handover Guide

الوثيقة المرجعية الشاملة لتسليم المشروع: المعمارية، الوحدات، قاعدة البيانات، والتشغيل في الإنتاج.
تمت كتابتها بصيغة **Developer Handover** بحيث يستطيع أي مهندس استلام الكود وفهمه وتشغيله دون تدخل.

---

## 1) نظرة عامة على النظام (System Overview)

منصة **SaaS مُدارة (Managed Service)** تُقدّم **وكيل ذكاء اصطناعي متعدد القنوات (Omnichannel)** لكل عميل (Tenant):

- **القناة الصوتية**: مكالمات صوتية آلية عبر محرك **rapidaai/voice-ai** (gRPC بثّي ثنائي الاتجاه) مع STT (Deepgram) و TTS (Azure) و VAD (Silero).
- **قناة الواتساب**: محرّكان — **الحرّ (FREE_QR)** عبر `whatsapp-web.js`، و**الرسمي (OFFICIAL_META)** عبر Meta WhatsApp Cloud API.
- **ذكاء المحادثة**: LLM (OpenAI gpt-4o-mini) مع **RAG/pgvector** و **استخراج بيانات ديناميكي (Dynamic Extraction)** وتلخيص تلقائي.
- **لوحة Live Inbox**: بثّ مباشر عبر WebSocket للتنصّت والرد و **Human Takeover** ثم إنهاء المحادثة.

### البوابتان (Two Portals)

| | بوابة العميل (Client — TenantScope) | بوابة مالك المنصة (Super Admin) |
|---|---|---|
| واجهة | `TenantShell` + `ClientDashboard` / `AgentBuilder` / `WhatsAppSetup` / `LiveInbox` / `DynamicReports` | `SuperAdminShell` + `TenantManager` / `AIStudio` |
| الصلاحية | مقيّدة بعميل واحد (`requireTenant`) | عبر كل العملاء (`requireSuperAdmin`) |
| ما يُدار | وكيله، محادثاته، واتسابه، تقاريره، استخراج الحقول | العملاء، مستخدمي العملاء وكلمات مرورهم، مفاتيح OpenAI لكل عميل، قوالب الوكيل والـ RAG، الإحصائيات العالمية |
| الخصوصية | يقرأ ويعدّل بيانات عميله فقط | `openaiApiKeyEnc`/`metaAccessTokenEnc` تُستبدل في أي استجابة بـ `openaiKeyConfigured`/`metaConfigured` (لا يُرسَل أي سر أبدًا) |

> **القاعدة الأساسية**: كل استجابة API تُخفي الأسرار المشفرة؛ `systemPrompt` للعميل يُدار حصريًا من `AIStudio` (Super Admin) ويُقصى من أي تعديل من بوابة العميل (يظهر كقيمة فارغة).

---

## 2) التقنيات (Tech Stack)

### الواجهة الأمامية (Frontend) — `frontend/`
- **React 18 + TypeScript 5.5** مع **Vite 5** و **Tailwind CSS 3** و **react-router-dom 6**.
- أيقونات `lucide-react`، HTTP عبر `axios`، واجهات عربية **RTL**.
- الاختبارات: **Vitest + React Testing Library + jsdom** (تُشغَّل بـ `npm run test`).
- الاتصال المباشر عبر `src/lib/ws.ts` (LiveSocket — تمرير JWT عبر query `token`) و `src/lib/api.ts` (غلاف axios موحّد).

### الواجهة الخلفية (Backend) — `backend/`
- **Node.js + Express 4 + TypeScript 5.5** (`tsx` للتطوير، `tsc` للإنتاج).
- **Prisma 6 + PostgreSQL + pgvector** (تضمين المتجهات `vector(1536)`).
- **gRPC**: `@grpc/grpc-js` للتواصل مع محرك **rapidaai/voice-ai** (بث ثنائي الاتجاه).
- **WebSocket**: `ws` لـ Live Inbox.
- **whatsapp-web.js** (Puppeteer/Chromium) للمحرك الحر، **Meta Graph API** عبر axios للمحرك الرسمي.
- أدوات: `multer` (رفع الملفات)، `zod`، `bcryptjs` (كلمات المرور)، `qrcode`، `pdf-parse` + `xlsx` (استخراج نصوص RAG).

### مخطط الحزم (Packages)
```
backend/
  package.json          # scripts: dev / build / start / typecheck / prisma:*
  prisma/schema.prisma  # مصدر الحقيقة لقاعدة البيانات
  src/
    index.ts            # إقلاع Express + HTTP + WebSocket + seed تطويري
    config.ts           # كل إعدادات البيئة (dotenv)
    routes/index.ts     # خريطة API كاملة
    controllers/        # طبقة HTTP (auth, agent, call, conversation, whatsapp, report, tts, admin)
    services/           # طبقة الأعمال (ai, rag, rapida, whatsapp, takeover)
    lib/                # auth, crypto, openai, prisma, password, errors
    ws/hub.ts           # ناقل WebSocket المعزول بالمستأجر
frontend/
  src/
    App.tsx             # التوجيه + الحماية بالدور
    features/           # agent, admin, auth, client, inbox, reports, whatsapp
    components/         # layout (SuperAdminShell/TenantShell) + ui (بطاقات داكنة)
    lib/                # api.ts, ws.ts, types.ts, useAuth.ts
```

---

## 3) هندسة قاعدة البيانات (DB & Multi-Tenancy)

### 3.1 العزل (Tenant Isolation)
- كل نماذج الأعمال تحمل `tenantId` فهرسيًا (`@@index([tenantId])`)، والعلاقات كلها `onDelete: Cascade`.
- **وسيط `requireTenant`** (`src/lib/auth.ts`) يُحسم المستأجر من JWT ويفرضه على كل مسارات الـ Tenant scope؛ أي استعلام داخل النطاق يبدأ دائمًا بـ `where: { tenantId }`.
- `AuditLog` و `UsageLedger` مرتبطان أيضًا بالعميل لتدقيق إداري وفوترة.
- قابلية توسيع مستقبلية بـ PostgreSQL RLS (مذكورة في schema) — العزل الحالي تطبيقي (Application-Level) عبر `requireTenant` على المسارات والاستعلامات.

### 3.2 استخراج البيانات الديناميكي (Dynamic Extraction)
- `DynamicField` (الحقول المراد استخراجها: الاسم، النوع، الوصف، إلزامي/اختياري) → `ExtractedValue` (القيمة + الثقة + الاقتباس الأصلي).
- **الحقل ⟵ الوكيل ⟵ محادثة**: `@@unique([tenantId, key])` و `@@unique([conversationId, fieldId])`.
- عند إغلاق المحادثة (`closeConversation`) يُنفَّذ `aiService.extractFields()` الذي يطلب من LLM **JSON صارمًا** من قيم الحقول، ويخزّن القيم ويبثّ `extraction.updated`.
- التقارير تُبنى من هذه القيم: `DynamicReports` / `reportController.reports` يدمج صفوف المكالمات (Call) مع محادثات الواتساب (WhatsApp conversation rows).

### 3.3 RAG / pgvector
- `KnowledgeDocument` (pdf / xlsx / txt) ⟵ `KnowledgeChunk` مع عمود **`embedding vector(1536)`** (OpenAI `text-embedding-3-small`).
- **Ingestion** (`RagService.ingestDocument`): استخراج نصي → تقسيم إلى أجزاء (700 حرف / 100 حرف تداخل) → تضمين دفعات (20/دفعة) → إدراج عبر `$executeRawUnsafe` (لأن Prisma لا يكتب `vector` مباشرة).
- **Retrieval** (`ragService.search`): تضمين الاستعلام ثم `ORDER BY c."embedding" <-> $3::vector LIMIT 4` مع فلترة المستأجر (والوكيل إن وُجد). **إذا لم تكن pgvector متاحة، يعمل النظام بلا RAG دون انهيار** (catch يعيد قائمة فارغة).
- **ملاحظة الأمان**: رفع/حذف المستندات حصري عبر مسارات Super Admin (`/admin/tenants/:tenantId/documents`) — لا وجود لأوامر رفع من بوابة العميل (تُدرج من بوابة AI Studio).

### 3.4 التشفير عند التخزين (Encryption at Rest)
- `lib/crypto.ts`: **AES-256-GCM**، مفتاح مشتق بـ SHA-256 من `SECRET_KEY` (env، مع fallback لـ `JWT_SECRET` — يُنصح بتثبيت قيمة مستقلة حتى يمكن تدوير JWT دون كسر الأسرار).
- تنسيق الحمولة: `iv:tag:ciphertext` (Base64).
- الأسرار المشفرة: `Tenant.openaiApiKeyEnc`، `Tenant.openaiModel` (نموذج LLM للعميل)، `WhatsappConnection.metaAccessTokenEnc`.
- أي استجابة واجهة تحوّل الحقول المشفرة إلى علم (`openaiKeyConfigured` / `metaConfigured`).

---

## 4) الوحدات الأساسية (Core Modules)

### 4.1 محرك الواتساب المزدوج + Anti-Ban
محرّكان يحققان **واجهة موحدة** `WhatsAppSendEngine { kind: 'webjs' | 'meta'; send(to, text); simulateTyping? }` — والنطاق المشترك `WhatsAppConversationService` يعمل مع كليهما دون تغيير.

```
اتصال وارد (webjs/meta)
   └─ ensureConversation (محادثة مفتوحة أو إنشاء + بث conversation.open)
   └─ حفظ رسالة العميل + بث message.new
   └─ الوكيل النشط للعميل
   └─ ragService.search(tenant, query, agent, 4)  → سياق مرجعي
   └─ حقول ديناميكية مفعّلة + آخر 20 رسالة (history)
   └─ aiService.generateReply(...)                → نص الرد
   └─ مكافحة الحظر ثم engine.send + حفظ وبث message.new
```

#### (أ) المحرك الحر — `WhatsappWebJSService` (FREE_QR)
- `whatsapp-web.js` + `LocalAuth`، جلسة مخزنة تحت `storage/wa-sessions/{tenantId}/{connectionId}`.
- QR يُولَّد كـ Data URL ويُخزَّن (صلاحية 5 دقائق) مع تحديث الحالة `QR_PENDING → CONNECTED`.
- **قواعد Anti-Ban الإلزامية** (`AntiBanLogic`):
  - **Inbound فقط**: `outboundBlocked` إجباري — لا إرسال جماعي خارجي من المحرك الحر.
  - تأخير بشري عشوائي 3–5 ثوانٍ (±20%) قبل كل رد.
  - حالة **"يكتب الآن"** (`sendStateTyping`) قبل الإرسال.
  - **Spintax** `{كيف حالك|كيفك}` لتنويع صياغة الرسائل المتكررة.
- تجاهل رسائل الجروبات/البث/الوسائط/الرسائل الصادرة.

#### (ب) المحرك الرسمي — `MetaOfficialService` (OFFICIAL_META)
- **Webhook**: `GET /whatsapp/webhook` تحقّق (verify token) + `POST /whatsapp/webhook` استقبال الرسائل (رُبطت برقم الهاتف `metaPhoneNumberId`).
- **إرسال نص** عبر `graph.facebook.com/{version}/{phoneNumberId}/messages` بـ Bearer token مفكوك من `metaAccessTokenEnc`.
- **حملات القوالب (Template Broadcasts)**: مسموحة **فقط** للمحرك الرسمي؛ تُرسل مع متغيّرات (components) وتهدئة 500ms بين الرسائل، ويُحدَّث حالة الحملة (`sent===0 → FAILED` وإلا `COMPLETED`).

### 4.2 توجيه رسائل الـ LLM (LLM Routing) — `AiProcessorService`
- **المفتاح والنموذج لكل مستأجر**: `openAIClientFor(tenantId)` في `lib/openai.ts` يفضّل مفتاح/نموذج العميل المشفّر في DB على إعدادات المنصة، مع كاش (cache) لكل مستأجر.
- **بناء System Prompt** (`buildSystemPrompt`): نبرة العميل (`agent.systemPrompt` — من Super Admin) + الهدف + قائمة الحقول الديناميكية المطلوب استخراجها + المعرفة المرجعية RAG (تُحقن خارجيًا، "استخدمها حرفيًا ولا تخترع").
- **generateReply**: آخر 12 رسالة كسياق، `max_tokens=500, temperature=0.7`، حفظ الرد كـ `ConversationMessage` وبثّه.
- **summarizeConversation / extractFields**: عند الإغلاق — تلخيص 3–5 نقاط بالعربية وتخزينه في `Conversation.summary`، واستخراج JSON للحقول مع `response_format: json_object` وتخزين `ExtractedValue` وبثّ `extraction.updated`.
- **الإرسال البشري (Human Takeover)**: `takeoverService` يوقف AI؛ `sendHumanReply` يرسل مباشرة عبر المحرك (بدون LLM) ويُسجَّل الدور `HUMAN`؛ وفي المكالمات الصوتية يستدعي `RapidaProxyService.disconnectConversation(rapidaConversationId)` لقطع بث rapida.

### 4.3 WebSocket في Live Inbox — `ws/hub.ts`
- نقطة اتصال واحدة: **`ws://<host>/ws/inbox?token=<JWT>`** — تُتحقق في مرحلة `upgrade` (401 بلا توكن، 403 بلا مستأجر).
- **عزل تام بالمستأجر**: خريطة `Map<tenantId, Set<Socket>>`؛ أي `hub.broadcast(tenantId, event)` لا يصل إلا لعملاء نفس العميل.
- **نبض الحياة**: ping/pong كل 30 ثانية لفصل الاتصالات الميتة.
- **الأحداث الخارجة (server→client)**: `conversation.open`، `conversation.close`، `call.status`، `transcript.partial/final`، `ai.summary`، `extraction.updated`، `message.new`، `takeover.start/end`.
- **الأحداث الداخلة (client→server)** عبر `setMessageHandler(tenantId, userId, msg)`:
  - `takeover.request` → `takeoverConversation` (تسجيل البشري + AuditLog + بث).
  - `message.send` → إرسال رد بشري عبر المحرك المناسب.
- **الرابطة الأمامية**: `LiveInbox` / `OmnichannelLiveInbox` تستمع لهذه الأحداث وتعرض المحادثات والترانزكريبت والملخصات واستخراج الحقول لحظيًا، مع زر Human Takeover وزر "إنهاء المحادثة" (`POST /conversations/:id/close`).

### 4.4 خريطة API (الملخص)
```
Auth:            POST /auth/dev-login | /auth/login | GET /auth/me
Super Admin:     CRUD tenants | users (list/create/reset-password) | ai-keys (GET/PUT)
                 agent + fields | prompt | documents (upload/delete) | /admin/metrics
Tenant scope:    /agents/current (GET/PUT) | /dynamic-fields | /documents (GET)
                 /calls | /conversations (+ /:id/messages|extractions|close|takeover)
                 /tts/preview | /tts/cache-stats | /tenants/me/usage | /reports
WhatsApp:        /whatsapp/connections (CRUD + status + disconnect) | /whatsapp/campaigns
                 GET/POST /whatsapp/webhook (Meta)
```

---

## 5) دليل التشغيل (Deployment Guide)

### 5.1 المتطلبات المسبقة
- **Node.js 18+** (طُوّر على v24) و **npm**.
- **PostgreSQL 14+** مع امتداد **pgvector**:
  ```sql
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- **Chromium** لـ Puppeteer (مطلوب لتشغيل المحرك الحر عبر `whatsapp-web.js`). على سيرفر بلا واجهة استخدم `--no-sandbox` (مُضاف في الكود).
- محرك **rapidaai/voice-ai** متاح على gRPC (للقناة الصوتية) — اختياري إن لم تكن القناة الصوتية مطلوبة.

### 5.2 الإعداد (Config)
من `backend/.env.example` أنشئ `backend/.env`:
```
DATABASE_URL="postgresql://USER:PASS@HOST:5432/universal_ai_agent"
PORT=4000
JWT_SECRET="<قيمة عشوائية طويلة>"
SECRET_KEY="<قيمة عشوائية قوية ومستقلة>"   # تشفير أسرار العملاء (لا تُغيَّر بعد إدخال أسرار)
CORS_ORIGIN="http://localhost:5173"
DEV_AUTH_ENABLED="false"                   # يُفعَّل فقط للتطوير المحلي
RAPIDA_ASSISTANT_GRPC_URL="<grpc-host:port>"
RAPIDA_ASSISTANT_ID=1
OPENAI_API_KEY="<مفتاح المنصة الافتراضي>"
OPENAI_LLM_MODEL="gpt-4o-mini"
OPENAI_EMBED_MODEL="text-embedding-3-small"
DEEPGRAM_API_KEY=""
AZURE_SPEECH_KEY=""
AZURE_SPEECH_REGION="eastus"
META_GRAPH_VERSION="v21.0"
META_WEBHOOK_VERIFY_TOKEN="verify-me"
STORAGE_DIR="./storage"
```

### 5.3 التثبيت والبناء
```bash
# الواجهة الخلفية
cd backend
npm install
npx prisma generate        # توليد Prisma Client من schema

# الواجهة الأمامية
cd ../frontend
npm install
```

### 5.4 قاعدة البيانات — Migrate & Seed
> **مهم**: المجلد `migrations` غير مضمّن حاليًا (لم تُنشأ تهجيرة بعد). أول مرة تُنشئها من بيئة تطويرية:
```bash
cd backend
npx prisma migrate dev --name init    # ينشئ migrations/ ويطبّقها (يتطلب shadow DB للـ dev)
npx prisma db seed                    # (اختياري) حسابات تجريبية: owner@demo.local / Owner@123
```
في **الإنتاج** بعد ذلك (أو عند تطبيق تهجيرات جديدة):
```bash
npx prisma migrate deploy             # يطبّق الـ migrations على قاعدة الإنتاج (بلا تفاعل)
npx prisma db seed                    # إن كانت قاعدة الإنتاج جديدة وتريد بيانات أولية
```
> بديل متقدم عند الحاجة لتهجيرة يدوية على قاعدة قائمة: استخدم `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` لتوليد SQL ثم نفّذه.

### 5.5 تشغيل الخادم
```bash
# تطويري
cd backend && npm run dev             # tsx watch — على http://localhost:4000

# إنتاجي
cd backend && npm run build           # → dist/
NODE_ENV=production npm run start     # node dist/index.js
```
نقاط التحقق بعد الإقلاع:
- `GET http://localhost:4000/health` → `{ ok: true, service: 'universal-ai-agent-backend' }`.
- WebSocket: `ws://localhost:4000/ws/inbox?token=<JWT>`.
- يتم **seed تلقائي تطويري** عند الإقلاع إذا `DEV_AUTH_ENABLED=true` (عميل `demo` + حسابا الإدارة + حقول استخراج افتراضية).

### 5.6 الواجهة الأمامية — بناء ورفع
```bash
cd frontend
npm run build                         # tsc && vite build → dist/
npm run preview                       # اختبار محلي للبناء
```
- انشر محتوى `frontend/dist` على **nginx/Caddy** مع توجيه `/api` و `/ws` إلى `localhost:4000` (أو فعّل متغيرات `VITE_API_URL` / `VITE_WS_URL`).
- من الأفضل تخديم الواجهة والـ Backend خلف وكيل واحد لتجنّب CORS؛ `CORS_ORIGIN` يدعم عدة نطاقات مفصولة بفاصلة.

### 5.7 عملية تشغيل الإنتاج (Process Manager)
```bash
# مثال مع pm2
npm i -g pm2
cd backend && pm2 start dist/index.js --name saas-api
pm2 save && pm2 startup
```
- شبّه في ذلك بـ `systemd` إن كانت البيئة لا تدعم pm2.
- **انسخ احتياطيًا** `storage/` (جلسات واتساب + TTS cache + الملفات) وقاعدة البيانات؛ فقدان `SECRET_KEY` أو `storage/wa-sessions` يعني فقدان الأسرار المشفرة أو إعادة تسجيل الواتساب.

### 5.8 التحقق قبل النشر (CI/Dev)
```bash
cd backend  && npm run typecheck      # tsc --noEmit
cd frontend && npm run typecheck
cd frontend && npm run test           # vitest run (14+ اختبارًا)
cd frontend && npm run build          # تثبت سلامة البناء النهائي
```

---

## ملاحظات أمنية حاسمة
1. **لا ترفع** `.env`، `*.pem`، `storage/` إلى أي مستودع (راجع `.gitignore` في الجذر).
2. `SECRET_KEY` و `JWT_SECRET` قيمتان منفصلتان — لا تُشاطَر أو تُطبع.
3. أي استجابة API تعرض الأسرار كأعلام (`metaConfigured`/`openaiKeyConfigured`) وليس كقيم.
4. مسارات `/admin/*` محمية بـ `requireSuperAdmin`؛ مسارات العميل محمية بـ `requireTenant` (فرض العزل).
5. رسائل حملات القوالب الرسمية فقط عبر المحرك الرسمي؛ المحرك الحر **Inbound only** (سياسة Anti-Ban).
