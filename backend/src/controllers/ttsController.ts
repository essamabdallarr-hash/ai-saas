import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { ttsService } from '../services/ai/TtsSmartCache';
import { config } from '../config';

export async function ttsPreview(req: Request, res: Response): Promise<void> {
  const { text, voiceId } = req.body ?? {};
  if (!text || !voiceId) throw new ApiError(422, 'يلزم text و voiceId', 'MISSING_TTS_PARAMS');

  const tenant = await prisma.tenant.findUnique({
    where: { id: req.auth!.tenantId! },
    include: { featureToggles: true },
  });
  if (!tenant) throw new ApiError(404, 'المستأجر غير موجود', 'TENANT_NOT_FOUND');

  const result = await ttsService.synthesize({
    tenantId: tenant.id,
    text: String(text),
    voiceId: String(voiceId),
    enabled: tenant.featureToggles?.ttsSmartCacheEnabled ?? true,
  });
  res.json(result);
}

export async function ttsCacheStats(req: Request, res: Response): Promise<void> {
  const agg = await prisma.ttsCache.aggregate({
    where: { tenantId: req.auth!.tenantId! },
    _sum: { hits: true },
    _count: true,
  });
  res.json({ entries: agg._count, totalHits: agg._sum.hits ?? 0 });
}

export async function usage(req: Request, res: Response): Promise<void> {
  const month = String(req.query.month ?? 'current');
  const key = month === 'current' ? new Date().toISOString().slice(0, 7) : month;

  const ledger = await prisma.usageLedger.findUnique({
    where: { tenantId_month: { tenantId: req.auth!.tenantId!, month: key } },
  });
  res.json(
    ledger ?? {
      month: key,
      voiceMinutes: 0,
      whatsappMsgs: 0,
      ttsCachedChars: 0,
      ttsGeneratedChars: 0,
      apiCostUsd: 0,
    },
  );
}

export async function ttsUsageHints(_req: Request, res: Response): Promise<void> {
  // مثال على تسعير الكاش: متوسط كلفة Azure TTS للعربية ≈ $15/1M حرف
  const costPerChar = 0.000015;
  res.json({ costPerCharUsd: costPerChar, hint: 'الاستفادة من الكاش تقلّص التكلفة المتوسطة للدقيقة', min: config.storageDir });
}
