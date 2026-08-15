import type { AuthUser } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { hub } from '../ws/hub';
import { rapidaService } from './rapida/RapidaProxyService';

export interface TakeoverResult {
  conversationId: string;
  status: string;
  callId?: string;
  takenByName: string;
}

/** منطق Human Takeover المشترك بين REST و WebSocket */
export async function takeoverConversation(
  tenantId: string,
  conversationId: string,
  actor: Pick<AuthUser, 'userId'>,
): Promise<TakeoverResult> {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'HUMAN_TAKEOVER', assignedToId: actor.userId },
  });

  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  const call = await prisma.call.findFirst({ where: { conversationId } });
  if (call) {
    await prisma.call.update({
      where: { id: call.id },
      data: { status: 'TRANSFERRED_TO_HUMAN', takeoverAt: new Date(), takenOverById: actor.userId },
    });
    hub.broadcast(tenantId, {
      type: 'takeover.start',
      callId: call.id,
      takenByName: user?.name ?? 'موظف بشري',
    });

    // إيقاف الوكيل الصوتي فورًا حتى لا يستمر الـ AI في الرد بعد التحويل
    const meta = (call.meta as { rapidaConversationId?: number } | null) ?? {};
    if (call.channel === 'VOICE' && meta.rapidaConversationId) {
      void rapidaService
        .disconnectConversation(meta.rapidaConversationId)
        .catch((err: Error) => console.error('[takeover] فشل إيقاف الوكيل الصوتي:', err.message));
    }
  }

  await prisma.auditLog.create({
    data: { tenantId, actorId: actor.userId, action: 'TAKE_OVER', resource: `conversation:${conversationId}` },
  });

  return {
    conversationId,
    status: updated.status,
    callId: call?.id,
    takenByName: user?.name ?? 'موظف بشري',
  };
}
