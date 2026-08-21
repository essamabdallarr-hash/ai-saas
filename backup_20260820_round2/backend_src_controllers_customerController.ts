import type { Request, Response } from 'express';
import type { Campaign, CampaignTarget, Customer } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { rapidaService } from '../services/rapida/RapidaProxyService';
import { startCallEventListener } from '../services/rapida/RapidaEventStreamService';
import { metaOfficialService } from '../services/whatsapp/MetaOfficialService';
import { config } from '../config';
import XLSX from 'xlsx';

const CAMPAIGN_WORKER_BATCH = 5;
const CAMPAIGN_WORKER_DELAY_MS = 2000;

export async function listCustomers(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  const search = (req.query.search as string | undefined)?.trim();
  const status = req.query.status as string | undefined;
  const outcomeId = req.query.outcomeId as string | undefined;

  const where: Record<string, unknown> = { tenantId };
  if (status && ['PENDING', 'DONE', 'DID_NOT_ANSWER'].includes(status)) {
    where.status = status;
  }
  if (outcomeId) {
    where.outcomeId = outcomeId;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { outcome: true },
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

export async function getCustomer(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, tenantId },
    include: { outcome: true, uploadBatch: true },
  });
  if (!customer) throw new ApiError(404, 'العميل غير موجود', 'CUSTOMER_NOT_FOUND');
  res.json(customer);
}

export async function getCustomerConversations(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const customerId = req.params.id;
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!customer) throw new ApiError(404, 'العميل غير موجود', 'CUSTOMER_NOT_FOUND');

  const phone = customer.phone;
  if (!phone) {
    res.json({ voice: [], chat: [] });
    return;
  }

  const conversations = await prisma.conversation.findMany({
    where: { tenantId, contactNumber: phone },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      calls: { orderBy: { startedAt: 'desc' } },
      whatsappMessages: { orderBy: { createdAt: 'desc' }, take: 50 },
      extractedValues: { include: { field: { select: { key: true, label: true } } } },
    },
  });

  const voice = conversations
    .filter((c) => c.channel === 'VOICE')
    .flatMap((c) => c.calls.map((call) => ({
      id: call.id,
      conversationId: c.id,
      status: call.status,
      startedAt: call.startedAt.toISOString(),
      durationSec: call.durationSec,
      audioUrl: call.audioUrl ?? null,
      transcript: call.transcript ?? null,
      aiSummary: call.aiSummary ?? null,
      extractedData: Object.fromEntries(c.extractedValues.map((e) => [e.field.key, e.value])),
    })));

  const chat = conversations
    .filter((c) => c.channel === 'WHATSAPP')
    .flatMap((c) =>
      c.whatsappMessages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })),
    );

  res.json({ voice, chat });
}

export async function uploadCustomers(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const file = req.file;
  if (!file) throw new ApiError(422, 'يلزم ملف Excel', 'MISSING_FILE');

  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ApiError(422, 'الملف فارغ', 'EMPTY_FILE');

  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName]);
  if (rows.length === 0) throw new ApiError(422, 'الملف لا يحتوي على بيانات', 'EMPTY_FILE');

  const batch = await prisma.uploadBatch.create({
    data: { tenantId, fileName: file.originalname, rowCount: rows.length },
  });

  const customerData = rows.map((row) => {
    const nameKey = Object.keys(row).find((k) => /name|اسم/i.test(k));
    const phoneKey = Object.keys(row).find((k) => /phone|tel|جوال|هاتف|رقم/i.test(k));
    const emailKey = Object.keys(row).find((k) => /email|بريد/i.test(k));

    return {
      tenantId,
      name: nameKey ? String(row[nameKey] ?? '').trim() : 'غير محدد',
      phone: phoneKey ? String(row[phoneKey] ?? '').trim() : null,
      email: emailKey ? String(row[emailKey] ?? '').trim() : null,
      customData: row,
      uploadBatchId: batch.id,
    };
  });

  for (const data of customerData) {
    await prisma.customer.create({ data });
  }

  res.status(201).json({ batchId: batch.id, rowCount: rows.length, fileName: file.originalname });
}

export async function deleteCustomers(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const { ids, allMatching, filters } = req.body ?? {};

  let customerIds: string[] = [];

  if (allMatching && filters) {
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
    const customers = await prisma.customer.findMany({ where, select: { id: true } });
    customerIds = customers.map((c) => c.id);
  } else if (Array.isArray(ids) && ids.length > 0) {
    customerIds = ids;
  } else {
    throw new ApiError(422, 'يلزم مصفوفة ids أو allMatching', 'MISSING_IDS');
  }

  if (customerIds.length === 0) {
    res.json({ deleted: 0 });
    return;
  }

  await prisma.campaignTarget.deleteMany({ where: { customer: { tenantId, id: { in: customerIds } } } });
  await prisma.customer.deleteMany({ where: { tenantId, id: { in: customerIds } } });

  res.json({ deleted: customerIds.length });
}

export async function updateCustomerOutcome(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const { outcomeId } = req.body ?? {};

  const customer = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId } });
  if (!customer) throw new ApiError(404, 'العميل غير موجود', 'CUSTOMER_NOT_FOUND');

  if (outcomeId) {
    const outcome = await prisma.tenantOutcome.findFirst({ where: { id: outcomeId, tenantId } });
    if (!outcome) throw new ApiError(404, 'النتيجة غير موجودة', 'OUTCOME_NOT_FOUND');
  }

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { outcomeId: outcomeId ?? null },
    include: { outcome: true },
  });

  res.json(updated);
}

export async function listOutcomes(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const outcomes = await prisma.tenantOutcome.findMany({
    where: { tenantId },
    orderBy: { position: 'asc' },
  });
  res.json(outcomes);
}

export async function createOutcome(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const { label } = req.body ?? {};
  if (!label || typeof label !== 'string' || !label.trim()) {
    throw new ApiError(422, 'يلزم label', 'MISSING_LABEL');
  }

  const maxPos = await prisma.tenantOutcome.aggregate({ where: { tenantId }, _max: { position: true } });
  const outcome = await prisma.tenantOutcome.create({
    data: { tenantId, label: label.trim(), position: (maxPos._max.position ?? -1) + 1 },
  });
  res.status(201).json(outcome);
}

export async function deleteOutcome(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const outcome = await prisma.tenantOutcome.findFirst({ where: { id: req.params.id, tenantId } });
  if (!outcome) throw new ApiError(404, 'النتيجة غير موجودة', 'OUTCOME_NOT_FOUND');

  await prisma.customer.updateMany({ where: { outcomeId: outcome.id }, data: { outcomeId: null } });
  await prisma.tenantOutcome.delete({ where: { id: outcome.id } });
  res.json({ ok: true });
}

export async function dashboardStats(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalCustomers, pendingCount, doneCount, didNotAnswerCount, callStats, recentCalls] = await Promise.all([
    prisma.customer.count({ where: { tenantId } }),
    prisma.customer.count({ where: { tenantId, status: 'PENDING' } }),
    prisma.customer.count({ where: { tenantId, status: 'DONE' } }),
    prisma.customer.count({ where: { tenantId, status: 'DID_NOT_ANSWER' } }),
    prisma.call.aggregate({
      where: { tenantId, startedAt: { gte: startOfMonth } },
      _sum: { apiCostUsd: true, durationSec: true },
      _count: true,
    }),
    prisma.call.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { id: true, callerNumber: true, status: true, startedAt: true, durationSec: true },
    }),
  ]);

  const monthCost = callStats._sum.apiCostUsd ?? 0;
  const totalMinutes = callStats._sum.durationSec ?? 0;
  const totalCalls = callStats._count;

  res.json({
    customers: { total: totalCustomers, pending: pendingCount, done: doneCount, didNotAnswer: didNotAnswerCount },
    month: { cost: monthCost, minutes: Math.round(totalMinutes / 60), calls: totalCalls },
    recentCalls,
  });
}

export async function createCampaign(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const { name, type, message, customerIds, allMatching, filters } = req.body ?? {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ApiError(422, 'يلزم اسم الحملة', 'MISSING_NAME');
  }
  if (!['VOICE', 'CHAT', 'BOTH'].includes(type)) {
    throw new ApiError(422, 'نوع غير صالح', 'INVALID_TYPE');
  }

  let resolvedCustomerIds: string[] = [];

  if (allMatching && filters) {
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
    const customers = await prisma.customer.findMany({ where, select: { id: true } });
    resolvedCustomerIds = customers.map((c) => c.id);
  } else if (Array.isArray(customerIds) && customerIds.length > 0) {
    resolvedCustomerIds = customerIds;
  } else {
    throw new ApiError(422, 'يلزم تحديد عملاء', 'MISSING_CUSTOMERS');
  }

  if (resolvedCustomerIds.length === 0) {
    throw new ApiError(422, 'لا يوجد عملاء مطابقون', 'NO_MATCHING_CUSTOMERS');
  }

  const campaign = await prisma.campaign.create({
    data: {
      tenantId,
      name: name.trim(),
      type: type as never,
      message: message ?? null,
      totalCount: resolvedCustomerIds.length,
    },
  });

  await prisma.campaignTarget.createMany({
    data: resolvedCustomerIds.map((customerId: string) => ({ campaignId: campaign.id, customerId })),
  });

  res.status(201).json(campaign);
}

// ============================ تنفيذ الحملات (Worker) ============================

function buildCustomerContext(customer: Customer): string {
  const parts: string[] = [];
  parts.push(`اسم العميل: ${customer.name}`);
  if (customer.phone) parts.push(`رقم الهاتف: ${customer.phone}`);
  if (customer.email) parts.push(`البريد الإلكتروني: ${customer.email}`);
  if (customer.customData && typeof customer.customData === 'object' && Object.keys(customer.customData).length > 0) {
    const entries = Object.entries(customer.customData as Record<string, unknown>);
    for (const [k, v] of entries) {
      if (v !== null && v !== undefined && String(v).trim()) {
        parts.push(`${k}: ${String(v)}`);
      }
    }
  }
  return parts.length > 0 ? `بيانات العميل:\n${parts.join('\n')}` : '';
}

async function hasRecentInboundMessage(tenantId: string, phone: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.whatsappMessage.count({
    where: {
      tenantId,
      direction: 'INBOUND',
      conversation: { contactNumber: phone },
      createdAt: { gte: cutoff },
    },
  });
  return count > 0;
}

async function executeCampaign(campaignId: string, tenantId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== 'DRAFT') return;

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING', startedAt: new Date() } });

  const targets = await prisma.campaignTarget.findMany({ where: { campaignId } });

  let sentCount = 0;
  let failedCount = 0;

  for (const target of targets) {
    const customer = await prisma.customer.findUnique({ where: { id: target.customerId } });
    if (!customer || !customer.phone) {
      await prisma.campaignTarget.update({
        where: { id: target.id },
        data: { status: 'FAILED', error: 'لا يوجد رقم هاتف للعميل' },
      });
      failedCount++;
      continue;
    }

    const type = campaign.type;
    let voiceResult: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | null = null;
    let chatResult: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | null = null;

    if (type === 'VOICE' || type === 'BOTH') {
      voiceResult = await executeVoiceTarget(tenantId, customer, campaign, target);
    }
    if (type === 'CHAT' || type === 'BOTH') {
      chatResult = await executeChatTarget(tenantId, customer, campaign, target);
    }

    const overallStatus = resolveOverallStatus(type, voiceResult, chatResult);
    const meta: Record<string, unknown> = {};
    if (voiceResult) meta.voiceStatus = voiceResult;
    if (chatResult) meta.chatStatus = chatResult;

    const errors: string[] = [];
    if (voiceResult === 'FAILED') errors.push('فشل إرسال المكالمة الصوتية');
    if (voiceResult === 'NOT_CONFIGURED') errors.push('خدمة Rapida غير مهيأة');
    if (chatResult === 'FAILED') errors.push('فشل إرسال رسالة الواتساب');
    if (chatResult === 'NOT_CONFIGURED') errors.push('اتصال Meta الرسمي غير مُهيأ');

    await prisma.campaignTarget.update({
      where: { id: target.id },
      data: {
        status: overallStatus,
        sentAt: overallStatus === 'SENT' ? new Date() : null,
        meta: meta as never,
        error: errors.length > 0 ? errors.join('; ') : null,
      },
    });

    if (overallStatus === 'SENT') sentCount++;
    else failedCount++;
  }

  const finalStatus = sentCount === 0 && failedCount > 0 ? 'FAILED' : 'COMPLETED';
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: finalStatus, sentCount, failedCount, finishedAt: new Date() },
  });
}

async function executeVoiceTarget(
  tenantId: string,
  customer: Customer,
  campaign: Campaign,
  target: CampaignTarget,
): Promise<'SENT' | 'FAILED' | 'NOT_CONFIGURED'> {
  if (!config.rapidaGrpcUrl) {
    return 'NOT_CONFIGURED';
  }

  const agent = await prisma.agent.findFirst({ where: { tenantId, status: 'ACTIVE' } });
  if (!agent) {
    return 'FAILED';
  }

  const extraContext = buildCustomerContext(customer);

  try {
    const result = await rapidaService.startCall({
      tenantId,
      agentId: agent.id,
      toNumber: customer.phone!,
      extraContext: extraContext || undefined,
    });

    const conv = await prisma.conversation.create({
      data: {
        tenantId,
        channel: 'VOICE',
        status: 'OPEN',
        contactNumber: customer.phone!,
        agentId: agent.id,
        customerId: customer.id,
        lastMessageAt: new Date(),
      },
    });

    const call = await prisma.call.create({
      data: {
        tenantId,
        agentId: agent.id,
        conversationId: conv.id,
        channel: 'VOICE',
        direction: 'OUTBOUND',
        callerNumber: customer.phone!,
        status: 'RINGING',
        meta: { rapidaConversationId: result.rapidaConversationId, campaignTargetId: target.id },
      },
    });

    startCallEventListener(call.id, tenantId, result.rapidaConversationId, conv.id, customer.id);

    return 'SENT';
  } catch (err) {
    console.error('executeVoiceTarget failed:', err instanceof Error ? err.message : err);
    return 'FAILED';
  }
}

async function executeChatTarget(
  tenantId: string,
  customer: Customer,
  campaign: Campaign,
  target: CampaignTarget,
): Promise<'SENT' | 'FAILED' | 'NOT_CONFIGURED'> {
  if (!customer.phone) return 'FAILED';

  const connection = await prisma.whatsappConnection.findFirst({
    where: { tenantId, engine: 'OFFICIAL_META', status: 'CONNECTED' },
  });
  if (!connection) {
    return 'NOT_CONFIGURED';
  }

  const hasWindow = await hasRecentInboundMessage(tenantId, customer.phone);
  if (!hasWindow) {
    return 'FAILED';
  }

  const messageText = campaign.message || `مرحباً ${customer.name}`;

  try {
    const messageId = await metaOfficialService.sendText(connection, customer.phone, messageText);

    await prisma.whatsappMessage.create({
      data: {
        tenantId,
        connectionId: connection.id,
        direction: 'OUTBOUND',
        body: messageText,
        waMessageId: messageId,
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    return 'SENT';
  } catch (err) {
    console.error('executeChatTarget failed:', err instanceof Error ? err.message : err);
    return 'FAILED';
  }
}

function resolveOverallStatus(
  type: string,
  voice: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | null,
  chat: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | null,
): string {
  if (type === 'VOICE') {
    if (voice === 'SENT') return 'SENT';
    return 'FAILED';
  }
  if (type === 'CHAT') {
    if (chat === 'SENT') return 'SENT';
    return 'FAILED';
  }
  // BOTH
  if (voice === 'SENT' || chat === 'SENT') return 'SENT';
  return 'FAILED';
}

export async function listCampaigns(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const campaigns = await prisma.campaign.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(campaigns);
}

export async function listUploadBatches(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const batches = await prisma.uploadBatch.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(batches);
}

// ============================ Campaign Worker (Q7) ============================

async function claimPendingTargets(campaignId: string, limit: number): Promise<CampaignTarget[]> {
  const pending = await prisma.campaignTarget.findMany({
    where: { campaignId, status: 'PENDING' },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  if (pending.length === 0) return [];

  const ids = pending.map((t) => t.id);
  await prisma.campaignTarget.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: { status: 'PROCESSING' },
  });

  return pending;
}

async function processCampaignTarget(
  tenantId: string,
  campaign: Campaign,
  target: CampaignTarget,
): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: target.customerId } });
  if (!customer || !customer.phone) {
    await prisma.campaignTarget.update({
      where: { id: target.id },
      data: { status: 'FAILED', error: 'لا يوجد رقم هاتف للعميل' },
    });
    return;
  }

  const type = campaign.type;
  let voiceResult: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | null = null;
  let chatResult: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | null = null;

  if (type === 'VOICE' || type === 'BOTH') {
    voiceResult = await executeVoiceTarget(tenantId, customer, campaign, target);
  }
  if (type === 'CHAT' || type === 'BOTH') {
    chatResult = await executeChatTarget(tenantId, customer, campaign, target);
  }

  const overallStatus = resolveOverallStatus(type, voiceResult, chatResult);
  const meta: Record<string, unknown> = {};
  if (voiceResult) meta.voiceStatus = voiceResult;
  if (chatResult) meta.chatStatus = chatResult;

  const errors: string[] = [];
  if (voiceResult === 'FAILED') errors.push('فشل إرسال المكالمة الصوتية');
  if (voiceResult === 'NOT_CONFIGURED') errors.push('خدمة Rapida غير مهيأة');
  if (chatResult === 'FAILED') errors.push('فشل إرسال رسالة الواتساب');
  if (chatResult === 'NOT_CONFIGURED') errors.push('اتصال Meta الرسمي غير مُهيأ');

  await prisma.campaignTarget.update({
    where: { id: target.id },
    data: {
      status: overallStatus,
      sentAt: overallStatus === 'SENT' ? new Date() : null,
      meta: meta as never,
      error: errors.length > 0 ? errors.join('; ') : null,
    },
  });
}

async function updateCampaignCounters(campaignId: string): Promise<void> {
  const [sentCount, failedCount] = await Promise.all([
    prisma.campaignTarget.count({ where: { campaignId, status: 'SENT' } }),
    prisma.campaignTarget.count({ where: { campaignId, status: 'FAILED' } }),
  ]);

  const pendingCount = await prisma.campaignTarget.count({ where: { campaignId, status: { in: ['PENDING', 'PROCESSING'] } } });
  const finalStatus = pendingCount === 0 && failedCount === 0 ? 'COMPLETED' : pendingCount === 0 ? (sentCount === 0 ? 'FAILED' : 'COMPLETED') : 'RUNNING';

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount,
      failedCount,
      status: finalStatus as never,
      finishedAt: pendingCount === 0 ? new Date() : null,
    },
  });
}

async function processRunningCampaign(campaign: Campaign): Promise<void> {
  const targets = await claimPendingTargets(campaign.id, CAMPAIGN_WORKER_BATCH);

  for (const target of targets) {
    try {
      await processCampaignTarget(campaign.tenantId, campaign, target);
    } catch (err) {
      console.error('processCampaignTarget failed:', err instanceof Error ? err.message : err);
      await prisma.campaignTarget.update({
        where: { id: target.id },
        data: { status: 'FAILED', error: 'خطأ غير متوقع أثناء التنفيذ' },
      });
    }
  }

  if (targets.length > 0) {
    await updateCampaignCounters(campaign.id);
  }
}

async function runCampaignWorker(): Promise<void> {
  try {
    const runningCampaigns = await prisma.campaign.findMany({
      where: { status: 'RUNNING' },
    });

    for (const campaign of runningCampaigns) {
      await processRunningCampaign(campaign);
    }
  } catch {
    // swallow — worker must not crash server
  }
}

let workerTimer: ReturnType<typeof setInterval> | null = null;

export function startCampaignWorker(): void {
  if (workerTimer) return;

  void runCampaignWorker();

  workerTimer = setInterval(() => {
    void runCampaignWorker();
  }, CAMPAIGN_WORKER_DELAY_MS);
}

export function stopCampaignWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
