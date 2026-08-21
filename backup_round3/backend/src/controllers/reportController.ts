import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import type { CallStatus } from '@prisma/client';

/** ترتيب محادثات الواتساب (بلا Call) إلى صف تقرير متوافق مع عقد الواجهة */
function whatsAppRow(c: {
  id: string;
  status: string;
  createdAt: Date;
  lastMessageAt: Date | null;
  summary: string | null;
  extractedValues: { value: string; field: { key: string } }[];
}): {
  callId: string;
  startedAt: string;
  durationSec: number;
  channel: 'WHATSAPP';
  callerNumber: string | undefined;
  status: CallStatus;
  aiSummary: string | undefined;
  audioUrl: undefined;
  apiCostUsd: number;
  extractedData: Record<string, string>;
} {
  const statusMap: Record<string, CallStatus> = {
    CLOSED: 'COMPLETED',
    HUMAN_TAKEOVER: 'TRANSFERRED_TO_HUMAN',
    OPEN: 'IN_PROGRESS',
  };
  return {
    callId: c.id,
    startedAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
    durationSec: 0,
    channel: 'WHATSAPP',
    callerNumber: undefined,
    status: statusMap[c.status] ?? 'COMPLETED',
    aiSummary: c.summary ?? undefined,
    audioUrl: undefined,
    apiCostUsd: 0,
    extractedData: Object.fromEntries(c.extractedValues.map((e) => [e.field.key, e.value])),
  };
}

export async function reports(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const { from, to, channel, status } = req.query as Record<string, string | undefined>;
  const fromDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
  const toDate = to ? new Date(to) : new Date();

  // 1) صفوف المكالمات الصوتية
  const calls =
    channel === 'WHATSAPP'
      ? []
      : await prisma.call.findMany({
          where: {
            tenantId,
            startedAt: { gte: fromDate, lte: toDate },
            channel: channel === 'VOICE' ? ('VOICE' as never) : undefined,
            status: status as never ?? undefined,
          },
          orderBy: { startedAt: 'desc' },
          take: 500,
          include: {
            conversation: {
              include: { extractedValues: { include: { field: { select: { key: true } } } } },
            },
          },
        });

  // 2) صفوف محادثات الواتساب (بلا مكالمة) — تظهر الحقول المستخرجة في التقارير أيضًا
  const whatsappConvs =
    channel === 'VOICE'
      ? []
      : await prisma.conversation.findMany({
          where: {
            tenantId,
            channel: 'WHATSAPP',
            status: { not: 'CLOSED' } as never,
            lastMessageAt: { gte: fromDate, lte: toDate },
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 500,
          include: {
            extractedValues: { include: { field: { select: { key: true } } } },
          },
        });

  const callRows = calls.map((c) => ({
    callId: c.id,
    startedAt: c.startedAt.toISOString(),
    durationSec: c.durationSec,
    channel: c.conversation?.channel ?? 'VOICE',
    callerNumber: c.callerNumber ?? undefined,
    status: c.status,
    aiSummary: c.aiSummary ?? c.conversation?.summary ?? undefined,
    audioUrl: c.audioUrl ?? undefined,
    apiCostUsd: c.apiCostUsd,
    extractedData: Object.fromEntries(
      (c.conversation?.extractedValues ?? []).map((e) => [e.field.key, e.value]),
    ),
  }));

  const whatsappRows = whatsappConvs.map(whatsAppRow).filter((r) => {
    if (status && r.status !== status) return false;
    if (channel && r.channel !== channel) return false;
    return true;
  });

  const rows = [...callRows, ...whatsappRows]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, 500);

  res.json(rows);
}
