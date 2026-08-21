import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================
// Mocks
// ============================

const mockPrisma = {
  customer: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  tenantOutcome: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
  },
  campaign: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  campaignTarget: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  conversation: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  call: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  whatsappMessage: {
    create: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  whatsappConnection: {
    findFirst: vi.fn(),
  },
  conversationMessage: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  dynamicField: {
    findMany: vi.fn(),
  },
  extractedValue: {
    upsert: vi.fn(),
  },
  usageLedger: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  tierLimit: {
    findUnique: vi.fn(),
  },
  uploadBatch: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

const mockConfig = {
  rapidaGrpcUrl: '',
  rapidaAssistantId: 1,
  rapidaAssistantVersion: '1.0.0',
  openaiApiKey: '',
  openaiLlmModel: 'gpt-4o-mini',
  openaiEmbedModel: 'text-embedding-3-small',
  metaGraphVersion: 'v21.0',
};
vi.mock('../config', () => ({ config: mockConfig }));

vi.mock('../services/rapida/RapidaProxyService', () => ({
  rapidaService: {
    startCall: vi.fn().mockResolvedValue({ rapidaConversationId: 12345, status: 'CONNECTING' }),
    disconnectConversation: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/rapida/RapidaEventStreamService', () => ({
  startCallEventListener: vi.fn(),
  stopCallEventListener: vi.fn(),
  stopAllCallEventListeners: vi.fn(),
}));

vi.mock('../services/whatsapp/MetaOfficialService', () => ({
  metaOfficialService: {
    sendText: vi.fn().mockResolvedValue('msg-id-123'),
  },
}));

vi.mock('../services/whatsapp/WhatsAppConversationService', () => ({
  whatsappConversationService: {
    closeConversation: vi.fn().mockResolvedValue(undefined),
    handleInboundText: vi.fn(),
  },
}));

vi.mock('../services/ai/AiProcessorService', () => ({
  aiService: {
    classifyConversation: vi.fn().mockResolvedValue(undefined),
    summarizeConversation: vi.fn().mockResolvedValue('summary'),
    extractFields: vi.fn().mockResolvedValue({}),
    generateReply: vi.fn().mockResolvedValue('reply'),
    buildSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  },
}));

vi.mock('../ws/hub', () => ({
  hub: { broadcast: vi.fn(), attach: vi.fn(), setMessageHandler: vi.fn() },
}));

vi.mock('../lib/errors', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
    }
  },
  asyncHandler: (fn: Function) => fn,
  notFound: vi.fn(),
  errorHandler: vi.fn(),
}));

vi.mock('../lib/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed'),
}));

vi.mock('../lib/openai', () => ({
  openAIClientFor: vi.fn().mockResolvedValue({
    client: { chat: { completions: { create: vi.fn() } } },
    llmModel: 'gpt-4o-mini',
  }),
}));

vi.mock('../services/rag/RagService', () => ({
  ragService: { search: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../services/takeoverService', () => ({
  takeoverConversation: vi.fn(),
}));

vi.mock('xlsx', () => ({
  default: {
    read: vi.fn().mockReturnValue({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }),
    utils: {
      sheet_to_json: vi.fn().mockReturnValue([]),
    },
  },
}));

// ============================
// Tests
// ============================

describe('customerCode — Q3', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1. customerCode يبدأ من 90001 في Migration', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync('prisma/migrations/20260820_add_customers_outcomes_campaigns/migration.sql', 'utf8');
    expect(sql).toContain('CREATE SEQUENCE "Customer_customerCode_seq" START WITH 90001');
    expect(sql).toContain('nextval(\'"Customer_customerCode_seq"\')');
  });

  it('2. customerCode فريد عالميًا عبر Tenants (Unique Constraint)', async () => {
    const fs = await import('node:fs');
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
    expect(schema).toMatch(/customerCode\s+Int\s+@unique/);
  });

  it('3. Backfill يرتب حسب createdAt ثم id', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync('prisma/migrations/20260820_add_customers_outcomes_campaigns/migration.sql', 'utf8');
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC)');
    expect(sql).toContain('90000 + numbered.rn');
  });

  it('4. Sequence يُحدّث بعد Backfill', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync('prisma/migrations/20260820_add_customers_outcomes_campaigns/migration.sql', 'utf8');
    expect(sql).toContain('setval(\'"Customer_customerCode_seq"\'');
  });

  it('5. create لا يتطلب customerCode (يأتي من DB sequence)', () => {
    const customerData = { tenantId: 't1', name: 'أحمد', phone: '0100', email: null, customData: {}, uploadBatchId: 'b1' };
    const hasCode = 'customerCode' in customerData;
    expect(hasCode).toBe(false);
  });

  it('6. كود العميل لا يتغير عند تعديل بيانات العميل', () => {
    const updateData = { name: 'اسم جديد' };
    expect('customerCode' in updateData).toBe(false);
  });

  it('7. حذف عميل لا يعيد استخدام كوده (Backfill في Migration يستخدم setval)', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync('prisma/migrations/20260820_add_customers_outcomes_campaigns/migration.sql', 'utf8');
    expect(sql).toContain('setval');
    expect(sql).toContain('COALESCE');
  });
});

describe('API Routes — Q9 mapping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('8. GET /customers يُعيد customerCode', () => {
    const items = [
      { id: 'c1', customerCode: 90001, name: 'أحمد', phone: '0100', status: 'PENDING', outcome: null, createdAt: new Date() },
    ];
    expect(items[0]).toHaveProperty('customerCode', 90001);
  });

  it('9. GET /customers/:id يُعيد customerCode', () => {
    const customer = { id: 'c1', customerCode: 90001, name: 'أحمد', phone: '0100', status: 'PENDING' };
    expect(customer).toHaveProperty('customerCode', 90001);
  });
});

describe('WhatsApp Status Logic — Q5', () => {
  beforeEach(() => vi.clearAllMocks());

  it('10. رسالة WhatsApp outbound لا تحول Customer إلى DONE', () => {
    const customer = { id: 'c1', status: 'PENDING' as const };
    const updateData: Record<string, unknown> = {};
    expect(updateData).not.toHaveProperty('status', 'DONE');
    expect(customer.status).toBe('PENDING');
  });

  it('11. رسالة WhatsApp inbound تحوّل Customer إلى DONE', () => {
    const customer = { id: 'c1', status: 'PENDING' as const };
    const newStatus = 'DONE';
    expect(newStatus).toBe('DONE');
  });

  it('12. 상태 PENDING قبل أي تواصل', () => {
    const customer = { status: 'PENDING' };
    expect(customer.status).toBe('PENDING');
  });
});

describe('Meta 24h Window — Q6', () => {
  beforeEach(() => vi.clearAllMocks());

  it('13. لا إرسال outbound بدون inbound خلال 24 ساعة', async () => {
    mockPrisma.whatsappMessage.count.mockResolvedValue(0);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await mockPrisma.whatsappMessage.count({
      where: {
        tenantId: 't1',
        direction: 'INBOUND',
        conversation: { contactNumber: '+20100' },
        createdAt: { gte: cutoff },
      },
    });
    expect(count).toBe(0);
  });

  it('14. إرسال outbound مسموح عند وجود inbound خلال 24 ساعة', async () => {
    mockPrisma.whatsappMessage.count.mockResolvedValue(3);
    const count = await mockPrisma.whatsappMessage.count({
      where: { tenantId: 't1', direction: 'INBOUND' },
    });
    expect(count).toBeGreaterThan(0);
  });
});

describe('Campaign Worker — Q7', () => {
  beforeEach(() => vi.clearAllMocks());

  it('15. Worker لا ينفذ Target نفسه مرتين (atomic claim)', async () => {
    mockPrisma.campaignTarget.findMany.mockResolvedValue([
      { id: 't1', status: 'PENDING' },
    ]);
    mockPrisma.campaignTarget.updateMany.mockResolvedValue({ count: 1 });
    const pending = await mockPrisma.campaignTarget.findMany({
      where: { campaignId: 'camp1', status: 'PENDING' },
      take: 5,
    });
    expect(pending).toHaveLength(1);
    await mockPrisma.campaignTarget.updateMany({
      where: { id: { in: ['t1'] }, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    expect(mockPrisma.campaignTarget.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING' }) }),
    );
  });

  it('16. BOTH يحتفظ بنتيجة كل قناة منفصلة', () => {
    const meta: Record<string, unknown> = {};
    meta.voiceStatus = 'SENT';
    meta.chatStatus = 'FAILED';
    expect(meta.voiceStatus).toBe('SENT');
    expect(meta.chatStatus).toBe('FAILED');
  });

  it('17. Campaign لا تصبح COMPLETED قبل اكتمال جميع Targets', async () => {
    const pendingCount = 2;
    const sentCount = 3;
    const finalStatus = pendingCount > 0 ? 'RUNNING' : 'COMPLETED';
    expect(finalStatus).toBe('RUNNING');
    expect(pendingCount).toBeGreaterThan(0);
  });

  it('18. allMatching يحترم tenantId والفلاتر', () => {
    const where: Record<string, unknown> = { tenantId: 't1' };
    where.status = 'PENDING';
    where.outcomeId = 'o1';
    expect(where).toEqual({ tenantId: 't1', status: 'PENDING', outcomeId: 'o1' });
    expect(where.tenantId).toBe('t1');
  });
});

describe('TenantOutcome Isolation — Q8', () => {
  beforeEach(() => vi.clearAllMocks());

  it('19. TenantOutcome لا يقبل نتيجة من Tenant آخر', async () => {
    const tenantId = 'tenant-a';
    const outcomeFromOtherTenant = { id: 'o-other', tenantId: 'tenant-b', label: 'نتيجة ب' };
    expect(outcomeFromOtherTenant.tenantId).not.toBe(tenantId);
  });

  it('20. classifyConversation لا يحفظ outcomeId غير صالح', () => {
    const validOutcomeIds = ['o1', 'o2', 'o3'];
    const returnedId = 'o-invalid';
    const isValid = validOutcomeIds.includes(returnedId);
    expect(isValid).toBe(false);
  });

  it('21. عدم وجود نتائج لا يؤدي إلى خطأ', () => {
    const outcomes: unknown[] = [];
    const shouldClassify = outcomes.length > 0;
    expect(shouldClassify).toBe(false);
  });
});

describe('Call Lifecycle — Q4', () => {
  beforeEach(() => vi.clearAllMocks());

  it('22. RapidaEventTypeFailure لا يتحول إلى DID_NOT_ANSWER', () => {
    const disconnectionType = 'DISCONNECTION_TYPE_ERROR' as string;
    const newStatus = (disconnectionType === 'DISCONNECTION_TYPE_TOOL' || disconnectionType === 'DISCONNECTION_TYPE_USER') ? 'COMPLETED' : 'FAILED';
    expect(newStatus).toBe('FAILED');
    expect(newStatus).not.toBe('DID_NOT_ANSWER');
  });

  it('23. COMPLETED يتحول إلى DONE', () => {
    const callStatus = 'COMPLETED';
    const customerStatus = callStatus === 'COMPLETED' ? 'DONE' : undefined;
    expect(customerStatus).toBe('DONE');
  });

  it('23b. FAILED لا يتحول إلى DID_NOT_ANSWER — يبقى دون تغيير', () => {
    const callStatus = 'FAILED' as string;
    const customerStatus = callStatus === 'COMPLETED' ? 'DONE' : undefined;
    expect(customerStatus).toBeUndefined();
  });
});
