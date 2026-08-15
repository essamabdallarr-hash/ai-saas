import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from '../lib/auth';

type Socket = WebSocket & { isAlive?: boolean; userId?: string };

// أحداث متطابقة 1:1 مع LiveEvent في frontend/src/lib/types.ts
export interface ConversationWire {
  id: string;
  channel: 'VOICE' | 'WHATSAPP';
  status: string;
  contactNumber: string;
  contactName?: string | null;
  createdAt: string;
  lastMessageAt?: string | null;
  call?: Record<string, unknown> | null;
  messages?: unknown[];
}

export type LiveEvent =
  | { type: 'conversation.open'; conversation: ConversationWire }
  | { type: 'conversation.close'; conversationId: string }
  | { type: 'call.status'; callId: string; status: string }
  | { type: 'transcript.partial'; event: { id: string; callId: string; speaker: string; text: string; isFinal: boolean; createdAt: string } }
  | { type: 'transcript.final'; event: { id: string; callId: string; speaker: string; text: string; isFinal: boolean; createdAt: string } }
  | { type: 'ai.summary'; callId: string; summary: string }
  | { type: 'extraction.updated'; callId: string; extractedData: Record<string, string> }
  | { type: 'message.new'; message: Record<string, unknown> }
  | { type: 'takeover.start'; callId: string; takenByName: string }
  | { type: 'takeover.end'; callId: string };

export interface HubInboundMessage {
  type: string;
  conversationId?: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * ناقل أحداث مباشر لكل مستأجر (Tenant).
 * كل الاشتراكات معزولة بالمستأجر — أي بث لا يصل إلا لعملاء نفس الـ Tenant.
 */
export class WsHub {
  private wss?: WebSocketServer;
  private tenants = new Map<string, Set<Socket>>();
  private messageHandler?: (tenantId: string, userId: string | null, msg: HubInboundMessage) => Promise<void>;

  attach(server: Server): void {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (raw, _req) => {
      const ws = raw as Socket;
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      // يُسجَّل الـ tenant عند upgrade
    });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== '/ws/inbox') {
        socket.destroy();
        return;
      }
      const token = url.searchParams.get('token');
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      let tenantId: string | null = null;
      let userId: string | null = null;
      try {
        const auth = verifyToken(token);
        tenantId = auth.tenantId;
        userId = auth.userId;
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      if (!tenantId) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss!.handleUpgrade(request, socket, head, (raw) => {
        const ws = raw as Socket;
        ws.isAlive = true;
        ws.userId = userId ?? undefined;
        let set = this.tenants.get(tenantId!);
        if (!set) {
          set = new Set();
          this.tenants.set(tenantId!, set);
        }
        set.add(ws);

        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('message', (data) => {
          const raw = data.toString();
          try {
            const msg = JSON.parse(raw) as HubInboundMessage;
            void this.messageHandler?.(tenantId!, ws.userId ?? null, msg);
          } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'رسالة غير صالحة' }));
          }
        });
        ws.on('close', () => {
          set?.delete(ws);
          if (set?.size === 0) this.tenants.delete(tenantId!);
        });
      });
    });

    // نبض مستمر لفصل الاتصالات الميتة
    const timer = setInterval(() => {
      for (const set of this.tenants.values()) {
        for (const ws of set) {
          if (ws.isAlive === false) {
            ws.terminate();
            set.delete(ws);
            continue;
          }
          ws.isAlive = false;
          ws.ping();
        }
      }
    }, 30_000);
    this.wss.on('close', () => clearInterval(timer));
  }

  setMessageHandler(fn: (tenantId: string, userId: string | null, msg: HubInboundMessage) => Promise<void>): void {
    this.messageHandler = fn;
  }

  broadcast(tenantId: string, event: LiveEvent): void {
    const set = this.tenants.get(tenantId);
    if (!set) return;
    const payload = JSON.stringify(event);
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}

export const hub = new WsHub();
