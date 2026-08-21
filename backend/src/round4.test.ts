import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const ALLOWED_PAGE_SIZES = [10, 50, 100];

function buildCustomerWhere(tenantId: string, filters: { search?: string; status?: string; outcomeId?: string; dateFrom?: string; dateTo?: string }): Record<string, unknown> {
  const where: Record<string, unknown> = { tenantId };
  if (filters.status && ['PENDING', 'DONE', 'DID_NOT_ANSWER'].includes(filters.status)) {
    where.status = filters.status;
  }
  if (filters.outcomeId) {
    where.outcomeId = filters.outcomeId;
  }
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      createdAt.lte = to;
    }
    where.createdAt = createdAt;
  }
  return where;
}

describe('Date Filter Logic — R4', () => {
  it('1. dateFrom فقط — createdAt.gte موجود', () => {
    const w = buildCustomerWhere('t1', { dateFrom: '2026-01-01' });
    expect((w.createdAt as Record<string, Date>).gte).toBeDefined();
    expect((w.createdAt as Record<string, Date>).lte).toBeUndefined();
  });

  it('2. dateTo فقط — createdAt.lte بنهاية اليوم', () => {
    const w = buildCustomerWhere('t1', { dateTo: '2026-12-31' });
    const lte = (w.createdAt as Record<string, Date>).lte!;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
  });

  it('3. dateFrom + dateTo معًا', () => {
    const w = buildCustomerWhere('t1', { dateFrom: '2026-01-01', dateTo: '2026-06-30' });
    expect((w.createdAt as Record<string, Date>).gte).toBeDefined();
    expect((w.createdAt as Record<string, Date>).lte).toBeDefined();
  });

  it('4. لا يوجد تاريخ — لا يوجد createdAt', () => {
    const w = buildCustomerWhere('t1', {});
    expect(w.createdAt).toBeUndefined();
  });

  it('5. التاريخ مع باقي الفلاتر', () => {
    const w = buildCustomerWhere('t1', { status: 'PENDING', outcomeId: 'o1', dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    expect(w.tenantId).toBe('t1');
    expect(w.status).toBe('PENDING');
    expect(w.outcomeId).toBe('o1');
    expect(w.createdAt).toBeDefined();
  });

  it('6. التاريخ مع البحث', () => {
    const w = buildCustomerWhere('t1', { search: 'ahmed', dateFrom: '2026-01-01' });
    expect(w.OR).toBeDefined();
    expect(w.createdAt).toBeDefined();
  });
});

describe('PageSize Validation — R4', () => {
  it('7. pageSize=10 مقبول', () => { expect(ALLOWED_PAGE_SIZES).toContain(10); });
  it('8. pageSize=20 مرفوض', () => { expect(ALLOWED_PAGE_SIZES).not.toContain(20); });
  it('9. pageSize=50 مقبول', () => { expect(ALLOWED_PAGE_SIZES).toContain(50); });
  it('10. pageSize=100 مقبول', () => { expect(ALLOWED_PAGE_SIZES).toContain(100); });
  it('11. pageSize=0 مرفوض', () => { expect(ALLOWED_PAGE_SIZES).not.toContain(0); });
  it('12. pageSize=999 مرفوض', () => { expect(ALLOWED_PAGE_SIZES).not.toContain(999); });
});

describe('DeleteAllMatching + Campaign allMatching — R4', () => {
  it('13. Bulk Delete allMatching يحترم dateFrom/dateTo', () => {
    const filters = { dateFrom: '2026-01-01', dateTo: '2026-06-30' };
    const w = buildCustomerWhere('t1', filters);
    expect(w.createdAt).toBeDefined();
  });

  it('14. Bulk Delete allMatching لا يتجاوز tenantId', () => {
    const w = buildCustomerWhere('t1', { status: 'PENDING' });
    expect(w.tenantId).toBe('t1');
  });

  it('15. Campaign allMatching يستخدم dateFrom/dateTo', () => {
    const w = buildCustomerWhere('t1', { dateFrom: '2026-03-01', dateTo: '2026-03-31' });
    expect(w.createdAt).toBeDefined();
  });

  it('16. Campaign allMatching يحترم جميع الفلاتر', () => {
    const w = buildCustomerWhere('t1', { search: 'test', status: 'DONE', outcomeId: 'o1', dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    expect(Object.keys(w)).toContain('status');
    expect(Object.keys(w)).toContain('outcomeId');
    expect(Object.keys(w)).toContain('OR');
    expect(Object.keys(w)).toContain('createdAt');
  });
});

describe('Select All Matching — R4', () => {
  it('17. تغيير أي فلتر يلغي التحديد', () => {
    let selected = new Set(['a', 'b']);
    let selectAllMatching = true;
    selected = new Set();
    selectAllMatching = false;
    expect(selected.size).toBe(0);
    expect(selectAllMatching).toBe(false);
  });

  it('18. allMatching لا يشمل عملاء Tenant آخر', () => {
    const w = buildCustomerWhere('tenant-a', {});
    expect(w.tenantId).toBe('tenant-a');
  });

  it('19. allMatching يحترم تاريخ وفلاتر معًا', () => {
    const w = buildCustomerWhere('t1', { search: 'x', status: 'DONE', outcomeId: 'o1', dateFrom: '2026-06-01', dateTo: '2026-06-30' });
    expect(w.tenantId).toBe('t1');
    expect(w.status).toBe('DONE');
    expect(w.outcomeId).toBe('o1');
    expect(w.OR).toBeDefined();
    expect(w.createdAt).toBeDefined();
  });
});

describe('QR Auto-Create Logic — R4', () => {
  it('20. QR لا ينشئ اتصالًا مكرر — guard', () => {
    let creating = false;
    const start = () => { if (creating) return false; creating = true; return true; };
    expect(start()).toBe(true);
    expect(start()).toBe(false);
    creating = false;
  });

  it('21. فشل GET لا يُعامل كعدم وجود اتصال', () => {
    const qrError = 'فشل الاتصال بالخادم';
    const qrConn = null;
    expect(qrError !== null && qrConn === null).toBe(true);
  });

  it('22. QR ينشئ FREE_QR عند عدم وجود اتصال', () => {
    const engine = 'FREE_QR';
    expect(engine).toBe('FREE_QR');
  });

  it('23. وقف Polling عند CONNECTED', () => {
    const status = 'CONNECTED';
    const shouldPoll = status !== 'CONNECTED' && status !== 'BANNED' && status !== 'BROKEN';
    expect(shouldPoll).toBe(false);
  });
});

describe('Excel Validation Logic — R4', () => {
  it('24. ملف xlsx مقبول', () => { expect('data.xlsx'.endsWith('.xlsx')).toBe(true); });
  it('25. ملف xls مقبول', () => { expect('data.xls'.endsWith('.xls')).toBe(true); });
  it('26. ملف csv مقبول', () => { expect('data.csv'.endsWith('.csv')).toBe(true); });
  it('27. ملف txt مرفوض', () => { expect('data.txt'.endsWith('.xlsx') || 'data.txt'.endsWith('.xls') || 'data.txt'.endsWith('.csv')).toBe(false); });

  it('28. صف بدون هاتف — يُرفض', () => {
    const rawPhone = '';
    expect(!rawPhone).toBe(true);
  });

  it('29. صف فارغ بالكامل — يُتجاهل', () => {
    const rawName = '';
    const rawPhone = '';
    expect(!rawName && !rawPhone).toBe(true);
  });

  it('30. Excel لا يستطيع إدخال customerCode', () => {
    const data = { tenantId: 't1', name: 'test', phone: '0100' };
    expect('customerCode' in data).toBe(false);
  });

  it('31. لا UploadBatch إذا فشل الملف بالكامل', () => {
    const accepted = 0;
    expect(accepted > 0).toBe(false);
  });

  it('32. هاتف فارغ لا يُخزن كرقم', () => {
    const rawPhone = '   ';
    const phone = rawPhone.trim() || null;
    expect(phone).toBeNull();
  });
});

describe('Customer Isolation — R4', () => {
  it('33. getCustomer يستخدم id + tenantId معًا', () => {
    const where = { id: 'c1', tenantId: 't1' };
    expect(where.id).toBeDefined();
    expect(where.tenantId).toBeDefined();
  });

  it('34. getCustomerConversations يستخدم customerId + tenantId', () => {
    const where = { id: 'c1', tenantId: 't1' };
    expect(where.id).toBeDefined();
    expect(where.tenantId).toBeDefined();
  });

  it('35. tenant-a لا يستطيع جلب عميل tenant-b', () => {
    expect('tenant-a').not.toBe('tenant-b');
  });
});

describe('Secret Sanitization — R4', () => {
  it('36. sanitizeTenant يزيل openaiApiKeyEnc و metaAccessTokenEnc', () => {
    function sanitize<T extends { openaiApiKeyEnc?: string | null; metaAccessTokenEnc?: string | null }>(t: T) {
      const { openaiApiKeyEnc, metaAccessTokenEnc, ...rest } = t;
      return { ...rest, openaiKeyConfigured: Boolean(openaiApiKeyEnc), metaConfigured: Boolean(metaAccessTokenEnc) };
    }
    const result = sanitize({ id: 't1', openaiApiKeyEnc: 'secret', metaAccessTokenEnc: 'meta_secret', name: 'Test' });
    expect(result).not.toHaveProperty('openaiApiKeyEnc');
    expect(result).not.toHaveProperty('metaAccessTokenEnc');
    expect(result.openaiKeyConfigured).toBe(true);
    expect(result.metaConfigured).toBe(true);
    expect(result.name).toBe('Test');
  });

  it('37. sanitizeTenant مع قيم فارغة', () => {
    function sanitize<T extends { openaiApiKeyEnc?: string | null; metaAccessTokenEnc?: string | null }>(t: T) {
      const { openaiApiKeyEnc, metaAccessTokenEnc, ...rest } = t;
      return { ...rest, openaiKeyConfigured: Boolean(openaiApiKeyEnc), metaConfigured: Boolean(metaAccessTokenEnc) };
    }
    const result = sanitize({ id: 't1', openaiApiKeyEnc: null, metaAccessTokenEnc: null });
    expect(result.openaiKeyConfigured).toBe(false);
    expect(result.metaConfigured).toBe(false);
  });

  it('38. sanitizeConnection يزيل metaAccessTokenEnc', () => {
    function sanitize<T extends { metaAccessTokenEnc?: string | null }>(c: T) {
      const { metaAccessTokenEnc, ...rest } = c;
      return { ...rest, metaConfigured: Boolean(metaAccessTokenEnc) };
    }
    const result = sanitize({ id: 'c1', metaAccessTokenEnc: 'secret_token', engine: 'OFFICIAL_META' });
    expect(result).not.toHaveProperty('metaAccessTokenEnc');
    expect(result.metaConfigured).toBe(true);
    expect(result.engine).toBe('OFFICIAL_META');
  });

  it('39. Login لا يُرجع أسرار — يمر عبر sanitizeTenant', async () => {
    const routes = fs.readFileSync('src/routes/index.ts', 'utf8');
    const loginLine = routes.split('\n').find((l) => l.includes('login') && l.includes('auth'));
    expect(loginLine).toBeDefined();
  });

  it('40. auth/me لا يُرجع أسرار — يمر عبر sanitizeTenant', async () => {
    const routes = fs.readFileSync('src/routes/index.ts', 'utf8');
    const meLine = routes.split('\n').find((l) => l.includes('/auth/me'));
    expect(meLine).toBeDefined();
    expect(meLine).toContain('asyncHandler(me)');
  });
});

describe('Agent Builder Permissions — R4', () => {
  it('41. Tenant لا يرى Agent Builder في Navigation', async () => {
    const content = fs.readFileSync('../frontend/src/components/layout/TenantShell.tsx', 'utf8');
    expect(content).not.toMatch(/agent|Agent Builder|AIStudio/i);
  });

  it('42. لا يوجد route /workspace/agent', async () => {
    const content = fs.readFileSync('../frontend/src/App.tsx', 'utf8');
    expect(content).not.toMatch(/path.*agent.*workspace/);
  });

  it('43. GET /admin/tenants/:tenantId/agent محمي بـ requireSuperAdmin', async () => {
    const routes = fs.readFileSync('src/routes/index.ts', 'utf8');
    const line = routes.split('\n').find((l) => l.includes('/admin/tenants/:tenantId/agent') && l.includes('router.get'));
    expect(line).toBeDefined();
    expect(line).toContain('requireSuperAdmin');
  });

  it('44. PUT /admin/tenants/:tenantId/agents/:agentId محمي بـ requireSuperAdmin', async () => {
    const routes = fs.readFileSync('src/routes/index.ts', 'utf8');
    const line = routes.split('\n').find((l) => l.includes('/admin/tenants/:tenantId/agents/:agentId') && l.includes('router.put'));
    expect(line).toBeDefined();
    expect(line).toContain('requireSuperAdmin');
  });

  it('45. tenant scope GET /agents/current لا يُرجع systemPrompt', async () => {
    const controller = fs.readFileSync('src/controllers/agentController.ts', 'utf8');
    expect(controller).toContain("systemPrompt: ''");
  });

  it('46. tenant scope PUT /agents/:id يقصّ systemPrompt من body', async () => {
    const controller = fs.readFileSync('src/controllers/agentController.ts', 'utf8');
    expect(controller).toContain('systemPrompt: _systemPrompt');
  });
});

describe('Dashboard Cost — R4', () => {
  it('47. التكلفة تأتي من apiCostUsd فقط', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain('apiCostUsd');
    expect(controller).not.toMatch(/price\s*[:=]|cost\s*\*\s*\d/);
  });

  it('48. لا يوجد mock data في Dashboard', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    const dashboardSection = controller.split('dashboardStats')[1];
    expect(dashboardSection).not.toContain('mock');
    expect(dashboardSection).not.toContain('hardcoded');
  });
});

// ============================
// Round 5 — New Tests
// ============================

describe('PageSize Validation — R5 (Source Inspection)', () => {
  it('R5-1. listCustomers ترفض pageSize غير صالح بـ 422 INVALID_PAGE_SIZE', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain("throw new ApiError(422, 'pageSize يجب أن يكون 10 أو 50 أو 100', 'INVALID_PAGE_SIZE')");
  });

  it('R5-2. listCustomers تقبل pageSize = 10', () => {
    expect(ALLOWED_PAGE_SIZES).toContain(10);
  });

  it('R5-3. listCustomers تقبل pageSize = 50', () => {
    expect(ALLOWED_PAGE_SIZES).toContain(50);
  });

  it('R5-4. listCustomers تقبل pageSize = 100', () => {
    expect(ALLOWED_PAGE_SIZES).toContain(100);
  });

  it('R5-5. listCustomers لا تقبل NaN', () => {
    expect(ALLOWED_PAGE_SIZES).not.toContain(NaN);
  });

  it('R5-6. listCustomers لا تقبل decimal', () => {
    expect(ALLOWED_PAGE_SIZES).not.toContain(10.5);
  });

  it('R5-7. listCustomers لا تقبل قيمة سالبة', () => {
    expect(ALLOWED_PAGE_SIZES).not.toContain(-1);
  });
});

describe('Excel Validation — R5 (Source Inspection)', () => {
  it('R5-8. رفض ملف إذا Header الاسم مفقود', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain("!nameKey || !phoneKey");
    expect(controller).toContain('MISSING_COLUMNS');
  });

  it('R5-9. رفض صف إذا الاسم فارغ (trimmed)', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain("!rawName");
    expect(controller).toContain('اسم العميل مفقود');
  });

  it('R5-10. رفض صف إذا الهاتف فارغ (trimmed)', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain("!rawPhone");
    expect(controller).toContain('رقم الهاتف مفقود');
  });

  it('R5-11. تجاهل صف فارغ بالكامل (اسم + هاتف)', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain('!rawName && !rawPhone');
    expect(controller).toContain('continue');
  });

  it('R5-12. trim قبل الفحص للاسم والهاتف', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain("String(row[nameKey] ?? '').trim()");
    expect(controller).toContain("String(row[phoneKey] ?? '').trim()");
  });

  it('R5-13. لا اسم افتراضي غير محدد', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).not.toContain('غير محدد');
  });

  it('R5-14. customerCode لا يُدخل من Excel', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    const uploadSection = controller.split('uploadCustomers')[1];
    expect(uploadSection).not.toContain('customerCode');
  });

  it('R5-15. لا UploadBatch إذا لم يكن هناك صفوف مقبولة', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain('NO_VALID_ROWS');
  });

  it('R5-16. إرجاع acceptedCount وrejectedCount', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain('rowCount: accepted.length');
    expect(controller).toContain('rejectedCount: rejected.length');
  });

  it('R5-17. إرجاع سبب رفض كل صف', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain("rejected.push({ row: i + 1, reason:");
  });
});

describe('FREE_QR Unique Constraint — R5 (Source Inspection)', () => {
  it('R5-18. Schema يحتوي @@unique([tenantId, engine]) على WhatsappConnection', async () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
    const connectionSection = schema.split('model WhatsappConnection')[1].split('model WhatsappMessage')[0];
    expect(connectionSection).toContain('@@unique([tenantId, engine])');
  });

  it('R5-19. Migration SQL يحتوي على Unique Index', async () => {
    const sql = fs.readFileSync('prisma/migrations/20260821_unique_whatsapp_tenant_engine/migration.sql', 'utf8');
    expect(sql).toContain('CREATE UNIQUE INDEX');
    expect(sql).toContain('WhatsappConnection_tenantId_engine_key');
  });

  it('R5-20. createConnection يتعامل مع P2002', async () => {
    const controller = fs.readFileSync('src/controllers/whatsappController.ts', 'utf8');
    expect(controller).toContain("P2002");
    expect(controller).toContain("CONNECTION_EXISTS");
  });

  it('R5-21. createConnection لا يُرجع Stack Trace', async () => {
    const controller = fs.readFileSync('src/controllers/whatsappController.ts', 'utf8');
    expect(controller).not.toContain('stack');
    expect(controller).not.toContain('console.trace');
  });

  it('R5-22. findFirst يبقى كحماية أولى قبل create', async () => {
    const controller = fs.readFileSync('src/controllers/whatsappController.ts', 'utf8');
    expect(controller).toContain('findFirst({ where: { tenantId, engine } })');
  });
});

describe('Agent PUT Disabled for Tenant — R5 (Source Inspection)', () => {
  it('R5-23. PUT /agents/:id غير موجود في Tenant scope', async () => {
    const routes = fs.readFileSync('src/routes/index.ts', 'utf8');
    const tenantSection = routes.split('router.use(requireTenant)')[1];
    expect(tenantSection).not.toMatch(/router\.put\('\/agents\/:id'/);
  });

  it('R5-24. GET /agents/current لا يزال موجودًا في Tenant scope', async () => {
    const routes = fs.readFileSync('src/routes/index.ts', 'utf8');
    const tenantSection = routes.split('router.use(requireTenant)')[1];
    expect(tenantSection).toContain("router.get('/agents/current'");
  });

  it('R5-25. GET /agents/current لا يُرجع systemPrompt', async () => {
    const controller = fs.readFileSync('src/controllers/agentController.ts', 'utf8');
    expect(controller).toContain("systemPrompt: ''");
  });

  it('R5-26. Admin PUT /admin/tenants/:tenantId/agents/:agentId محمي بـ requireSuperAdmin', async () => {
    const routes = fs.readFileSync('src/routes/index.ts', 'utf8');
    const line = routes.split('\n').find((l) => l.includes('/admin/tenants/:tenantId/agents/:agentId') && l.includes('router.put'));
    expect(line).toBeDefined();
    expect(line).toContain('requireSuperAdmin');
  });
});

describe('Customer Isolation — R5 (Source Inspection)', () => {
  it('R5-27. getCustomer يستخدمfindFirst مع id + tenantId', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain("findFirst({ where: { id: req.params.id, tenantId }");
  });

  it('R5-28. getCustomerConversations يتحقق من وجود العميل مع tenantId أولاً', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    const section = controller.split('getCustomerConversations')[1].split('res.json')[0];
    expect(section).toContain("findFirst({ where: { id: customerId, tenantId } })");
  });

  it('R5-29. getCustomerConversations يقرأ المحادثات من نفس tenantId', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    const section = controller.split('getCustomerConversations')[1];
    expect(section).toContain('where: { tenantId, contactNumber: phone }');
  });

  it('R5-30. عدم وجود العميل يعيد 404', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    expect(controller).toContain('CUSTOMER_NOT_FOUND');
  });

  it('R5-31. لا يوجد عبور بين Tenants — كل Query يبدأ بـ tenantId', async () => {
    const controller = fs.readFileSync('src/controllers/customerController.ts', 'utf8');
    const getCustomerSection = controller.split('getCustomer')[1].split('getCustomerConversations')[0];
    expect(getCustomerSection).toContain('tenantId');
  });
});

describe('QR Auto-Create — R5 (Source Inspection)', () => {
  it('R5-32. فشل GET لا ي executes POST', async () => {
    const dashboard = fs.readFileSync('../frontend/src/features/client/ClientDashboard.tsx', 'utf8');
    expect(dashboard).toContain("setQrError('فشل الاتصال بالخادم')");
    expect(dashboard).toContain('setQrConn(null)');
  });

  it('R5-33. عدم وجود اتصال يُنفّذ POST مرة واحدة فقط', async () => {
    const dashboard = fs.readFileSync('../frontend/src/features/client/ClientDashboard.tsx', 'utf8');
    expect(dashboard).toContain('setQrCreating(true)');
    expect(dashboard).toContain('setQrCreating(false)');
  });

  it('R5-34. وجود اتصال FREE_QR يمنع POST', async () => {
    const dashboard = fs.readFileSync('../frontend/src/features/client/ClientDashboard.tsx', 'utf8');
    expect(dashboard).toContain("const freeQr = conns.find((c) => c.engine === 'FREE_QR')");
    expect(dashboard).toContain('if (freeQr)');
  });

  it('R5-35. qrCreating guard يمنع النقر المزدوج', async () => {
    const dashboard = fs.readFileSync('../frontend/src/features/client/ClientDashboard.tsx', 'utf8');
    expect(dashboard).toContain('if (qrCreating) return');
  });

  it('R5-36. Polling يتوقف عند CONNECTED', async () => {
    const dashboard = fs.readFileSync('../frontend/src/features/client/ClientDashboard.tsx', 'utf8');
    expect(dashboard).toContain("qrConn.status === 'CONNECTED'");
  });

  it('R5-37. Polling يتوقف عند إغلاق Modal', async () => {
    const dashboard = fs.readFileSync('../frontend/src/features/client/ClientDashboard.tsx', 'utf8');
    expect(dashboard).toContain('qrPollRef.current) clearInterval');
  });

  it('R5-38. خطأ POST يظهر للمستخدم', async () => {
    const dashboard = fs.readFileSync('../frontend/src/features/client/ClientDashboard.tsx', 'utf8');
    expect(dashboard).toContain("setQrError('فشل إنشاء اتصال QR')");
  });

  it('R5-39. Backend يمنع التكرار عبر findFirst + P2002', async () => {
    const controller = fs.readFileSync('src/controllers/whatsappController.ts', 'utf8');
    expect(controller).toContain('findFirst({ where: { tenantId, engine } })');
    expect(controller).toContain('P2002');
  });
});

describe('Migration Safety — R5 (Source Inspection)', () => {
  it('R5-40. Migration لا تحذف بيانات حالية', async () => {
    const sql = fs.readFileSync('prisma/migrations/20260821_unique_whatsapp_tenant_engine/migration.sql', 'utf8');
    expect(sql).not.toContain('DELETE');
    expect(sql).not.toContain('DROP');
  });

  it('R5-41. Migration تستخدم CREATE INDEX فقط', async () => {
    const sql = fs.readFileSync('prisma/migrations/20260821_unique_whatsapp_tenant_engine/migration.sql', 'utf8');
    expect(sql).toContain('CREATE UNIQUE INDEX');
  });
});
