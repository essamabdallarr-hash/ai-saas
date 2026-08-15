import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, `المسار غير موجود: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code ?? 'API_ERROR', message: err.message } });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'خطأ داخلي في الخادم' } });
}

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

export function asyncHandler(fn: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
