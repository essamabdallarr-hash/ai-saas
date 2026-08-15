import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/auth';
import { ApiError } from '../lib/errors';
import { config } from '../config';
import { verifyPassword } from '../lib/password';

function publicUser(u: { id: string; email: string; name: string; role: string; tenantId: string | null; active: boolean }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, active: u.active };
}

/** تسجيل دخول بكلمة مرور — يُستخدم بعد إنشاء العميل من بوابة الإدارة (Create Client) */
export async function login(req: Request, res: Response): Promise<void> {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) throw new ApiError(422, 'يلزم email و password', 'MISSING_CREDENTIALS');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) throw new ApiError(401, 'بيانات الدخول غير صحيحة', 'INVALID_CREDENTIALS');
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, 'بيانات الدخول غير صحيحة', 'INVALID_CREDENTIALS');
  }
  if (!user.active) throw new ApiError(403, 'الحساب موقوف', 'ACCOUNT_DISABLED');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tenant = user.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        include: { tierLimit: true, featureToggles: true },
      })
    : null;

  const token = signToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
  res.json({ token, user: publicUser(user), tenant });
}

/** تسجيل دخول تطويري — في الإنتاج يُستبدل بمزوّد هوية حقيقي */
export async function devLogin(req: Request, res: Response): Promise<void> {
  if (!config.devAuthEnabled) throw new ApiError(403, 'تسجيل الدخول التطويري معطّل', 'DEV_AUTH_DISABLED');

  const email = String(req.body?.email ?? 'admin@demo.local').trim().toLowerCase();
  const name = String(req.body?.name ?? 'مدير التجربة');
  const tenantSlug = String(req.body?.tenantSlug ?? 'demo').trim().toLowerCase();

  let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: tenantSlug, slug: tenantSlug } });
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name, role: 'CLIENT_ADMIN', tenantId: tenant.id, active: true },
    });
  }

  const token = signToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
  res.json({ token, user: publicUser(user), tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status } });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) throw new ApiError(404, 'المستخدم غير موجود', 'USER_NOT_FOUND');
  const tenant = user.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        include: { tierLimit: true, featureToggles: true },
      })
    : null;
  res.json({ user: publicUser(user), tenant });
}
