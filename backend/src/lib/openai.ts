import { config } from '../config';
import { ApiError } from './errors';
import { decryptSecret } from './crypto';
import { prisma } from './prisma';

/**
 * محلّل عميل OpenAI المشترك بين AiProcessorService و RagService.
 * - مفتاح العميل المخزن (مشفر في DB) يسبق مفتاح المنصة العام (env).
 * - النموذج المخصص للعميل يسبق النموذج الافتراضي.
 * - التخزين المؤقت لكل مستأجر لتجنب إعادة إنشاء العميل في كل استدعاء.
 */
export interface ResolvedOpenAI {
  client: any;
  llmModel: string;
}

const cache = new Map<string, { client: any; llmModel: string }>();

export async function openAIClientFor(tenantId?: string | null): Promise<ResolvedOpenAI> {
  let apiKey = config.openaiApiKey;
  let llmModel = config.openaiLlmModel;

  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { openaiApiKeyEnc: true, openaiModel: true },
    });
    if (tenant?.openaiApiKeyEnc) apiKey = decryptSecret(tenant.openaiApiKeyEnc);
    if (tenant?.openaiModel) llmModel = tenant.openaiModel;
  }

  if (!apiKey) {
    throw new ApiError(503, 'OPENAI_API_KEY غير مهيأة', 'AI_NOT_CONFIGURED');
  }

  const cacheKey = tenantId ?? 'global';
  const hit = cache.get(cacheKey);
  if (hit && hit.llmModel === llmModel) return hit;

  const { OpenAI } = require('openai') as typeof import('openai');
  const resolved = { client: new OpenAI({ apiKey }), llmModel };
  cache.set(cacheKey, resolved);
  return resolved;
}
