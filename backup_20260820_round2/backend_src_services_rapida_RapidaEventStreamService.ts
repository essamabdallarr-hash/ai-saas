import { prisma } from '../../lib/prisma';
import { hub } from '../../ws/hub';
import { rapidaService } from './RapidaProxyService';
import { whatsappConversationService } from '../whatsapp/WhatsAppConversationService';

const activeListeners = new Map<number, () => void>();

function mapDisconnectionType(type: string): 'COMPLETED' | 'FAILED' {
  if (type === 'DISCONNECTION_TYPE_TOOL' || type === 'DISCONNECTION_TYPE_USER') return 'COMPLETED';
  return 'FAILED';
}

function mapErrorToFailed(): 'FAILED' {
  return 'FAILED';
}

function isDisconnectedAlready(callId: string): Promise<boolean> {
  return prisma.call.findFirst({ where: { id: callId } }).then((call) => {
    return !call || call.status === 'COMPLETED' || call.status === 'FAILED' || call.status === 'TRANSFERRED_TO_HUMAN';
  });
}

async function handleCallEvent(callId: string, tenantId: string, conversationId: string | null, customerId: string | null, event: Record<string, unknown>): Promise<void> {
  const done = await isDisconnectedAlready(callId);
  if (done) return;

  const data = event.data as Record<string, string> | undefined;
  const disconnection = event.disconnection as { type?: string } | undefined;
  const error = event.error as { message?: string } | undefined;

  let newStatus: 'COMPLETED' | 'FAILED' | null = null;

  if (disconnection?.type) {
    newStatus = mapDisconnectionType(disconnection.type);
  } else if (error || event.type === 'error') {
    newStatus = mapErrorToFailed();
  } else if (event.type === 'stream_end') {
    newStatus = 'FAILED';
  }

  if (!newStatus) return;

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'COMPLETED' || newStatus === 'FAILED') {
    updateData.endedAt = new Date();
  }

  await prisma.call.update({ where: { id: callId }, data: updateData as never });
  hub.broadcast(tenantId, { type: 'call.status', callId, status: newStatus });

  if (conversationId) {
    await whatsappConversationService.closeConversation(tenantId, conversationId).catch(() => undefined);
  }
}

export function startCallEventListener(callId: string, tenantId: string, rapidaConversationId: number, conversationId: string | null, customerId: string | null): void {
  if (activeListeners.has(rapidaConversationId)) return;

  const cleanup = rapidaService.listenForCallEvents(rapidaConversationId, (event) => {
    void handleCallEvent(callId, tenantId, conversationId, customerId, event);
  });

  activeListeners.set(rapidaConversationId, cleanup);
}

export function stopCallEventListener(rapidaConversationId: number): void {
  const cleanup = activeListeners.get(rapidaConversationId);
  if (cleanup) {
    cleanup();
    activeListeners.delete(rapidaConversationId);
  }
}

export function stopAllCallEventListeners(): void {
  for (const [id, cleanup] of activeListeners) {
    cleanup();
  }
  activeListeners.clear();
}
