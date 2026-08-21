import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OmnichannelLiveInbox } from './OmnichannelLiveInbox';
import { api } from '@/lib/api';
import { LiveSocket } from '@/lib/ws';
import type { Call, Conversation, WhatsappMessage } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  uploadFile: vi.fn(),
  login: vi.fn(),
}));

vi.mock('@/lib/ws', () => {
  class MockLiveSocket {
    static instances: MockLiveSocket[] = [];
    static sent: unknown[] = [];
    private handler: ((ev: unknown) => void) | null = null;

    constructor(_path: string) {
      MockLiveSocket.instances.push(this);
    }

    onEvent(fn: (ev: unknown) => void) {
      this.handler = fn;
      return () => undefined;
    }

    connect() {}

    close() {}

    send(payload: unknown) {
      MockLiveSocket.sent.push(payload);
    }

    static emit(ev: unknown) {
      MockLiveSocket.instances.forEach((i) => i.handler?.(ev));
    }
  }
  return { LiveSocket: MockLiveSocket };
});

const apiMock = vi.mocked(api);
const WSMock = LiveSocket as unknown as {
  instances: Array<{ handler?: (ev: unknown) => void }>;
  sent: Array<Record<string, unknown>>;
  emit: (ev: unknown) => void;
};

function mockRoutes(routes: Record<string, unknown>) {
  apiMock.mockImplementation((path: string) => {
    const hit = routes[path.split('?')[0]];
    return hit !== undefined ? Promise.resolve(hit) : Promise.reject(new Error(`no route: ${path}`));
  });
}

const voiceCall: Call = {
  id: 'call-1',
  tenantId: 't1',
  direction: 'OUTBOUND',
  status: 'IN_PROGRESS',
  startedAt: '2026-08-15T10:00:00Z',
  durationSec: 84,
  sttMinutes: 1.4,
  ttsGeneratedChars: 0,
  ttsCachedHits: 0,
  apiCostUsd: 0,
};

const voiceConversation: Conversation = {
  id: 'conv-1',
  tenantId: 't1',
  channel: 'VOICE',
  status: 'OPEN',
  contactNumber: '+201001002030',
  createdAt: '2026-08-15T10:00:00Z',
  call: voiceCall,
};

const waConversation: Conversation = {
  id: 'conv-2',
  tenantId: 't1',
  channel: 'WHATSAPP',
  status: 'OPEN',
  contactNumber: '+201001002031',
  createdAt: '2026-08-15T10:05:00Z',
};

beforeEach(() => {
  apiMock.mockReset();
  WSMock.sent.length = 0;
  WSMock.instances.length = 0;
});

describe('OmnichannelLiveInbox', () => {
  it('يعرض المحادثات المحمّلة من الـ API مع حالة اتصال الواتساب', async () => {
    mockRoutes({ '/conversations': [voiceConversation, waConversation], '/whatsapp/connections': [] });

    render(<OmnichannelLiveInbox />);

    expect(await screen.findByText(/2 محادثة نشطة/)).toBeInTheDocument();
    expect(screen.getAllByText('+201001002030').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+201001002031').length).toBeGreaterThan(0);
    expect(screen.getByText('واتساب غير متصل')).toBeInTheDocument();
  });

  it('تحديث لحظي عبر WebSocket: conversation.open يضيف محادثة و message.new يضيف رسالة', async () => {
    mockRoutes({ '/conversations': [waConversation], '/whatsapp/connections': [] });

    render(<OmnichannelLiveInbox />);
    await screen.findByText(/1 محادثة نشطة/);

    const msg: WhatsappMessage = {
      id: 'msg-1',
      connectionId: 'wa-1',
      conversationId: 'conv-2',
      direction: 'INBOUND',
      body: 'عايز أعرف سعر الباقة الذهبية',
      status: 'DELIVERED',
      spintaxVariant: 0,
      createdAt: '2026-08-15T10:06:00Z',
    };

    act(() => {
      WSMock.emit({ type: 'message.new', message: msg });
      WSMock.emit({ type: 'conversation.open', conversation: { ...voiceConversation, id: 'conv-3' } });
    });

    expect(await screen.findByText('عايز أعرف سعر الباقة الذهبية')).toBeInTheDocument();
    expect(screen.getByText(/2 محادثة نشطة/)).toBeInTheDocument();
    expect(screen.getByText('+201001002030')).toBeInTheDocument();
  });

  it('إرسال رسالة من المحادثة يبثّ message.send عبر WebSocket', async () => {
    mockRoutes({ '/conversations': [waConversation], '/whatsapp/connections': [] });

    const user = userEvent.setup();
    render(<OmnichannelLiveInbox />);
    expect((await screen.findAllByText('+201001002031')).length).toBeGreaterThan(0);

    await user.type(screen.getByPlaceholderText('اكتب ردًا على العميل...'), 'حاضر، هيوصلك عرض السعر قريبًا');
    await user.click(screen.getByRole('button', { name: '' }));

    expect(WSMock.sent).toContainEqual({
      type: 'message.send',
      conversationId: 'conv-2',
      text: 'حاضر، هيوصلك عرض السعر قريبًا',
    });
  });

  it('زر Human Takeover الأحمر يفتح نافذة التأكيد ثم يبثّ takeover.request ويوقف الـ AI', async () => {
    mockRoutes({ '/conversations': [voiceConversation], '/whatsapp/connections': [] });

    const user = userEvent.setup();
    render(<OmnichannelLiveInbox />);
    expect((await screen.findAllByText('+201001002030')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Human Takeover/ }));
    expect(screen.getByText('تأكيد التحويل البشري')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تحويل الآن' }));

    expect(WSMock.sent).toContainEqual({ type: 'takeover.request', conversationId: 'conv-1' });
    expect(await screen.findByText(/استكمل المحادثة كبشري/)).toBeInTheDocument();
  });

  it('takeover.start عبر WebSocket يحدّث الحالة ويعرض اسم المحوّل', async () => {
    mockRoutes({ '/conversations': [voiceConversation], '/whatsapp/connections': [] });

    render(<OmnichannelLiveInbox />);
    expect((await screen.findAllByText('+201001002030')).length).toBeGreaterThan(0);

    act(() => {
      WSMock.emit({ type: 'takeover.start', callId: 'call-1', takenByName: 'أحمد' });
    });

    expect(await screen.findByText(/تحويل بشري: أحمد/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Human Takeover/ })).not.toBeInTheDocument();
  });

  it('حالة فارغة: لا توجد محادثات نشطة', async () => {
    mockRoutes({ '/conversations': [], '/whatsapp/connections': [] });

    render(<OmnichannelLiveInbox />);

    expect(await screen.findByText('لا توجد محادثات نشطة الآن')).toBeInTheDocument();
    expect(screen.getByText(/0 محادثة نشطة/)).toBeInTheDocument();
  });

  it('زر إنهاء المحادثة يستدعي POST /conversations/:id/close ويُزيل المحادثة من القائمة', async () => {
    const user = userEvent.setup();
    mockRoutes({ '/conversations': [voiceConversation], '/whatsapp/connections': [], '/conversations/conv-1/close': { ok: true } });

    render(<OmnichannelLiveInbox />);
    expect((await screen.findAllByText('+201001002030')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /إنهاء المحادثة/ }));

    expect(apiMock).toHaveBeenCalledWith('/conversations/conv-1/close', { method: 'POST' });
    expect(await screen.findByText('لا توجد محادثات نشطة الآن')).toBeInTheDocument();
    expect(screen.getByText(/0 محادثة نشطة/)).toBeInTheDocument();
  });
});
