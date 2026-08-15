import type { UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { ApiError } from './errors';

export interface AuthUser {
  userId: string;
  tenantId: string | null;
  role: UserRole;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ userId: user.userId, tenantId: user.tenantId, role: user.role }, config.jwtSecret, {
    expiresIn: '7d',
  });
}

export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, config.jwtSecret) as { userId: string; tenantId: string | null; role: UserRole };
  if (!payload?.userId) throw new ApiError(401, 'توكن غير صالح', 'INVALID_TOKEN');
  return { userId: payload.userId, tenantId: payload.tenantId, role: payload.role };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    next(new ApiError(401, 'غير مصرّح — يلزم توكن', 'UNAUTHORIZED'));
    return;
  }
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    next(new ApiError(401, 'توكن منتهي أو غير صالح', 'INVALID_TOKEN'));
  }
}

export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  requireAuth(req, _res, (err) => {
    if (err) return next(err);
    if (!req.auth?.tenantId) return next(new ApiError(403, 'يلزم عمل (Tenant) نشط', 'TENANT_REQUIRED'));
    next();
  });
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  requireAuth(req, _res, (err) => {
    if (err) return next(err);
    if (req.auth?.role !== 'SUPER_ADMIN') return next(new ApiError(403, 'يلزم صلاحيات Super Admin', 'FORBIDDEN'));
    next();
  });
}
