import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { hub } from '../ws/hub';
import { rapidaService } from '../services/rapida/RapidaProxyService';
import { startCallEventListener } from '../services/rapida/RapidaEventStreamService';

function buildCustomerExtraContext(customer: { name: string; phone: string | null; email: string | null; customData: unknown } | null): string {
  if (!customer) return '';
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

/**
 * بدء مكالمة صوتية: يجمع Orchestration Context (Prompt مخفي + RAG + بيانات العميل) عبر
 * RapidaProxyService ثم ينادي خادم rapida (CreatePhoneCall) ويسجّل المكالمة محليًا.
 */
export async function startCall(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const { toNumber, fromNumber } = req.body ?? {};

  if (!toNumber) throw new ApiError(422, 'يلزم رقم العميل (toNumber)', 'MISSING_TO_NUMBER');

  const agent = await prisma.agent.findFirst({ where: { tenantId, status: 'ACTIVE' } });
  if (!agent) throw new ApiError(404, 'لا يوجد وكيل نشط — فعّل الوكيل أولًا', 'AGENT_NOT_FOUND');

  // فحص حدود الباقة: الدقائق المتاحة
  const month = new Date().toISOString().slice(0, 7);
  const ledger = await prisma.usageLedger.findUnique({ where: { tenantId_month: { tenantId, month } } });
  const tier = await prisma.tierLimit.findUnique({ where: { tenantId } });
  if (tier && ledger && ledger.voiceMinutes >= tier.monthlyVoiceMinutes) {
    throw new ApiError(429, 'استهلكت باقة الدقائق الشهرية', 'VOICE_LIMIT_REACHED');
  }

  // البحث عن العميل من رقم الهاتف
  const normalizedPhone = String(toNumber).trim();
  const customer = await prisma.customer.findFirst({ where: { tenantId, phone: normalizedPhone } });

  const extraContext = buildCustomerExtraContext(customer);

  const rapidaResult = await rapidaService.startCall({
    tenantId,
    agentId: agent.id,
    toNumber: normalizedPhone,
    fromNumber: fromNumber ? String(fromNumber) : undefined,
    extraContext: extraContext || undefined,
  });

  // محادثة موحدة + مكالمة مسجّلة محليًا
  const conversation = await prisma.conversation.create({
    data: {
      tenantId,
      channel: 'VOICE',
      status: 'OPEN',
      contactNumber: normalizedPhone,
      agentId: agent.id,
      customerId: customer?.id ?? null,
      lastMessageAt: new Date(),
    },
  });
  const call = await prisma.call.create({
    data: {
      tenantId,
      agentId: agent.id,
      conversationId: conversation.id,
      channel: 'VOICE',
      direction: 'OUTBOUND',
      callerNumber: normalizedPhone,
      status: 'RINGING',
      meta: { rapidaConversationId: rapidaResult.rapidaConversationId, customerId: customer?.id ?? null },
    },
  });

  startCallEventListener(call.id, tenantId, rapidaResult.rapidaConversationId, conversation.id, customer?.id ?? null);
  await prisma.usageLedger.upsert({
    where: { tenantId_month: { tenantId, month } },
    create: { tenantId, month },
    update: {},
  });

  const wire = {
    id: conversation.id,
    channel: 'VOICE' as const,
    status: 'OPEN',
    contactNumber: normalizedPhone,
    createdAt: conversation.createdAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    call: {
      id: call.id,
      status: call.status,
      callerNumber: call.callerNumber,
      durationSec: 0,
      startedAt: call.startedAt.toISOString(),
    },
  };
  hub.broadcast(tenantId, { type: 'conversation.open', conversation: wire });

  res.status(201).json({
    callId: call.id,
    conversationId: conversation.id,
    rapidaConversationId: rapidaResult.rapidaConversationId,
    status: call.status,
  });
}

export async function getCall(req: Request, res: Response): Promise<void> {
  const call = await prisma.call.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId! },
    include: { conversation: { include: { messages: { orderBy: { createdAt: 'asc' } } } } },
  });
  if (!call) throw new ApiError(404, 'المكالمة غير موجودة', 'CALL_NOT_FOUND');
  res.json(call);
}

export async function listCalls(req: Request, res: Response): Promise<void> {
  const calls = await prisma.call.findMany({
    where: { tenantId: req.auth!.tenantId! },
    orderBy: { startedAt: 'desc' },
    take: Number(req.query.limit ?? 100),
    include: { conversation: true },
  });
  res.json(calls);
}
