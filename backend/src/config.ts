import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  // المفتاح الرئيسي لتشفير أسرار العملاء عند التخزين (AES-256-GCM).
  // مستقل عن JWT_SECRET حتى يمكن تدوير أحدهما دون كسر الآخر.
  secretKey: process.env.SECRET_KEY ?? process.env.JWT_SECRET ?? 'change-me',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  devAuthEnabled: process.env.DEV_AUTH_ENABLED === 'true',

  rapidaGrpcUrl: process.env.RAPIDA_ASSISTANT_GRPC_URL ?? '',
  rapidaAssistantId: Number(process.env.RAPIDA_ASSISTANT_ID ?? 1),
  rapidaAssistantVersion: process.env.RAPIDA_ASSISTANT_VERSION ?? '1.0.0',

  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiLlmModel: process.env.OPENAI_LLM_MODEL ?? 'gpt-4o-mini',
  openaiEmbedModel: process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small',

  azureSpeechKey: process.env.AZURE_SPEECH_KEY ?? '',
  azureSpeechRegion: process.env.AZURE_SPEECH_REGION ?? 'eastus',

  metaGraphVersion: process.env.META_GRAPH_VERSION ?? 'v21.0',
  metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? 'verify-me',

  storageDir: process.env.STORAGE_DIR ?? './storage',
} as const;
