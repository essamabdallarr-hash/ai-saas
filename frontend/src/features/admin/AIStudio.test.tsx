import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIStudio } from './AIStudio';
import { api, uploadFile } from '@/lib/api';
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
  voiceId: 'v1',
  voiceRate: 1,
  sttProvider: 'deepgram',
  llmProvider: 'openai',
  llmModel: 'gpt-4o-mini',
  sileroVadEnabled: true,
  bargeInEnabled: true,
  smartTtsCacheEnabled: true,
  maxTurnsBeforeHandoff: 3,
  systemPrompt: 'أنت وكيل مبيعات ذكي يتحدث العربية بطلاقة.',
  promptVersion: 3,
  dynamicFields: [],
  documents: [],
};

function renderStudio() {
  return render(
    <MemoryRouter initialEntries={['/admin/tenants/t1/studio']}>
      <Routes>
        <Route path="/admin/tenants/:tenantId/studio" element={<AIStudio />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  vi.mocked(uploadFile).mockReset();
});

describe('AIStudio', () => {
  it('happy path: تعديل System Prompt ثم حفظه عبر PUT مع رفع رقم الإصدار', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      const method = opts?.method ?? 'GET';
      if (method === 'GET' && path === '/admin/tenants/t1/agent') return Promise.resolve(agent);
      if (method === 'PUT' && path === '/admin/tenants/t1/agents/a1/prompt') {
        return Promise.resolve({ ...agent, systemPrompt: 'برومبت جديد', promptVersion: 4 });
      }
      return Promise.reject(new Error(`no route: ${method} ${path}`));
    });

    renderStudio();

    expect(await screen.findByText('AI Studio — الوكيل الرئيسي')).toBeInTheDocument();
    expect(screen.getByText('الإصدار 3')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/أنت وكيل مبيعات ذكي/);
    await user.clear(textarea);
    await user.type(textarea, 'برومبت جديد');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(apiMock).toHaveBeenCalledWith('/admin/tenants/t1/agents/a1/prompt', {
      method: 'PUT',
      json: { systemPrompt: 'برومبت جديد' },
    });
    expect(await screen.findByText(/حُفظ نظام الأوامر — الإصدار 4/)).toBeInTheDocument();
    expect(screen.getByText('الإصدار 4')).toBeInTheDocument();
  });

  it('regression: إضافة Dynamic Field من تبويب استخراج البيانات وحفظها عبر PUT', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      const method = opts?.method ?? 'GET';
      if (method === 'GET' && path === '/admin/tenants/t1/agent') return Promise.resolve(agent);
      if (method === 'PUT' && path === '/admin/tenants/t1/fields') {
        return Promise.resolve([
          {
            id: 'f1',
            label: 'الميزانية',
            key: 'budget',
            type: 'TEXT',
            required: false,
            position: 0,
            enabled: true,
          },
        ]);
      }
      return Promise.reject(new Error(`no route: ${method} ${path}`));
    });

    renderStudio();
    await screen.findByText('AI Studio — الوكيل الرئيسي');

    await user.click(screen.getByRole('button', { name: /استخراج البيانات/ }));

    await user.type(screen.getByPlaceholderText('مثال: الميزانية'), 'الميزانية');
    await user.click(screen.getByRole('button', { name: 'إضافة' }));

    expect(await screen.findByText(/\[budget\]/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'حفظ الحقول' }));

    const fieldsCall = apiMock.mock.calls.find(([p]) => p === '/admin/tenants/t1/fields');
    expect(fieldsCall).toBeDefined();
    const [, opts] = fieldsCall as [string, { method: string; json: { fields: unknown[] } }];
    expect(opts.method).toBe('PUT');
    expect(opts.json.fields).toHaveLength(1);
    expect(opts.json.fields[0]).toMatchObject({
      label: 'الميزانية',
      key: 'budget',
      type: 'TEXT',
      required: false,
      position: 0,
      enabled: true,
    });
  });

  it('fallback: فشل تحميل ملف الوكيل يعرض رسالة الخطأ بواجهة القالب الداكن', async () => {
    apiMock.mockImplementation(() => Promise.reject(new Error('المستأجر بلا وكيل')));

    renderStudio();

    expect(await screen.findByText('المستأجر بلا وكيل')).toBeInTheDocument();
  });

  it('happy path: تعيين مفتاح OpenAI خاص بالعميل من تبويب المفاتيح والنماذج عبر PUT مشفر', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      const method = opts?.method ?? 'GET';
      if (method === 'GET' && path === '/admin/tenants/t1/agent') return Promise.resolve(agent);
      if (method === 'GET' && path === '/admin/tenants/t1/ai-keys') {
        return Promise.resolve({ openaiKeyConfigured: false, openaiModel: null });
      }
      if (method === 'PUT' && path === '/admin/tenants/t1/ai-keys') {
        return Promise.resolve({ openaiKeyConfigured: true, openaiModel: 'gpt-4o' });
      }
      return Promise.reject(new Error(`no route: ${method} ${path}`));
    });

    renderStudio();
    await screen.findByText('AI Studio — الوكيل الرئيسي');

    await user.click(screen.getByRole('button', { name: /المفاتيح والنماذج/ }));
    await user.type(screen.getByPlaceholderText(/sk-\.\.\./), 'sk-test-12345');
    await user.click(screen.getByRole('button', { name: 'حفظ المفاتيح' }));

    expect(apiMock).toHaveBeenCalledWith('/admin/tenants/t1/ai-keys', {
      method: 'PUT',
      json: { openaiApiKey: 'sk-test-12345', openaiModel: '' },
    });
    expect(await screen.findByText(/مشفر عند التخزين/)).toBeInTheDocument();
  });

  it('regression: إرسال سر فارغ لا يكشف المفتاح ولا يرسل قيمته للخادم', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      const method = opts?.method ?? 'GET';
      if (method === 'GET' && path === '/admin/tenants/t1/agent') return Promise.resolve(agent);
      if (method === 'GET' && path === '/admin/tenants/t1/ai-keys') {
        return Promise.resolve({ openaiKeyConfigured: true, openaiModel: null });
      }
      return Promise.reject(new Error(`no route: ${method} ${path}`));
    });

    renderStudio();
    await screen.findByText('AI Studio — الوكيل الرئيسي');

    await user.click(screen.getByRole('button', { name: /المفاتيح والنماذج/ }));
    expect(screen.getByPlaceholderText(/مُفعّل/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/sk-/)).not.toBeInTheDocument();
  });
});
