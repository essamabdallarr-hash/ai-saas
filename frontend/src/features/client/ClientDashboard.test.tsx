import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientDashboard } from './ClientDashboard';
import { api } from '@/lib/api';
import { I18nProvider } from '@/i18n';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  uploadFile: vi.fn(),
  login: vi.fn(),
}));

const apiMock = vi.mocked(api);

const dashboardStats = {
  customers: { total: 10, pending: 5, done: 3, didNotAnswer: 2 },
  month: { cost: 1.23, minutes: 10, calls: 4 },
  recentCalls: [
    { id: 'c1', callerNumber: '+20100000001', status: 'COMPLETED', startedAt: '2026-08-20T10:00:00Z', durationSec: 120 },
  ],
};

function mockApi(overrides?: Record<string, unknown>) {
  apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
    const method = opts?.method ?? 'GET';
    const base = path.split('?')[0];
    if (method === 'GET' && base === '/dashboard') return Promise.resolve(dashboardStats);
    if (method === 'GET' && base === '/whatsapp/connections') return Promise.resolve(overrides?.connections ?? []);
    if (method === 'POST' && base === '/whatsapp/connections') return Promise.resolve(overrides?.createdConnection ?? { id: 'wa1', engine: 'FREE_QR', status: 'QR_PENDING', qrCode: 'data:image/png;base64,abc' });
    if (method === 'POST' && base === '/calls') return Promise.resolve({ callId: 'call1', conversationId: 'conv1', status: 'RINGING' });
    return Promise.reject(new Error(`no route: ${method} ${path}`));
  });
}

function renderDashboard() {
  return render(
    <I18nProvider>
      <ClientDashboard />
    </I18nProvider>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('ClientDashboard — Happy Path', () => {
  it('يعرض إحصائيات العملاء والمكالمات والتكلفة', async () => {
    mockApi();
    renderDashboard();
    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});

describe('ClientDashboard — QR Auto-Create', () => {
  it('happy path: QR card يظهر في Dashboard', async () => {
    mockApi();
    renderDashboard();
    await screen.findByText('10');
    expect(screen.getByRole('button', { name: /عرض رمز QR/ })).toBeInTheDocument();
  });

  it('happy path: فتح QR modal يستدعي GET /whatsapp/connections', async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();
    await screen.findByText('10');
    await user.click(screen.getByRole('button', { name: /عرض رمز QR/ }));
    expect(apiMock).toHaveBeenCalledWith('/whatsapp/connections');
  });

  it('happy path: عند عدم وجود اتصال — يُنشئ FREE_QR تلقائيًا', async () => {
    const user = userEvent.setup();
    const createdConn = { id: 'wa1', engine: 'FREE_QR', status: 'QR_PENDING', qrCode: 'data:image/png;base64,abc' };
    mockApi({ connections: [], createdConnection: createdConn });
    renderDashboard();
    await screen.findByText('10');
    await user.click(screen.getByRole('button', { name: /عرض رمز QR/ }));
    expect(apiMock).toHaveBeenCalledWith('/whatsapp/connections');
    expect(apiMock).toHaveBeenCalledWith('/whatsapp/connections', expect.objectContaining({ method: 'POST' }));
  });

  it('happy path: عند وجود اتصال FREE_QR — لا يُنشئ اتصالًا جديدًا', async () => {
    const user = userEvent.setup();
    const existingConn = { id: 'wa1', engine: 'FREE_QR', status: 'QR_PENDING', qrCode: 'data:image/png;base64,abc' };
    mockApi({ connections: [existingConn] });
    renderDashboard();
    await screen.findByText('10');
    await user.click(screen.getByRole('button', { name: /عرض رمز QR/ }));
    const postCalls = apiMock.mock.calls.filter(([, opts]) => opts && 'method' in opts && (opts as { method: string }).method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('regression: فشل GET يعرض رسالة خطأ لا عدم اتصال', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      const method = opts?.method ?? 'GET';
      if (method === 'GET' && path === '/dashboard') return Promise.resolve(dashboardStats);
      if (method === 'GET' && path === '/whatsapp/connections') return Promise.reject(new Error('فشل الاتصال بالخادم'));
      return Promise.reject(new Error(`no route: ${method} ${path}`));
    });
    renderDashboard();
    await screen.findByText('10');
    await user.click(screen.getByRole('button', { name: /عرض رمز QR/ }));
    expect(await screen.findByText('فشل الاتصال بالخادم')).toBeInTheDocument();
  });

  it('regression: إنشاء اتصال فاشل يعرض خطأ QR', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      const method = opts?.method ?? 'GET';
      if (method === 'GET' && path === '/dashboard') return Promise.resolve(dashboardStats);
      if (method === 'GET' && path === '/whatsapp/connections') return Promise.resolve([]);
      if (method === 'POST' && path === '/whatsapp/connections') return Promise.reject(new Error('CONNECTION_EXISTS'));
      return Promise.reject(new Error(`no route: ${method} ${path}`));
    });
    renderDashboard();
    await screen.findByText('10');
    await user.click(screen.getByRole('button', { name: /عرض رمز QR/ }));
    expect(await screen.findByText('فشل إنشاء اتصال QR')).toBeInTheDocument();
  });
});

describe('ClientDashboard — QR Polling', () => {
  it('happy path: QR modal يعرض QR code عندما يكون الحالة QR_PENDING', async () => {
    const user = userEvent.setup();
    const conn = { id: 'wa1', engine: 'FREE_QR', status: 'QR_PENDING', qrCode: 'data:image/png;base64,abc' };
    mockApi({ connections: [conn] });
    renderDashboard();
    await screen.findByText('10');
    await user.click(screen.getByRole('button', { name: /عرض رمز QR/ }));
    expect(await screen.findByAltText('QR')).toBeInTheDocument();
  });

  it('happy path: QR modal يعرض حالة CONNECTED عند الاتصال', async () => {
    const user = userEvent.setup();
    const conn = { id: 'wa1', engine: 'FREE_QR', status: 'CONNECTED', qrCode: null };
    mockApi({ connections: [conn] });
    renderDashboard();
    await screen.findByText('10');
    await user.click(screen.getByRole('button', { name: /عرض رمز QR/ }));
    expect(await screen.findByText(/متصل/)).toBeInTheDocument();
  });
});

describe('ClientDashboard — Simulation', () => {
  it('happy path: زر اختبار البوت يفتح نافذة المحاكاة', async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();
    await screen.findByText('10');
    await user.click(screen.getByRole('button', { name: /اختبار البوت/ }));
    expect(screen.getByText(/رقم الهاتف/)).toBeInTheDocument();
  });

  it('happy path: إرسال رقم يستدعي POST /calls', async () => {
    const user = userEvent.setup();
    mockApi();
    renderDashboard();
    await screen.findByText('10');
    await user.click(screen.getByRole('button', { name: /اختبار البوت/ }));
    await user.type(screen.getByPlaceholderText('+201000000000'), '+201001002030');
    await user.click(screen.getByRole('button', { name: /ابدأ الاختبار/ }));
    expect(apiMock).toHaveBeenCalledWith('/calls', { method: 'POST', json: { toNumber: '+201001002030' } });
  });
});
