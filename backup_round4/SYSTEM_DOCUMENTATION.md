# SYSTEM_DOCUMENTATION.md
## Apollo io — Developer Handover Guide

الوثيقة المرجعية الشاملة لتسليم المشروع: المعمارية، الوحدات، قاعدة البيانات، والتشغيل في الإنتاج.
تمت كتابتها بصيغة **Developer Handover** بحيث يستطيع أي مهندس استلام الكود وفهمه وتشغيله دون تدخل.

---

## 1) نظرة عامة على النظام (System Overview)

منصة **SaaS مُدارة (Managed Service)** تُقدّم **وكيل ذكاء اصطناعي متعدد القنوات (Omnichannel)** لكل عميل (Tenant):

- **القناة الصوتية**: مكالمات صوتية آلية عبر محرك **rapidaai/voice-ai** (gRPC بثّي ثنائي الاتجاه) مع STT (Deepgram) و TTS (Azure) و VAD (Silero).
- **قناة الواتساب**: محرّكان — **الحرّ (FREE_QR)** عبر `whatsapp-web.js`، و**الرسمي (OFFICIAL_META)** عبر Meta WhatsApp Cloud API.
- **ذكاء المحادثة**: LLM (OpenAI gpt-4o-mini) مع **RAG/pgvector** و **استخراج بيانات ديناميكي (Dynamic Extraction)** وتلخيص تلقائي.
- **لوحة Live Inbox**: بثّ مباشر عبر WebSocket للتنصّت والرد و **Human Takeover** ثم إنهاء المحادثة.
- **حملات الواتساب**: حملات جماعية (Broadcast) مع **عميل مستمر (Resumable Worker)** يمنع التكرار ويعالج الأخطاء لكل هدف بشكل منفصل.

### البوابتان (Two Portals)

| | بوابة العميل (Client — TenantScope) | بوابة مالك المنصة (Super Admin) |
|---|---|---|
| واجهة | `TenantShell` + `ClientDashboard` / `AgentBuilder` / `WhatsAppSetup` / `LiveInbox` / `DynamicReports` | `SuperAdminShell` + `TenantManager` / `AdminAgentBuilder` / `AIStudio` |
| الصلاحية | مقيّدة بعميل واحد (`requireTenant`) | عبر كل العملاء (`requireSuperAdmin`) |
| ما يُدار | وكيله (اسم/حالة/صوت/سلوكيات)، نتائجه (قراءة فقط عبر `OutcomesManager`، الإنشاء/التعديل/الحذف Super Admin فقط)، محادثاته، واتسابه، تقاريره، استخراج الحقول | العملاء، مستخدمي العملاء وكلمات مرورهم، مفاتيح OpenAI لكل عميل، قوالب الوكيل والـ RAG، النتائج (Full CRUD لكل مستأجر)، الإحصائيات العالمية، Agent Builder لكل عميل |
| الخصوصية | يقرأ ويعدّل بيانات عميله فقط | `openaiApiKeyEnc`/`metaAccessTokenEnc` تُستبدل في أي استجابة بـ `openaiKeyConfigured`/`metaConfigured` (لا يُرسَل أي سر أبدًا) |

> **القاعدة الأساسية**: كل استجابة API تُخفي الأسرار المشفرة؛ `systemPrompt` للعميل يُدار حصريًا من `AIStudio` (Super Admin) ويُقصى من أي تعديل من بوابة العميل (يظهر كقيمة فارغة).

### التنقل (Navigation)
- **TenantShell**: 3 عناصر فقط — Dashboard / العملاء (Customers) / التقارير (Reports). صفحة WhatsAppSetup مخفية عن الـ Navigation ولكنها موصولة via Dashboard QR Card (نافذة منبثقة) أو via URL المباشر `/workspace/whatsapp`.
- **SuperAdminShell**: 4 عناصر — Dashboard / العملاء (Tenants) / Agent Builder / WhatsApp. صفحة AIStudio غير مرتبطة بعنصر نقل مباشر (تُفتح من TenantManager عبر `tenants/:tenantId/studio`).

---

## 2) التقنيات (Tech Stack)

### الواجهة الأمامية (Frontend) — `frontend/`
- **React 18 + TypeScript 5.5** مع **Vite 5** و **Tailwind CSS 3** و **react-router-dom 6**.
- أيقونات `lucide-react`، HTTP عبر `axios`، واجهات عربية **RTL**.
- الاختبارات: **Vitest + React Testing Library + jsdom** (تُشغَّل بـ `npm run test`).
- الاتصال المباشر عبر `src/lib/ws.ts` (LiveSocket — تمرير JWT عبر query `token`) و `src/lib/api.ts` (غلاف axios موحّد).

### الواجهة الخلفية (Backend) — `backend/`
- **Node.js + Express 4 + TypeScript 5.5** (`tsx` للتطوير، `tsc` للإنتاج).
- **Prisma 6 + PostgreSQL + pgvector** (تضمين المتجهات `vector(1536)`) + **PostgreSQL Sequences** (لتوليد `customerCode` التسلسلي الفريد).
- **gRPC**: `@grpc/grpc-js` للتواصل مع محرك **rapidaai/voice-ai** (بث ثنائي الاتجاه).
- **WebSocket**: `ws` لـ Live Inbox.
- **whatsapp-web.js** (Puppeteer/Chromium) للمحرك الحر، **Meta Graph API** عبر axios للمحرك الرسمي.
- أدوات: `multer` (رفع الملفات)، `zod`، `bcryptjs` (كلمات المرور)، `qrcode`، `pdf-parse` + `xlsx` (استخراج نصوص RAG).

### مخطط الحزم (Packages)
```
backend/
  package.json          # scripts: dev / build / start / typecheck / prisma:*
  prisma/schema.prisma  # مصدر الحقيقة لقاعدة البيانات
  prisma/migrations/    # تهجيرات SQL (تتضمن Sequence لـ customerCode)
  src/
    index.ts            # إقلاع Express + HTTP + WebSocket + seed تطويري + startCampaignWorker()
    config.ts           # كل إعدادات البيئة (dotenv)
    routes/index.ts     # خريطة API كاملة
    controllers/        # طبقة HTTP (auth, agent, call, conversation, whatsapp, report, tts, admin)
    services/           # طبقة الأعمال (ai, rag, rapida, whatsapp, takeover, campaign)
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

### 3.2 الكود الفريد للعميل (Customer Code — `customerCode`)
- **معرف فريد عالمي تسلسلي** يبدأ من **90001**، مُعرَّف عبر **PostgreSQL Sequence** في تهجيرة (`CREATE SEQUENCE "Customer_customerCode_seq" START WITH 90001`).
- يُستخدم كـ **معرف عالمي (Universal Identifier)** لـ Customer عبر جميع المستأجرين — أي عميل يحمل كودًا فريدًا لا يتكرر مهما تغيّر المستأجر.
- `customerCode Int @unique @default(autoincrement())` في Prisma schema — Prisma يعرف أن PostgreSQL يولّد القيمة تلقائيًا عبر Sequence.
- عند إنشاء عميل جديد (`createCustomer`) — لا يُرسَل `customerCode` من التطبيق؛ PostgreSQL يستخدم `DEFAULT nextval('"Customer_customerCode_seq"')` تلقائيًا.
- يُعرض في واجهة **Customer Detail** على الواجهة الأمامية كقيمة للقراءة فقط.
- **Backfill**: التهجيرة تُعيّن `setval` لإعادة توليد الـ Sequence من أعلى `customerCode` موجود لتجنّب التعارض عند تطبيقه على قاعدة تحتوي بيانات.
- **لا إعادة استخدام الأكواد**: الـ Sequence لا تتراجع عند حذف عميل.

### 3.3 استخراج البيانات الديناميكي (Dynamic Extraction)
- `DynamicField` (الحقول المراد استخراجها: الاسم، النوع، الوصف، إلزامي/اختياري) → `ExtractedValue` (القيمة + الثقة + الاقتباس الأصلي).
- **الحقل ⟵ الوكيل ⟵ محادثة**: `@@unique([tenantId, key])` و `@@unique([conversationId, fieldId])`.
- عند إغلاق المحادثة (`closeConversation`) يُنفَّذ `aiService.extractFields()` الذي يطلب من LLM **JSON صارمًا** من قيم الحقول، ويخزّن القيم ويبثّ `extraction.updated`.
- التقارير تُبنى من هذه القيم: `DynamicReports` / `reportController.reports` يدمج صفوف المكالمات (Call) مع محادثات الواتساب (WhatsApp conversation rows).

### 3.4 RAG / pgvector
- `KnowledgeDocument` (pdf / xlsx / txt) ⟵ `KnowledgeChunk` مع عمود **`embedding vector(1536)`** (OpenAI `text-embedding-3-small`).
- **Ingestion** (`RagService.ingestDocument`): استخراج نصي → تقسيم إلى أجزاء (700 حرف / 100 حرف تداخل) → تضمين دفعات (20/دفعة) → إدراج عبر `$executeRawUnsafe` (لأن Prisma لا يكتب `vector` مباشرة).
- **Retrieval** (`ragService.search`): تضمين الاستعلام ثم `ORDER BY c."embedding" <-> $3::vector LIMIT 4` مع فلترة المستأجر (والوكيل إن وُجد). **إذا لم تكن pgvector متاحة، يعمل النظام بلا RAG دون انهيار** (catch يعيد قائمة فارغة).
- **ملاحظة الأمان**: رفع/حذف المستندات حصري عبر مسارات Super Admin (`/admin/tenants/:tenantId/documents`) — لا وجود لأوامر رفع من بوابة العميل (تُدرج من بوابة AI Studio).

### 3.5 التشفير عند التخزين (Encryption at Rest)
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
- **Meta 24h Window** (نافذة 24 ساعة): قبل إرسال رسالة outbound عبر Meta API، يتحقّق النظام من وجود **رسالة inbound واردة من العميل خلال آخر 24 ساعة** على **نفس `connectionId`** الخاص باتصال `OFFICIAL_META` المستخدم في الإرسال. شروط النافذة:
  1. `tenantId` مطابق.
  2. `connectionId` مطابق (نفس اتصال OFFICIAL_META).
  3. `contactNumber` مطابق لرقم العميل.
  4. `direction = INBOUND`.
  5. `createdAt` خلال آخر 24 ساعة.
  - إذا لم تُوجد رسالة مُؤهّلة: تُ FAILED فورًا دون إرسال (سياسة Meta الإلزامية).
  - **لا تُستخدم رسالة FREE_QR أو رسالة من اتصال OFFICIAL_META مختلف**.

#### (ج) منطق حالة الواتساب (WhatsApp Status Logic)
- **رسائل الوكيل الصادرة (Outbound)**: **لا** تُغيّر `Customer.status` إلى `DONE` — المحادثة تبقى مفتوحة ما لم يُنهِها العميل.
- **رسائل العميل الواردة (Inbound)** فقط تُحدّث `Customer.status` إلى `DONE` (إشارة إلى أن العميل تلقّى الرد واكتفى).
- **القناة الصوتية (Voice Channel)**:
  - `DONE` فقط إذا `Call.status === COMPLETED` (مكالمة ناجحة ومُغلقة بشكل طبيعي).
  - `FAILED` → **لا يتغيّر** `Customer.status` — فشل عام لا يعني عدم الرد.
  - **لا يوجد مسار حاليًا يُعيّن `DID_NOT_ANSWER`** — Proto الحالية لا تحتوي على حدث صريح يعني "العميل لم يرد". الحالة تبقى كما هي.
- **_OUTCOMES (النتائج)**: مسارات `POST /outcomes` و `DELETE /outcomes/:id` مفتوحة لمستأجر (`requireTenant`) — كل عميل يدير نتائجه الخاصة.`OutcomesManager.tsx` يتيح إنشاء/حذف Outcome من بوابة العميل مباشرة.

#### (د) عامل الحملات المستمر (Resumable Campaign Worker)
- **`startCampaignWorker()`** يُستدعى عند إقلاع الخادم (`server.listen()`) ويعمل كـ **Process مستمر** في الخلفية.
- **Polling**: يتحقق كل **ثانيتين (2s)** من الحملات بحالة `RUNNING` في قاعدة البيانات.
- **Claim ذرّي (Atomic Claim)**: يستخدم `prisma.$transaction` مع `SELECT ... FOR UPDATE SKIP LOCKED` — يمنع عاملين من أخذ نفس الهدف في نفس الوقت.
- **بيانات المعالجة**: كل Target يحمل `processingStartedAt` (وقت بدء المعالجة)، `workerId` (معرّف Worker)، `attempts` (عدد المحاولات).
- **استرداد العالق (Stale Recovery)**: أي Target في `PROCESSING` تجاوز **5 دقائق** يُعاد إلى `PENDING` (إذا `attempts < 3`) أو يُحوّل إلى `FAILED` (إذا تجاوز 3 محاولات).
- **منع التداخل (Overlap Guard)**: علامة `workerRunning` تمنع بدء دورة جديدة إذا كانت السابقة ما زالت تعمل. الأخطاء لا توقف Worker.
- **معالجة خطأ لكل هدف**: إذا فشل إرسال رسالة لهدف معين، يُحدَّث حالته إلى `FAILED` ويكمل الباقي دون توقّف.
- **تحديث عدّادات الحملة**: بعد كل دفعة، يُحدَّث `sent`/`failed` من قاعدة البيانات (ليس من الذاكرة). Campaign لا تصبح `COMPLETED` إلا بعد خروج **جميع** الأهداف من `PENDING` و`PROCESSING`.

### 4.2 دورة حياة المكالمة عبر Rapida Bidi Stream (Call Lifecycle)
- **`AssistantTalk`** في `talk.proto`: `rpc AssistantTalk(stream AssistantTalkRequest) returns (stream AssistantTalkResponse)` — هذا **Bidi Streaming** (بث ثنائي الاتجاه).
- **`CreatePhoneCall`**: `rpc CreatePhoneCall(CreatePhoneCallRequest) returns (CreatePhoneCallResponse)` — هذا **Unary** (طلب واحد واستجابة واحدة) — يُعيد `rapidaConversationId` فقط.
- **`RapidaEventStreamService`** يفتح stream `AssistantTalk` بعد `CreatePhoneCall` ويستمع لأحداث **`AssistantTalkResponse`** عبر `stream.on('data', ...)`.
- **تفكيك الاستجابة**: `AssistantTalkResponse` يحتوي على `code` + `success` + `data` (oneof يحتوي على `disconnection`، `error`، `event`، إلخ). الكود يستخرج `event.data.disconnection` للحصول على نوع الفصل.
- يُحوّل **أنواع الفصل** إلى حالات مكالمة واضحة:

  | نوع الفصل (Disconnection Type) | حالة المكالمة الناتجة | تأثير على Customer.status |
  |---|---|---|
  | `TOOL` (الوكيل أنهى المحادثة) | `COMPLETED` | `DONE` |
  | `USER` (المستخدم أنهى المحادثة) | `COMPLETED` | `DONE` |
  | `IDLE_TIMEOUT` (مهلة خمول) | `FAILED` | لا يتغيّر |
  | `MAX_DURATION` (الحد الأقصى للمدة) | `FAILED` | لا يتغيّر |
  | `ERROR` (خطأ تقني) | `FAILED` | لا يتغيّر |

- عند تلقي حدث `ConversationDisconnection`:
  1. يُغلق المحادثة تلقائيًا (`closeConversation`).
  2. يُحدَّث `Call.status` حسب الجدول أعلاه.
  3. يُحدَّث `Customer.status` — فقط `DONE` عند `COMPLETED`، لا يتغيّر عند `FAILED`.
  4. يبثّ `call.status` عبر WebSocket لتحديث الواجهة لحظيًا.
- **Human Takeover**: `disconnectConversation` يرسل `DISCONNECTION_TYPE_USER` عبر الـ stream النشط (إن وُجد) أو يفتح stream جديدًا.
- **لا يوجد حاليًا حدث صريح من Rapida يعني "العميل لم يرد"** — `DID_NOT_ANSWER` غير مستخدمة.

### 4.3 توجيه رسائل الـ LLM (LLM Routing) — `AiProcessorService`
- **المفتاح والنموذج لكل مستأجر**: `openAIClientFor(tenantId)` في `lib/openai.ts` يفضّل مفتاح/نموذج العميل المشفّر في DB على إعدادات المنصة، مع كاش (cache) لكل مستأجر.
- **بناء System Prompt** (`buildSystemPrompt`): نبرة العميل (`agent.systemPrompt` — من Super Admin) + الهدف + قائمة الحقول الديناميكية المطلوب استخراجها + المعرفة المرجعية RAG (تُحقن خارجيًا، "استخدمها حرفيًا ولا تخترع").
- **generateReply**: آخر 12 رسالة كسياق، `max_tokens=500, temperature=0.7`، حفظ الرد كـ `ConversationMessage` وبثّه.
- **summarizeConversation / extractFields**: عند الإغلاق — تلخيص 3–5 نقاط بالعربية وتخزينه في `Conversation.summary`، واستخراج JSON للحقول مع `response_format: json_object` وتخزين `ExtractedValue` وبثّ `extraction.updated`.
- **الإرسال البشري (Human Takeover)**: `takeoverService` يوقف AI؛ `sendHumanReply` يرسل مباشرة عبر المحرك (بدون LLM) ويُسجَّل الدور `HUMAN`؛ وفي المكالمات الصوتية يستدعي `RapidaProxyService.disconnectConversation(rapidaConversationId)` لقطع بث rapida.

### 4.4 WebSocket في Live Inbox — `ws/hub.ts`
- نقطة اتصال واحدة: **`ws://<host>/ws/inbox?token=<JWT>`** — تُتحقق في مرحلة `upgrade` (401 بلا توكن، 403 بلا مستأجر).
- **عزل تام بالمستأجر**: خريطة `Map<tenantId, Set<Socket>>`؛ أي `hub.broadcast(tenantId, event)` لا يصل إلا لعملاء نفس العميل.
- **نبض الحياة**: ping/pong كل 30 ثانية لفصل الاتصالات الميتة.
- **الأحداث الخارجة (server→client)**: `conversation.open`، `conversation.close`، `call.status`، `transcript.partial/final`، `ai.summary`، `extraction.updated`، `message.new`، `takeover.start/end`.
- **الأحداث الداخلة (client→server)** عبر `setMessageHandler(tenantId, userId, msg)`:
  - `takeover.request` → `takeoverConversation` (تسجيل البشري + AuditLog + بث).
  - `message.send` → إرسال رد بشري عبر المحرك المناسب.
- **الرابطة الأمامية**: `LiveInbox` / `OmnichannelLiveInbox` تستمع لهذه الأحداث وتعرض المحادثات والترانزكريبت والملخصات واستخراج الحقول لحظيًا، مع زر Human Takeover وزر "إنهاء المحادثة" (`POST /conversations/:id/close`).

### 4.5 خريطة API (الملخص)
```
Auth:            POST /auth/dev-login | /auth/login | GET /auth/me
Super Admin:     CRUD tenants | users (list/create/reset-password) | ai-keys (GET/PUT)
                 agent + fields | prompt | documents (upload/delete) | /admin/metrics
                 agents/:agentId (GET/PUT full update — AdminAgentBuilder)
Tenant scope:    /agents/current (GET/PUT) | /dynamic-fields | /documents (GET)
                 /outcomes (GET/POST/DELETE) | /customers (GET/DELETE/upload/outcome)
                 /calls | /conversations (+ /:id/messages|extractions|close|takeover)
                 /campaigns | /upload-batches
                 /tts/preview | /tts/cache-stats | /tenants/me/usage | /reports
WhatsApp:        /whatsapp/connections (CRUD + status + disconnect) | /whatsapp/campaigns
                 GET/POST /whatsapp/webhook (Meta)
```

### 4.6 Frontend → Backend API Mapping (كامل)
| الصفحة | الملف | Endpoint(s) |
|---|---|---|
| **LoginScreen** | `auth/LoginScreen.tsx` | `POST /auth/login`, `GET /auth/me`, `POST /auth/dev-login` |
| **ClientDashboard** | `client/ClientDashboard.tsx` | `GET /dashboard`, `POST /calls`, `GET /whatsapp/connections`, `GET /whatsapp/connections/:id/status` |
| **AgentBuilder** (Admin) | `admin/AdminAgentBuilder.tsx` → `agent/AgentBuilder.tsx` | `GET /admin/tenants` (tenant selector), `GET /admin/tenants/:id/agent`, `PUT /admin/tenants/:id/agents/:agentId` |
| **AgentBuilder** (Tenant) | `agent/AgentBuilder.tsx` | `GET /agents/current`, `PUT /agents/:id` |
| **VoicePicker** | `agent/VoicePicker.tsx` | `POST /tts/preview` |
| **WhatsAppSetup** | `whatsapp/WhatsAppSetup.tsx` | `GET /whatsapp/connections`, `POST /whatsapp/connections`, `GET /whatsapp/connections/:id/status`, `POST /whatsapp/connections/:id/disconnect`, `PUT /whatsapp/connections/:id` |
| **CustomersPage** | `customers/CustomersPage.tsx` | `GET /customers`, `GET /outcomes`, `POST /customers/upload`, `DELETE /customers`, `POST /campaigns` |
| **CustomerDetailPage** | `customers/CustomerDetailPage.tsx` | `GET /customers/:id`, `GET /customers/:id/conversations` |
| **OutcomesManager** | `customers/OutcomesManager.tsx` | `GET /outcomes`, `POST /outcomes`, `DELETE /outcomes/:id` |
| **DynamicReports** | `reports/DynamicReports.tsx` | `GET /dynamic-fields`, `GET /reports` |
| **OmnichannelLiveInbox** | `inbox/OmnichannelLiveInbox.tsx` | `GET /conversations`, `GET /whatsapp/connections`, `POST /conversations/:id/close` |
| **TenantManager** (Admin) | `admin/TenantManager.tsx` | `GET /admin/tenants`, `POST /admin/tenants`, `PATCH /admin/tenants/:id`, `POST /admin/tenants/:id/users`, `GET /admin/tenants/:id/users`, `PUT /admin/tenants/:id/users/:userId/password` |
| **AIStudio** (Admin) | `admin/AIStudio.tsx` | `GET /admin/tenants/:id/agent`, `PUT /admin/tenants/:id/agents/:agentId/prompt`, `PUT /admin/tenants/:id/fields`, `POST /admin/tenants/:id/documents`, `DELETE /admin/tenants/:id/documents/:docId`, `GET/PUT /admin/tenants/:id/ai-keys` |
| **AdminDashboard** | `admin/AdminDashboard.tsx` | `GET /admin/metrics` |

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
> **مهم**: التهجيرات تُدار عبر `prisma/migrations/`. تضمن التهجيرة الجديدة حقول `customerCode` + Sequence.
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
cd backend  && npm run test           # vitest run — اختبارات backend الشاملة
cd frontend && npm run typecheck
cd frontend && npm run test           # vitest run (14 اختبارًا: AgentBuilder + AIStudio + OmnichannelLiveInbox)
cd frontend && npm run build          # تثبت سلامة البناء النهائي
```

#### اختبارات Backend (Backend Test Suite)
تتبع **48 اختبارًا** باستخدام **vitest**. **تصنيف الاختبارات:**

| التصنيف | العدد | وصف |
|---|---|---|
| **Source Inspection** | 15 | يقرأ ملفات أو يبحث عن نصوص في Source Code (schema, migration, routes) |
| **Unit Test** | 33 | منطق في الذاكرة أو استدعاء mock functions مباشرة |
| **Controller Test** | 0 | لا يوجد استدعاء فعلي لأي Controller |
| **API Test** | 0 | لا يوجد HTTP request فعلي (لا supertest) |
| **Database Integration** | 0 | Prisma محاكاة بالكامل — لا PostgreSQL حقيقي |

> ⚠️ **تنبيه**: الاختبارات تتحقق من **البنية والصياغة** فقط (هل المسار موجود؟ هل Schema صحيح؟). لا تتحقق من **التشغيل الفعلي** على قاعدة بيانات حقيقية أو Controller مع Request/Response حقيقي.

| الوحدة | عدد الاختبارات | ما يُختبَر |
|---|---|---|
| **Migration SQL** | 3 | صحة SQL التهجيرة، وجود Sequence، وجود حقل `customerCode` |
| **customerCode** | 4 | تسلسل فريد، عدم التعارض عبر المستأجرين، backfill للبيانات الموجودة، صيغة الكود |
| **WhatsApp Status Logic** | 4 | Outbound لا يُغيّر status، Inbound يُعيده إلى DONE، صوت COMPLETED → DONE، صوت FAILED لا يتغيّر |
| **Meta 24h Window** | 10 | رسالة بدون inbound مرفوضة، رسالة مع inbound أقدم من 24 ساعة مرفوضة، رسالة مع inbound حديثة مقبولة، رسالة FREE_QR مرفوضة، رسالة من connection مختلفة مرفوضة، رسالة من tenant مختلف مرفوضة، رسالة مع connectionId مختلف مرفوضة (×3 إضافية) |
| **Campaign Worker** | 7 | poll كل ثانيتين، claimPendingTargets ذري مع FOR UPDATE SKIP LOCKED، error per-target لا يوقف الحملة، عدّادات Campaign من قاعدة البيانات، stale recovery، max attempts 3، overlap guard |
| **TenantOutcome Isolation** | 2 | عزل النتائج بين المستأجرين، عدم تسريب بيانات عبر المستأجرين |
| **TenantOutcome Admin Permissions** | 13 | Tenant قراءة فقط، لا POST/PATCH/DELETE في Tenant scope، Admin routes محمية بـ requireSuperAdmin، GET/POST/PATCH/DELETE موجودة، حذف آمن مع فحص الاستخدام، Schema safety |
| **Call Lifecycle Mapping** | 7 | ERROR → FAILED لا يتغيّر Customer، TOOL → COMPLETED → DONE، USER → COMPLETED → DONE، IDLE_TIMEOUT لا يتغيّر، MAX_DURATION لا يتغيّر، FAILED لا يتغيّر، لا يوجد DID_NOT_ANSWER |

```bash
cd backend && npm run test           # تشغيل جميع اختبارات backend (48 اختبار)
```

---

### Frontend ↔ Backend Mapping

| Frontend Route | Frontend Component | Backend API Endpoint | Auth |
|---|---|---|---|
| `/` | `LoginPage` | `POST /auth/login` | Public |
| `/admin` | `AdminDashboard` | `GET /admin/metrics` | SuperAdmin |
| `/admin/tenants` | `TenantManager` | `GET /admin/tenants` | SuperAdmin |
| `/admin/tenants/:id/studio` | `AIStudio` | `GET/PUT /admin/tenants/:id/agent` | SuperAdmin |
| `/admin/agent` | `AdminAgentBuilder` → `AgentBuilder` | `GET /admin/tenants/:id/agent` + `PUT /admin/tenants/:id/agents/:aid` | SuperAdmin |
| `/admin/tenants/:id/outcomes` | `TenantManager` (expandable) → `OutcomesManager` | `GET/POST/PATCH/DELETE /admin/tenants/:id/outcomes` | SuperAdmin |
| `/workspace/dashboard` | `ClientDashboard` | `GET /dashboard` | Tenant |
| `/workspace/customers` | `CustomersPage` | `GET /customers` + `GET /outcomes` (read-only) | Tenant |
| `/workspace/agent` | `AgentBuilder` | `GET /agent` + `PUT /agent` | Tenant |
| `/workspace/reports` | `DynamicReports` | `GET /reports` | Tenant |
| `/workspace/inbox` | `OmnichannelLiveInbox` | WebSocket `/ws` | Tenant |
| `/workspace/whatsapp` | `WhatsAppSetup` | `GET/POST/DELETE /whatsapp/connections` | Tenant |

---

## القيود الفعلية والمعروفة

1. **لم يتم اختبار Meta WhatsApp Cloud API حقيقيًا** — الاختبارات تستخدم mocks.
2. **لم يتم اختبار Rapida gRPC حقيقيًا** — الاتصال يعتمد على إعدادات البيئة.
3. **لم يتم اختبار OpenAI LLM حقيقيًا** — الاستجابات محاكاة في الاختبارات.
4. **لم يتم اختبار Migration على PostgreSQL حقيقي** — لا يوجد Docker أو PostgreSQL محلي.
5. **`DID_NOT_ANSWER` غير مستخدمة حاليًا** — Proto الحالية لا تحتوي على حدث صريح يعني "العميل لم يرد".
6. **`assistantConversationId` في `listenForCallEvents`** — يُرسل initialization للخادم لربط الـ stream بالمكالمة. إذا رفض الخادم الربط، لن تصل أحداث المكالمة (يحتاج اختبار على بيئة حقيقة).
7. **`disconnectConversation`** — يرسل `DISCONNECTION_TYPE_USER` عبر الـ stream النشط أو يفتح stream جديدًا. لا يوجد ضمان من Proto أن الخادم يقبل stream جديدًا لنفس المحادثة.
8. **QR Code في Dashboard** — بطاقة Dashboard تعرض نافذة منبثقة (Modal) تتحقق من حالة الاتصال وتعرض رمز QR مع polling كل 3 ثوانٍ. عند CONNECTED يتوقف الـ polling. عند عدم وجود اتصال يعرض رسالة توجيه إلى صفحة WhatsAppSetup.
9. **AgentBuilder في بوابة Super Admin** — يستخدم `AdminAgentBuilder` الذي يضيف قائمة منسدلة لاختيار المستأجر، ثم يستدعي `AgentBuilder` بـ `adminTenantId` ليستخدم مسارات `/admin/tenants/:id/agents/:agentId` بدلاً من مسارات المستأجر.
10. **TenantOutcome صلاحيات** — المستأجرون يقرأون نتائجهم فقط (`GET /outcomes`). الإنشاء/التعديل/الحذف عبر مسارات Admin فقط مع `requireSuperAdmin`. لا يمكن حذف نتائج مرتبطة بعملاء (يُعاد 409 `OUTCOME_IN_USE`).

### إصلاحات هذه الجولة (Round 3)

| Bug | الوصف | الملف | الإصلاح |
|---|---|---|---|
| **Meta Webhook Routing** | مسارات `/whatsapp/webhook` كانت بعد `requireTenant` → Meta تتلقى 401 | `routes/index.ts` | نُقلت المسارات قبل `requireTenant` |
| **API Key Leak** | `openaiApiKeyEnc` يظهر في استجابة `/auth/login` و `/auth/me` | `authController.ts` | تمت إضافة `sanitizeTenant()` للاحتفاظ بالأسرار |
| **Chat Order** | رسائل الدردشة تظهر الأحدث أولاً بدلاً من الترتيب الزمني | `customerController.ts` | تغيير `orderBy: 'desc'` إلى `orderBy: 'asc'` |

---

## ملاحظات أمنية حاسمة
1. **لا ترفع** `.env`، `*.pem`، `storage/` إلى أي مستودع (راجع `.gitignore` في الجذر).
2. `SECRET_KEY` و `JWT_SECRET` قيمتان منفصلتان — لا تُشاطَر أو تُطبع.
3. أي استجابة API تعرض الأسرار كأعلام (`metaConfigured`/`openaiKeyConfigured`) وليس كقيم.
4. مسارات `/admin/*` محمية بـ `requireSuperAdmin`؛ مسارات العميل محمية بـ `requireTenant` (فرض العزل).
5. رسائل حملات القوالب الرسمية فقط عبر المحرك الرسمي؛ المحرك الحر **Inbound only** (سياسة Anti-Ban).
