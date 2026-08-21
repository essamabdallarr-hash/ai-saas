import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentBuilder } from './AgentBuilder';
import { api } from '@/lib/api';
import { I18nProvider } from '@/i18n';
import type { Agent } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  uploadFile: vi.fn(),
  login: vi.fn(),
}));

const apiMock = vi.mocked(api);

const agent: Agent = {
  id: 'a1',
  tenantId: 't1',
  name: 'الوكيل الرئيسي',
  status: 'ACTIVE',
  language: 'ar',
  objective: 'بيع الباقات',
  voiceProvider: 'AZURE',
  voiceId: 'ar-EG-SalmaNeural',
  voiceRate: 1,
  sttProvider: 'deepgram',
  llmProvider: 'openai',
  llmModel: 'gpt-4o-mini',
  sileroVadEnabled: true,
  bargeInEnabled: true,
  smartTtsCacheEnabled: true,
  maxTurnsBeforeHandoff: 6,
  systemPrompt: '',
  promptVersion: 3,
  dynamicFields: [],
  documents: [
    {
      id: 'd1',
      name: 'catalog.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      status: 'READY',
      chunkCount: 4,
      createdAt: '2026-08-15T09:00:00Z',
    },
  ],
};

beforeEach(() => {
  apiMock.mockReset();
});

describe('AgentBuilder', () => {
  it('happy path: تحميل الوكيل وتعديل اسمه ثم حفظه عبر PUT', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      if ((opts?.method ?? 'GET') === 'GET' && path === '/agents/current') return Promise.resolve(agent);
      if ((opts?.method ?? 'GET') === 'PUT' && path === '/agents/a1') return Promise.resolve(agent);
      return Promise.reject(new Error(`no route: ${path}`));
    });

    render(<I18nProvider><AgentBuilder /></I18nProvider>);

    const nameInput = await screen.findByDisplayValue('الوكيل الرئيسي');
    await user.clear(nameInput);
    await user.type(nameInput, 'وكيل المبيعات');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(await screen.findByText('تم حفظ الوكيل بنجاح.')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith('/agents/a1', { method: 'PUT', json: expect.any(Object) });
    const [, opts] = apiMock.mock.calls.find(([p]) => p === '/agents/a1') as [string, { method: string; json: Agent }];
    expect(opts.json.name).toBe('وكيل المبيعات');
  });

  it('regression: تبويب قاعدة المعرفة للعميل للقراءة فقط — لا زر رفع ولا نظام أوامر مرئي', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((path: string) => {
      if (path === '/agents/current') return Promise.resolve(agent);
      return Promise.reject(new Error(`no route: ${path}`));
    });

    render(<I18nProvider><AgentBuilder /></I18nProvider>);
    await screen.findByDisplayValue('الوكيل الرئيسي');

    await user.click(screen.getByRole('button', { name: /قاعدة المعرفة/ }));

    expect(screen.queryByRole('button', { name: /رفع ملف/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /حذف/ })).not.toBeInTheDocument();
    expect(screen.getByText('catalog.pdf')).toBeInTheDocument();
    expect(screen.getByText('جاهز')).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith('/documents', expect.anything());
  });
});
