import type { LiveEvent } from './types';

/**
 * عميل WebSocket بسيط مع إعادة اتصال تلقائية (Auto-reconnect) ونبض (Heartbeat).
 * يُستخدم في Live Inbox للتفريغ اللحظي والمحادثات وزر Human Takeover.
 */
export class LiveSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Set<(event: LiveEvent) => void>();
  private retries = 0;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(path: string) {
    const base = (import.meta.env.VITE_WS_URL as string | undefined) ?? `ws://${location.host}`;
    const token = localStorage.getItem('token');
    const sep = path.includes('?') ? '&' : '?';
    this.url = token ? `${base}${path}${sep}token=${encodeURIComponent(token)}` : `${base}${path}`;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.open();
  }

  private open(): void {
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        this.retries = 0;
        console.info('[ws] connected', this.url);
      };

      ws.onmessage = (raw) => {
        try {
          const event = JSON.parse(raw.data as string) as LiveEvent;
          this.listeners.forEach((fn) => fn(event));
        } catch {
          /* تجاهل الرسائل غير JSON */
        }
      };

      ws.onclose = () => {
        if (this.shouldReconnect) this.scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.retries, 15000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.retries += 1;
      this.open();
    }, delay);
  }

  onEvent(fn: (event: LiveEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(payload: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  close(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
