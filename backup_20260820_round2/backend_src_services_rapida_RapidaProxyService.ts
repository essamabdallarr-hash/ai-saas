import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import type { Agent, DynamicField } from '@prisma/client';
import { config } from '../../config';
import { ApiError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { ragService } from '../rag/RagService';

export interface StartCallInput {
  tenantId: string;
  agentId: string;
  toNumber: string;
  fromNumber?: string;
  /** نص إضافي يُحقن في Prompt الوكيل (مثال: بيانات عميل معروفة) */
  extraContext?: string;
}

export interface RapidaCallResult {
  rapidaConversationId: number;
  status: string;
}

const PROTO_PATH = path.join(__dirname, '..', '..', 'protos', 'talk.proto');
const PROTO_DIR = path.join(__dirname, '..', '..', 'protos');

// ترميز Any بقيمة StringValue (JSON) — عقد سلكي موثق داخل هذا الـ SaaS
function stringValueAny(json: unknown): { type_url: string; value: Uint8Array } {
  const text = typeof json === 'string' ? json : JSON.stringify(json);
  const value = Buffer.from(text, 'utf8');
  // google.protobuf.StringValue { string value = 1; } → tag 0x0a, len, bytes
  const payload = Buffer.alloc(2 + value.length);
  payload[0] = 0x0a;
  payload[1] = value.length;
  value.copy(payload, 2);
  return { type_url: 'type.googleapis.com/google.protobuf.StringValue', value: payload };
}

/**
 * Rapida Proxy & Orchestration Controller.
 * - يستقبل طلبات بدء المكالمات من الـ Frontend
 * - يدمج System Prompt المخفي (Super Admin) + أهداف الوكيل + معطيات RAG للـ Tenant
 * - يمررها عبر gRPC إلى خادم rapidaai لبدء المكالمة (CreatePhoneCall)
 */
export class RapidaProxyService {
  private client: any;
  private clientErr: Error | null = null;

  private ensureClient(): any {
    if (this.clientErr) throw new ApiError(503, `Rapida gRPC غير متاح: ${this.clientErr.message}`, 'RAPIDA_UNAVAILABLE');
    if (this.client) return this.client;

    if (!config.rapidaGrpcUrl) {
      throw new ApiError(503, 'RAPIDA_ASSISTANT_GRPC_URL غير مهيأ', 'RAPIDA_NOT_CONFIGURED');
    }

    try {
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: false,
        longs: Number,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [PROTO_DIR],
      });
      const proto = grpc.loadPackageDefinition(packageDefinition) as any;
      this.client = new proto.talk_api.TalkService(config.rapidaGrpcUrl, grpc.credentials.createInsecure(), {
        'grpc.keepalive_time_ms': 30_000,
        'grpc.keepalive_timeout_ms': 10_000,
      });
      return this.client;
    } catch (err) {
      this.clientErr = err as Error;
      throw new ApiError(503, `فشل تحميل عميل Rapida: ${(err as Error).message}`, 'RAPIDA_CLIENT_FAILED');
    }
  }

  /** دمج الـ Prompt المخفي مع RAG — يُسمّى من الـ Controller قبل البدء */
  async buildSystemPrompt(agent: Agent, dynamicFields: DynamicField[], ragContext: string[]): Promise<string> {
    return `[System Prompt المحدد من Super Admin]\n${agent.systemPrompt || 'كن محترفًا وودودًا بالعربية.'}\n\n[الهدف]\n${agent.objective || ''}\n\n[الحقول المستخرجة]\n${
      dynamicFields.length
        ? dynamicFields.map((f) => `- ${f.key}${f.required ? ' (إلزامي)' : ''}`).join('\n')
        : 'لا توجد'
    }\n\n[المعرفة المرجعية (RAG)]\n${ragContext.length ? ragContext.join('\n\n') : 'لا توجد معرفة مرفوعة بعد'}`;
  }

  /**
   * بدء مكالمة صوتية عبر rapida.
   * يقرأ الوكيل والوكيل المستأجر، يجمع السياق (RAG + Prompt)، ثم ينادي CreatePhoneCall.
   */
  async startCall(input: StartCallInput): Promise<RapidaCallResult> {
    const client = this.ensureClient();

    const agent = await prisma.agent.findFirst({
      where: { id: input.agentId, tenantId: input.tenantId, status: 'ACTIVE' },
      include: { tenant: true },
    });
    if (!agent) throw new ApiError(404, 'الوكيل غير موجود أو غير مفعّل', 'AGENT_NOT_FOUND');

    const dynamicFields = await prisma.dynamicField.findMany({
      where: { tenantId: input.tenantId, enabled: true },
      orderBy: { position: 'asc' },
    });

    const ragContext = await ragService.search(input.tenantId, agent.objective, agent.id, 5);
    const systemPrompt = await this.buildSystemPrompt(agent, dynamicFields, ragContext);

    const options = this.buildOptions(agent, systemPrompt, ragContext, dynamicFields, input.extraContext);

    const result = await this.callCreatePhoneCall(client, {
      assistantId: config.rapidaAssistantId,
      version: config.rapidaAssistantVersion,
      fromNumber: input.fromNumber ?? agent.fallbackPhoneNumber ?? '',
      toNumber: input.toNumber,
      options,
    });

    return result;
  }

  private buildOptions(
    agent: Agent,
    systemPrompt: string,
    ragContext: string[],
    dynamicFields: DynamicField[],
    extraContext?: string,
  ): Record<string, unknown> {
    return {
      systemPrompt: stringValueAny(systemPrompt),
      objective: stringValueAny(agent.objective),
      ragContext: stringValueAny(ragContext),
      dynamicFields: stringValueAny(dynamicFields.map((f) => ({ key: f.key, label: f.label, type: f.type }))),
      voice: stringValueAny({ provider: agent.voiceProvider, voiceId: agent.voiceId, rate: agent.voiceRate }),
      behavior: stringValueAny({
        sileroVadEnabled: agent.sileroVadEnabled,
        bargeInEnabled: agent.bargeInEnabled,
        smartTtsCacheEnabled: agent.smartTtsCacheEnabled,
        maxTurnsBeforeHandoff: agent.maxTurnsBeforeHandoff,
      }),
      extraContext: stringValueAny(extraContext ?? ''),
      callingChannel: stringValueAny('voice'),
    };
  }

  private callCreatePhoneCall(
    client: any,
    req: {
      assistantId: number;
      version: string;
      fromNumber: string;
      toNumber: string;
      options: Record<string, unknown>;
    },
  ): Promise<RapidaCallResult> {
    return new Promise((resolve, reject) => {
      const request = {
        assistant: { assistantId: req.assistantId, version: req.version },
        options: req.options,
        fromNumber: req.fromNumber,
        toNumber: req.toNumber,
      };

      client.createPhoneCall(request, (err: Error | null, response: any) => {
        if (err) return reject(new ApiError(502, 'فشل بدء المكالمة عبر Rapida', 'RAPIDA_CALL_FAILED'));
        if (!response?.success) {
          const msg = response?.error?.humanMessage || response?.error?.errorMessage || 'خطأ غير معروف من Rapida';
          return reject(new ApiError(502, msg, 'RAPIDA_CALL_REJECTED'));
        }
        const conversation = response?.data;
        resolve({
          rapidaConversationId: Number(conversation?.id ?? 0),
          status: conversation?.status ?? 'CONNECTING',
        });
      });
    });
  }

  /**
   * إنشاء تدفق ثنائي الاتجاه (bidi stream) للوكيل — يُستخدم لتمرير
   * رسائل الوسيط البشري (Human Takeover) وتفريغ الصوت الحي.
   */
  createAssistantStream() {
    const client = this.ensureClient();
    return client.assistantTalk((_err: Error | null) => undefined);
  }

  /**
   * فتح تدفق للاستماع لأحداث المكالمة (ConversationDisconnection, ConversationEvent, Error).
   * يُستدعى بعد CreatePhoneCall لرصد انتهاء المكالمة وتحديث الحالة.
   */
  listenForCallEvents(rapidaConversationId: number, onEvent: (event: Record<string, unknown>) => void): () => void {
    if (!rapidaConversationId) return () => undefined;
    const client = this.ensureClient();
    const stream = client.assistantTalk((err: Error | null) => {
      if (err) onEvent({ type: 'error', error: err.message });
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    stream.write({
      initialization: {
        assistantConversationId: rapidaConversationId,
        assistant: { assistantId: config.rapidaAssistantId, version: config.rapidaAssistantVersion },
        streamMode: 'STREAM_MODE_TEXT',
        time: { seconds: nowSeconds },
      },
    });

    stream.on('data', (response: Record<string, unknown>) => {
      onEvent(response);
    });

    stream.on('error', () => {
      onEvent({ type: 'error', error: 'stream error' });
    });

    stream.on('end', () => {
      onEvent({ type: 'stream_end' });
    });

    return () => {
      try { stream.end(); } catch { /* noop */ }
    };
  }

  /**
   * إيقاف الوكيل الصوتي فورًا عند Human Takeover.
   * يفتح تدفقًا للتحدث مع المحادثة ثم يرسل ConversationDisconnection (USER)
   * فيتوقف الـ AI عن الرد ويتسلم الوسيط البشري.
   */
  async disconnectConversation(rapidaConversationId: number): Promise<void> {
    if (!rapidaConversationId) return;
    const client = this.ensureClient();
    return new Promise((resolve, reject) => {
      const stream = client.assistantTalk((err: Error | null) => {
        if (err) reject(new ApiError(502, 'فشل إيقاف الوكيل عبر Rapida', 'RAPIDA_DISCONNECT_FAILED'));
        else resolve();
      });

      const nowSeconds = Math.floor(Date.now() / 1000);
      stream.write({
        initialization: {
          assistantConversationId: rapidaConversationId,
          assistant: { assistantId: config.rapidaAssistantId, version: config.rapidaAssistantVersion },
          streamMode: 'STREAM_MODE_TEXT',
          time: { seconds: nowSeconds },
        },
      });
      stream.write({
        disconnection: {
          id: 1,
          type: 'DISCONNECTION_TYPE_USER',
          time: { seconds: nowSeconds },
        },
      });
      stream.end();
    });
  }
}

export const rapidaService = new RapidaProxyService();
