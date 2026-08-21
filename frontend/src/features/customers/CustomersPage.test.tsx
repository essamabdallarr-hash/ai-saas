import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomersPage } from './CustomersPage';
import { api, uploadFile } from '@/lib/api';
import { I18nProvider } from '@/i18n';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  uploadFile: vi.fn(),
  login: vi.fn(),
}));

const apiMock = vi.mocked(api);

const customerPage = {
  items: [
    { id: 'c1', customerCode: 90001, name: 'أحمد', phone: '01000000001', email: null, status: 'PENDING', outcomeId: null, outcome: null, createdAt: '2026-06-15T10:00:00Z' },
    { id: 'c2', customerCode: 90002, name: 'محمد', phone: '01000000002', email: null, status: 'DONE', outcomeId: 'o1', outcome: { id: 'o1', label: 'مهتم' }, createdAt: '2026-06-20T12:00:00Z' },
    { id: 'c3', customerCode: 90003, name: 'سارة', phone: '01000000003', email: null, status: 'DID_NOT_ANSWER', outcomeId: null, outcome: null, createdAt: '2026-07-01T09:00:00Z' },
  ],
  total: 50,
  page: 1,
  pageSize: 10,
  totalPages: 5,
};

const emptyPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 0,
};

const outcomes = [
  { id: 'o1', label: 'مهتم' },
  { id: 'o2', label: 'غير مهتم' },
];

function mockApi(overrides?: { empty?: boolean }) {
  apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
    const method = opts?.method ?? 'GET';
    if (method === 'GET' && path === '/customers') return Promise.resolve(overrides?.empty ? emptyPage : customerPage);
    if (method === 'GET' && path === '/outcomes') return Promise.resolve(outcomes);
    if (method === 'DELETE' && path === '/customers') return Promise.resolve({ deleted: 1 });
    if (method === 'POST' && path === '/campaigns') return Promise.resolve({ id: 'camp1', status: 'DRAFT' });
    return Promise.reject(new Error(`no route: ${method} ${path}`));
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <CustomersPage />
      </I18nProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  vi.mocked(uploadFile).mockReset();
});

describe('CustomersPage — Checkboxes & Select All', () => {
  it('happy path: يعرض صفوف مع خانات اختيار وعمود تحديد الكل', async () => {
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(4);
  });

  it('happy path: النقر على خانة اختيار يُظهر عداد المحدد', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const rowCheckboxes = screen.getAllByRole('checkbox');
    await user.click(rowCheckboxes[1]);
    expect(screen.getByText(/محدد: 1/)).toBeInTheDocument();
  });

  it('happy path: النقر على تحديد الكل يُحدد كل صفوف الصفحة', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);
    expect(screen.getByText(/محدد: 3/)).toBeInTheDocument();
    expect(screen.getByText('حذف المحدد')).toBeInTheDocument();
    expect(screen.getByText('إطلاق حملة')).toBeInTheDocument();
  });

  it('regression: تغيير فلتر البحث يلغي التحديد', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);
    expect(screen.getByText(/محدد: 3/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/بحث/), 'أحمد');
    expect(screen.queryByText(/محدد:/)).not.toBeInTheDocument();
  });

  it('regression: كل خانة صف مستقلة — تحديد واحد لا يُحدد البقية', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    expect(screen.getByText(/محدد: 1/)).toBeInTheDocument();
    expect(checkboxes[2]).not.toBeChecked();
    expect(checkboxes[3]).not.toBeChecked();
  });
});

describe('CustomersPage — PageSize Selector', () => {
  it('happy path: مُنتقي صفحة يظهر 10/50/100 و10 افتراضي', async () => {
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const selects = screen.getAllByRole('combobox');
    const pageSizeSelect = selects[selects.length - 1];
    const options = (pageSizeSelect as HTMLSelectElement).options;
    expect(options.length).toBe(3);
    expect(options[0].value).toBe('10');
    expect(options[1].value).toBe('50');
    expect(options[2].value).toBe('100');
  });

  it('happy path: تغيير pageSize يُعيد تحميل الصفحة الأولى', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const selects = screen.getAllByRole('combobox');
    const pageSizeSelect = selects[selects.length - 1];
    await user.selectOptions(pageSizeSelect, '50');
    expect(apiMock).toHaveBeenCalledWith('/customers', expect.objectContaining({ params: expect.objectContaining({ pageSize: '50' }) }));
  });

  it('regression: تغيير pageSize يلغي التحديد', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    expect(screen.getByText(/محدد: 1/)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    const pageSizeSelect = selects[selects.length - 1];
    await user.selectOptions(pageSizeSelect, '50');
    expect(screen.queryByText(/محدد:/)).not.toBeInTheDocument();
  });

  it('happy path: مُنتقي صفحة يظهر دائمًا حتى مع صفر نتائج', async () => {
    mockApi({ empty: true });
    renderPage();
    await screen.findByText(/عرض.*نتائج/);
    const selects = screen.getAllByRole('combobox');
    const pageSizeSelect = selects[selects.length - 1];
    const options = (pageSizeSelect as HTMLSelectElement).options;
    expect(options.length).toBe(3);
    expect(options[0].value).toBe('10');
    expect(options[1].value).toBe('50');
    expect(options[2].value).toBe('100');
  });
});

describe('CustomersPage — Date Filter', () => {
  it('happy path: حقلين تاريخ مرئيّين (من / إلى)', async () => {
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const dateFrom = screen.getByPlaceholderText('من تاريخ');
    const dateTo = screen.getByPlaceholderText('إلى تاريخ');
    expect(dateFrom).toBeInTheDocument();
    expect(dateTo).toBeInTheDocument();
  });

  it('happy path: تغيير تاريخ يُعيد تحميل البيانات مع dateFrom و dateTo', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const dateFrom = screen.getByPlaceholderText('من تاريخ');
    const dateTo = screen.getByPlaceholderText('إلى تاريخ');
    await user.type(dateFrom, '2026-06-01');
    await user.type(dateTo, '2026-06-30');
    expect(apiMock).toHaveBeenCalledWith('/customers', expect.objectContaining({
      params: expect.objectContaining({ dateFrom: '2026-06-01', dateTo: '2026-06-30' }),
    }));
  });

  it('regression: تغيير تاريخ يلغي التحديد ويُعيده للصفحة الأولى', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    expect(screen.getByText(/محدد: 1/)).toBeInTheDocument();
    const dateFrom = screen.getByPlaceholderText('من تاريخ');
    await user.type(dateFrom, '2026-06-01');
    expect(screen.queryByText(/محدد:/)).not.toBeInTheDocument();
  });
});

describe('CustomersPage — Delete Popup', () => {
  it('happy path: زر حذف المحدد يفتح نافذة تأكيد ثم يُنفّذ DELETE مع ids', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    await user.click(screen.getByText('حذف المحدد'));
    expect(screen.getByText(/هل تريد حذف/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'حذف' }));
    expect(apiMock).toHaveBeenCalledWith('/customers', expect.objectContaining({
      method: 'DELETE',
      json: { ids: ['c1'] },
    }));
  });

  it('happy path: حذف مع Select All يُرسل allMatching مع dateFrom/dateTo', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const dateFrom = screen.getByPlaceholderText('من تاريخ');
    await user.type(dateFrom, '2026-06-01');
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);
    await user.click(screen.getByText('حذف المحدد'));
    await user.click(screen.getByRole('button', { name: 'حذف' }));
    expect(apiMock).toHaveBeenCalledWith('/customers', expect.objectContaining({
      method: 'DELETE',
      json: expect.objectContaining({ allMatching: true, filters: expect.objectContaining({ dateFrom: '2026-06-01' }) }),
    }));
  });

  it('regression: زر حذف لا يظهر بدون تحديد', async () => {
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    expect(screen.queryByText('حذف المحدد')).not.toBeInTheDocument();
  });
});

describe('CustomersPage — Campaign Popup', () => {
  it('happy path: زر إطلاق حملة يفتح نافذة مع VOICE/CHAT/BOTH', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    await user.click(screen.getByText('إطلاق حملة'));
    expect(screen.getByText('اسم الحملة')).toBeInTheDocument();
    expect(screen.getByText('مكالمة صوتية')).toBeInTheDocument();
    expect(screen.getByText('محادثة واتساب')).toBeInTheDocument();
    expect(screen.getByText('كلاهما')).toBeInTheDocument();
  });

  it('happy path: إرسال حملة VOICE مع customerIds', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    await user.click(screen.getByText('إطلاق حملة'));
    const allInputs = screen.getAllByRole('textbox');
    const nameInput = allInputs[allInputs.length - 1];
    await user.type(nameInput, 'حملة اختبار');
    await user.click(screen.getByText('بدء الحملة'));
    expect(apiMock).toHaveBeenCalledWith('/campaigns', expect.objectContaining({
      method: 'POST',
      json: expect.objectContaining({ type: 'VOICE', customerIds: ['c1'] }),
    }));
  });

  it('regression: زر بدء الحملة معطّل إذا اسم الحملة فارغ', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    await user.click(screen.getByText('إطلاق حملة'));
    const startBtn = screen.getByText('بدء الحملة');
    expect(startBtn).toBeDisabled();
  });
});

describe('CustomersPage — Upload Excel', () => {
  it('happy path: زر رفع ملف Excel يفتح نافذة الرفع', async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    await user.click(screen.getByText('رفع ملف Excel'));
    expect(screen.getByText('رفع قائمة عملاء من Excel')).toBeInTheDocument();
  });

  it('happy path: رفع ملف يستدعي uploadFile ويُعيد تحميل البيانات', async () => {
    const user = userEvent.setup();
    vi.mocked(uploadFile).mockResolvedValue({ rowCount: 5 });
    mockApi();
    renderPage();
    await screen.findByText('أحمد');
    await user.click(screen.getByText('رفع ملف Excel'));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'customers.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await user.upload(fileInput, file);
    await user.click(screen.getByText('رفع الملف'));
    expect(await screen.findByText(/تم رفع 5 عميل/)).toBeInTheDocument();
  });
});
