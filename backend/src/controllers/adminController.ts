import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { hashPassword } from '../lib/password';
import { encryptSecret } from '../lib/crypto';
import { ragService, type UploadedFile } from '../services/rag/RagService';

/** يعرّي الأسرار المشفرة قبل إرسال المستأجر للواجهة */
function sanitizeTenant<T extends { openaiApiKeyEnc?: string | null }>(tenant: T): Omit<T, 'openaiApiKeyEnc'> & { openaiKeyConfigured: boolean } {
  const { openaiApiKeyEnc, ...rest } = tenant;
  return { ...rest, openaiKeyConfigured: Boolean(openaiApiKeyEnc) };
}

/** قائمة المستأجرين + إعداداتهم — Super Admin فقط */
export async function listTenants(req: Request, res: Response): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      tierLimit: true,
      featureToggles: true,
      _count: { select: { users: true, agents: true, calls: true, conversations: true } },
    },
  });
  res.json(tenants.map(sanitizeTenant));
}

export async function createTenant(req: Request, res: Response): Promise<void> {
  const { name, slug, status = 'TRIAL' } = req.body ?? {};
  if (!name || !slug) throw new ApiError(422, 'يلزم name و slug', 'MISSING_TENANT_FIELDS');

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) throw new ApiError(409, 'الـ slug مستخدم', 'SLUG_TAKEN');

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      status,
      tierLimit: { create: {} },
      featureToggles: { create: {} },
      // وكيل افتراضي نشط — يظهر في AI Studio فورًا ويسمح باختبار المحاكاة
      agents: {
        create: {
          name: 'الوكيل الرئيسي',
          status: 'ACTIVE',
          systemPrompt: 'أنت وكيل ذكي يتحدث العربية بطلاقة. ابدأ بتحية ودية، وتعرف على احتياج العميل، ثم اقترح الحل المناسب.',
        },
      },
    },
  });
  res.status(201).json(tenant);
}

export async function updateTenant(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');

  const { name, status, tierLimit, featureToggles } = req.body ?? {};
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      name: name ?? undefined,
      status: status ?? undefined,
    },
  });
  if (tierLimit) {
    await prisma.tierLimit.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...tierLimit },
      update: tierLimit,
    });
  }
  if (featureToggles) {
    await prisma.featureToggle.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...featureToggles },
      update: featureToggles,
    });
  }

  const fresh = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    include: { tierLimit: true, featureToggles: true },
  });
  res.json(fresh ? sanitizeTenant(fresh) : fresh);
}

/** Prompt Studio مخفي — تعديل الـ systemPrompt الخاص بوكيل مستأجر (Super Admin فقط) */
export async function updateAgentPrompt(req: Request, res: Response): Promise<void> {
  const { tenantId, agentId } = req.params;
  const { systemPrompt } = req.body ?? {};
  if (typeof systemPrompt !== 'string') throw new ApiError(422, 'يلزم systemPrompt نصي', 'MISSING_PROMPT');

  const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
  if (!agent) throw new ApiError(404, 'الوكيل غير موجود', 'AGENT_NOT_FOUND');

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: { systemPrompt, promptVersion: { increment: 1 } },
  });
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: req.auth!.userId,
      action: 'UPDATE',
      resource: `agent:${agentId}`,
      metadata: { promptVersion: updated.promptVersion },
    },
  });
  res.json(updated);
}

/** إنشاء مستخدم/مدير لعميل مع تعيين كلمة مرور — إجباري من بوابة الإدارة فقط */
export async function createTenantUser(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');

  const { email, name, password, role = 'CLIENT_ADMIN' } = req.body ?? {};
  if (!email || !name || !password) {
    throw new ApiError(422, 'يلزم email و name و password', 'MISSING_USER_FIELDS');
  }
  if (String(password).length < 8) {
    throw new ApiError(422, 'كلمة المرور يجب ألا تقل عن 8 أحرف', 'WEAK_PASSWORD');
  }
  if (!['CLIENT_ADMIN', 'CLIENT_AGENT'].includes(role)) {
    throw new ApiError(422, 'دور غير صالح', 'INVALID_ROLE');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new ApiError(409, 'البريد الإلكتروني مستخدم مسبقًا', 'EMAIL_TAKEN');

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: String(name),
      role,
      tenantId: tenant.id,
      active: true,
      passwordHash: await hashPassword(String(password)),
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorId: req.auth!.userId,
      action: 'CREATE',
      resource: `user:${user.id}`,
      metadata: { email: normalizedEmail, role },
    },
  });

  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId, active: user.active });
}

/** قائمة مستخدمي مستأجر معيّن (Super Admin فقط) — لإدارة كلمات المرور */
export async function listTenantUsers(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');
  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true, role: true, active: true, lastLoginAt: true },
  });
  res.json(users);
}

/** إعادة تعيين كلمة مرور مستخدم عميل — Managed Service (Super Admin فقط) */
export async function setTenantUserPassword(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');

  const user = await prisma.user.findFirst({
    where: { id: req.params.userId, tenantId: tenant.id, role: { in: ['CLIENT_ADMIN', 'CLIENT_AGENT'] } },
  });
  if (!user) throw new ApiError(404, 'المستخدم غير موجود', 'USER_NOT_FOUND');

  const { password } = req.body ?? {};
  if (typeof password !== 'string' || password.length < 8) {
    throw new ApiError(422, 'كلمة المرور يجب ألا تقل عن 8 أحرف', 'WEAK_PASSWORD');
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorId: req.auth!.userId,
      action: 'UPDATE',
      resource: `user:${user.id}:password`,
    },
  });

  res.json({ ok: true });
}

/** تعيين مفتاح OpenAI ونموذج LLM خاص بمستأجر (مشفر عند التخزين) — Super Admin فقط */
export async function setTenantAiKeys(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');

  const { openaiApiKey, openaiModel } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (openaiApiKey != null) {
    if (typeof openaiApiKey !== 'string' || openaiApiKey.trim().length === 0) {
      // مفتاح فارغ = إزالة مفتاح العميل والعودة لمفتاح المنصة
      data.openaiApiKeyEnc = null;
    } else {
      data.openaiApiKeyEnc = encryptSecret(openaiApiKey.trim());
    }
  }
  if (openaiModel != null) {
    data.openaiModel = typeof openaiModel === 'string' && openaiModel.trim() ? openaiModel.trim() : null;
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorId: req.auth!.userId,
      action: 'UPDATE',
      resource: `tenant:${tenant.id}:ai-keys`,
    },
  });

  res.json(await getTenantAiKeysView(tenant.id));
}

/** حالة مفاتيح الذكاء الاصطناعي لمستأجر (لا تُرجَع القيمة المشفرة أبدًا) */
export async function getTenantAiKeys(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');
  res.json(await getTenantAiKeysView(tenant.id));
}

async function getTenantAiKeysView(tenantId: string): Promise<{ openaiKeyConfigured: boolean; openaiModel: string | null }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { openaiApiKeyEnc: true, openaiModel: true },
  });
  return {
    openaiKeyConfigured: Boolean(tenant?.openaiApiKeyEnc),
    openaiModel: tenant?.openaiModel ?? null,
  };
}

/** ملف الوكيل الكامل لمستأجر معيّن (Agent + DynamicFields + Documents) — بوابة AI Studio */
export async function getTenantAgent(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');

  const agent = await prisma.agent.findFirst({
    where: { tenantId: tenant.id },
    include: {
      dynamicFields: { orderBy: { position: 'asc' } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!agent) throw new ApiError(404, 'لا يوجد وكيل لهذا المستأجر بعد', 'AGENT_NOT_FOUND');
  res.json(agent);
}

/** استبدال حقول Data Extraction لمستأجر — AI Studio (مخفي عن العميل) */
export async function replaceTenantFields(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');

  const fields = req.body?.fields;
  if (!Array.isArray(fields)) throw new ApiError(422, 'يلزم fields كمصفوفة', 'MISSING_FIELDS');

  const agent = await prisma.agent.findFirst({ where: { tenantId: tenant.id } });
  const data = fields
    .filter((f: { key?: string; label?: string }) => f?.key && f?.label)
    .map(
      (
        f: { key: string; label: string; type?: string; description?: string; exampleValue?: string; required?: boolean; position?: number; enabled?: boolean },
        i: number,
      ) => ({
        tenantId: tenant.id,
        agentId: agent?.id ?? null,
        key: f.key,
        label: f.label,
        type: (f.type as never) ?? 'TEXT',
        description: f.description ?? null,
        exampleValue: f.exampleValue ?? null,
        required: f.required ?? false,
        position: f.position ?? i,
        enabled: f.enabled ?? true,
      }),
    );

  await prisma.$transaction([
    prisma.dynamicField.deleteMany({ where: { tenantId: tenant.id } }),
    prisma.dynamicField.createMany({ data }),
  ]);

  const fresh = await prisma.dynamicField.findMany({ where: { tenantId: tenant.id }, orderBy: { position: 'asc' } });
  res.json(fresh);
}

/** رفع ملف Knowledge Base لمستأجر معيّن من AI Studio */
export async function uploadTenantDocument(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');

  const file = req.file;
  if (!file) throw new ApiError(422, 'يلزم ملف', 'MISSING_FILE');

  const agent = await prisma.agent.findFirst({ where: { tenantId: tenant.id, status: 'ACTIVE' } });
  if (!agent) throw new ApiError(404, 'أنشئ وكيلًا نشطًا قبل رفع المستندات', 'AGENT_NOT_FOUND');

  const uploaded: UploadedFile = {
    originalname: file.originalname,
    mimetype: file.mimetype,
    path: file.path,
    size: file.size,
  };
  const doc = await ragService.ingestDocument(tenant.id, agent.id, uploaded);
  res.status(201).json(doc);
}

export async function deleteTenantDocument(req: Request, res: Response): Promise<void> {
  const doc = await prisma.knowledgeDocument.findFirst({
    where: { id: req.params.docId, tenantId: req.params.tenantId },
  });
  if (!doc) throw new ApiError(404, 'المستند غير موجود', 'DOCUMENT_NOT_FOUND');
  await prisma.knowledgeDocument.delete({ where: { id: doc.id } });
  res.json({ ok: true });
}

/** Global Metrics — مقاييس المنصة الكلية + لكل مستأجر */
export async function globalMetrics(_req: Request, res: Response): Promise<void> {
  const [tenantsCount, usersCount, agentsCount, callsAgg, activeCalls, messagesAgg, usageRows] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.agent.count(),
    prisma.call.aggregate({
      _sum: { durationSec: true, apiCostUsd: true },
      _count: true,
    }),
    prisma.call.count({
      where: { status: { in: ['RINGING', 'IN_PROGRESS', 'TRANSFERRED_TO_HUMAN'] as never } },
    }),
    prisma.whatsappMessage.count(),
    prisma.usageLedger.findMany({ take: 200, orderBy: { month: 'desc' } }),
  ]);

  res.json({
    tenants: tenantsCount,
    users: usersCount,
    agents: agentsCount,
    totalCalls: callsAgg._count,
    activeCalls,
    totalVoiceSeconds: callsAgg._sum.durationSec ?? 0,
    totalCostUsd: callsAgg._sum.apiCostUsd ?? 0,
    whatsappMessages: messagesAgg,
    usageByTenant: usageRows,
  });
}
