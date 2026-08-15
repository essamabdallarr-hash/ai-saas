import axios, { AxiosError } from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * عميل axios مركزي — يرفق توكن JWT تلقائيًا ويوحّد رسائل الخطأ.
 * REST عبر /api، و WebSocket للـ Live Inbox منفصل في lib/ws.ts.
 */
export const http = axios.create({
  baseURL: API_BASE,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

http.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ error?: string; code?: string }>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
    }
    return Promise.reject(
      new ApiError(
        error.response?.status ?? 0,
        error.response?.data?.error ?? error.message ?? 'فشل الاتصال بالخادم',
        error.response?.data?.code,
      ),
    );
  },
);

/** استدعاء JSON عام (axios) */
export async function api<T>(
  path: string,
  options: { method?: string; json?: unknown; params?: Record<string, string> } = {},
): Promise<T> {
  const res = await http.request<T>({
    url: path,
    method: options.method ?? 'GET',
    params: options.params,
    data: options.json,
  });
  return res.data;
}

/** رفع ملف (FormData) — يستخدم لملفات قاعدة المعرفة RAG */
export async function uploadFile<T>(path: string, file: File, extra?: Record<string, string>): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
  }
  const res = await http.post<T>(path, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data;
}

/** تسجيل الدخول بكلمة مرور — يخزّن التوكن تلقائيًا */
export async function login(email: string, password: string): Promise<{ token: string }> {
  const res = await http.post<{ token: string }>('/auth/login', { email, password });
  localStorage.setItem('token', res.data.token);
  return res.data;
}
