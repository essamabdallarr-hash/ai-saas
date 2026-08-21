import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { whatsappConversationService } from '../services/whatsapp/WhatsAppConversationService';
import { takeoverConversation } from '../services/takeoverService';

export async function listConversations(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const status = (req.query.status as string | undefined) ?? 'OPEN';
  const conversations = await prisma.conversation.findMany({
    where: { tenantId, status: status as never },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
      calls: { take: 1 },
      messages: { orderBy: { createdAt: 'desc' }, take: 20 },
      whatsappMessages: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  res.json(conversations.map(withCall));
}

export async function getConversation(req: Request, res: Response): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId! },
    include: {
      calls: { take: 1 },
      messages: { orderBy: { createdAt: 'asc' } },
      extractedValues: { include: { field: true } },
    },
  });
  if (!conversation) throw new ApiError(404, 'المحادثة غير موجودة', 'CONVERSATION_NOT_FOUND');
  res.json(withCall(conversation));
}

// يحوّل علاقة calls[] إلى call واحد حسب عقد الواجهة
function withCall(c: { calls: { id: string }[]; [k: string]: unknown }): unknown {
  const { calls, ...rest } = c;
  return { ...rest, call: calls[0] ?? null };
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const messages = await prisma.conversationMessage.findMany({
    where: { conversationId: req.params.id, tenantId: req.auth!.tenantId! },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages);
}

export async function listExtractions(req: Request, res: Response): Promise<void> {
  const rows = await prisma.extractedValue.findMany({
    where: { conversationId: req.params.id, tenantId: req.auth!.tenantId! },
    include: { field: { select: { key: true, label: true } } },
  });
  res.json(rows);
}

export async function closeConversation(req: Request, res: Response): Promise<void> {
  await whatsappConversationService.closeConversation(req.auth!.tenantId!, req.params.id);
  res.json({ ok: true });
}

/** استدعاء Human Takeover عبر REST (أو عبر WebSocket message.type = takeover.request) */
export async function takeover(req: Request, res: Response): Promise<void> {
  const result = await takeoverConversation(req.auth!.tenantId!, req.params.id, { userId: req.auth!.userId });
  res.json(result);
}
