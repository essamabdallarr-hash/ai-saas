// ============================================================
// الأنواع المشتركة — تطابق مخطط Prisma في backend/prisma/schema.prisma
// ============================================================

export type TenantStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'CANCELLED';
export type UserRole = 'SUPER_ADMIN' | 'CLIENT_ADMIN' | 'CLIENT_AGENT';
export type AgentStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED';
export type VoiceProvider = 'AZURE' | 'ELEVENLABS' | 'CARTESIA' | 'OPENAI';
export type CallStatus =
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'TRANSFERRED_TO_HUMAN';
export type Speaker = 'CUSTOMER' | 'AGENT' | 'SYSTEM';
export type DynamicFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT' | 'CURRENCY';
export type WhatsappEngine = 'FREE_QR' | 'OFFICIAL_META' | 'HYBRID';
export type WhatsappConnectionStatus =
  | 'DISCONNECTED'
  | 'QR_PENDING'
  | 'CONNECTED'
  | 'BROKEN'
  | 'BANNED';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type MessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'BLOCKED';
export type ConversationChannel = 'VOICE' | 'WHATSAPP';
export type ConversationStatus = 'OPEN' | 'CLOSED' | 'HUMAN_TAKEOVER';

// ——— Tenant ———
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  currency: string;
  tierLimit?: TierLimit;
  featureToggles?: FeatureToggle;
}

/** صف مستأجر في جدول الإدارة — مع العدادات */
export interface TenantListItem extends Tenant {
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    users?: number;
    agents?: number;
    calls?: number;
    conversations?: number;
  };
}

/** مقاييس المنصة الكلية — GET /admin/metrics */
export interface AdminMetrics {
  tenants: number;
  users: number;
  agents: number;
  totalCalls: number;
  activeCalls: number;
  totalVoiceSeconds: number;
  totalCostUsd: number;
  whatsappMessages: number;
  usageByTenant: UsageLedger[];
}

/** استجابة تسجيل الدخول — POST /auth/login */
export interface LoginResponse {
  token: string;
  user: User;
  tenant?: Tenant | null;
}

export interface TierLimit {
  tierName: string;
  monthlyVoiceMinutes: number;
  monthlyWhatsAppMsgs: number;
  maxConcurrentCalls: number;
  maxSeats: number;
  monthlyPriceUsd: number;
  overagePerMinuteUsd: number;
  overagePerMsgUsd: number;
}

export interface FeatureToggle {
  voiceAiEnabled: boolean;
  freeWhatsAppEnabled: boolean;
  officialMetaApiEnabled: boolean;
  ragEnabled: boolean;
  dataExtractionEnabled: boolean;
  liveInboxEnabled: boolean;
  humanTakeoverEnabled: boolean;
  ttsSmartCacheEnabled: boolean;
  sileroVadEnabled: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId?: string;
  active: boolean;
}

// ——— Agent ———
export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  status: AgentStatus;
  language: string;
  objective: string;
  voiceProvider: VoiceProvider;
  voiceId: string;
  voiceRate: number;
  sttProvider: string;
  llmProvider: string;
  llmModel: string;
  sileroVadEnabled: boolean;
  bargeInEnabled: boolean;
  smartTtsCacheEnabled: boolean;
  fallbackPhoneNumber?: string;
  maxTurnsBeforeHandoff: number;
  systemPrompt: string;
  promptVersion: number;
  dynamicFields: DynamicField[];
  documents: KnowledgeDocument[];
}

// ——— Dynamic Data Extraction ———
export interface DynamicField {
  id: string;
  label: string;
  key: string;
  type: DynamicFieldType;
  description?: string;
  exampleValue?: string;
  required: boolean;
  position: number;
  enabled: boolean;
}

export interface ExtractedValue {
  id: string;
  callId: string;
  fieldId: string;
  value: string;
  confidence?: number;
  rawQuote?: string;
}

// ——— Knowledge Base (RAG) ———
export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export interface KnowledgeDocument {
  id: string;
  name: string;
  fileType: string;
  fileSize: number;
  status: DocumentStatus;
  chunkCount: number;
  error?: string;
  createdAt: string;
}

// ——— Call + Live Transcript ———
export interface Call {
  id: string;
  tenantId: string;
  agentId?: string;
  conversationId?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  callerNumber?: string;
  status: CallStatus;
  startedAt: string;
  endedAt?: string;
  durationSec: number;
  sttMinutes: number;
  ttsGeneratedChars: number;
  ttsCachedHits: number;
  apiCostUsd: number;
  transcript?: string;
  aiSummary?: string;
  extractedData?: Record<string, string>;
  audioUrl?: string;
  takeoverAt?: string;
  takenOverByName?: string;
}

export interface TranscriptEvent {
  id: string;
  callId: string;
  speaker: Speaker;
  text: string;
  isFinal: boolean;
  createdAt: string;
}

// ——— WhatsApp ———
export interface WhatsappConnection {
  id: string;
  tenantId: string;
  engine: WhatsappEngine;
  status: WhatsappConnectionStatus;
  qrCode?: string;
  qrExpiresAt?: string;
  metaPhoneNumberId?: string;
  typingDelayMs: number;
  spintaxEnabled: boolean;
  outboundBlocked: boolean;
  error?: string;
}

export interface WhatsappMessage {
  id: string;
  connectionId: string;
  conversationId: string;
  direction: MessageDirection;
  body: string;
  templateName?: string;
  status: MessageStatus;
  spintaxVariant: number;
  createdAt: string;
}

// ——— Conversation (Omnichannel) ———
export interface Conversation {
  id: string;
  tenantId: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  contactNumber: string;
  contactName?: string;
  agentId?: string;
  assignedToId?: string;
  lastMessageAt?: string;
  createdAt: string;
  call?: Call;
  messages?: WhatsappMessage[];
}

// ——— Reports ———
export interface ReportRow {
  callId: string;
  startedAt: string;
  durationSec: number;
  channel: ConversationChannel;
  callerNumber?: string;
  status: CallStatus;
  aiSummary?: string;
  audioUrl?: string;
  apiCostUsd: number;
  extractedData: Record<string, string>;
}

// ——— Usage ———
export interface UsageLedger {
  month: string;
  voiceMinutes: number;
  whatsappMsgs: number;
  ttsCachedChars: number;
  ttsGeneratedChars: number;
  apiCostUsd: number;
}

// ——— أحداث WebSocket (Live Inbox) ———
export type LiveEvent =
  | { type: 'conversation.open'; conversation: Conversation }
  | { type: 'conversation.close'; conversationId: string }
  | { type: 'call.status'; callId: string; status: CallStatus }
  | { type: 'transcript.partial'; event: TranscriptEvent }
  | { type: 'transcript.final'; event: TranscriptEvent }
  | { type: 'ai.summary'; callId: string; summary: string }
  | { type: 'extraction.updated'; callId: string; extractedData: Record<string, string> }
  | { type: 'message.new'; message: WhatsappMessage }
  | { type: 'takeover.start'; callId: string; takenByName: string }
  | { type: 'takeover.end'; callId: string };
