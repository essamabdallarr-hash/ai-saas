import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { encryptSecret } from '../lib/crypto';
import { whatsappWebJSService } from '../services/whatsapp/WhatsappWebJSService';
import { metaOfficialService } from '../services/whatsapp/MetaOfficialService';

/** يعرّي توكن Meta المشفر قبل إرسال الاتصال للواجهة */
function sanitizeConnection<T extends { metaAccessTokenEnc?: string | null }>(c: T): Omit<T, 'metaAccessTokenEnc'> & { metaConfigured: boolean } {
  const { metaAccessTokenEnc, ...rest } = c;
  return { ...rest, metaConfigured: Boolean(metaAccessTokenEnc) };
}

export async function createConnection(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const { engine = 'FREE_QR', typingDelayMs = 4000, spintaxEnabled = true, metaPhoneNumberId, metaAccessToken, metaWabaId } = req.body ?? {};

  const existing = await prisma.whatsappConnection.findFirst({ where: { tenantId, engine } });
  if (existing) throw new ApiError(409, 'يوجد اتصال بنفس المحرك بالفعل', 'CONNECTION_EXISTS');

  const connection = await prisma.whatsappConnection.create({
    data: {
      tenantId,
      engine,
      typingDelayMs,
      spintaxEnabled,
      metaPhoneNumberId: engine === 'OFFICIAL_META' ? metaPhoneNumberId : undefined,
      metaWabaId: engine === 'OFFICIAL_META' ? metaWabaId : undefined,
      metaAccessTokenEnc: engine === 'OFFICIAL_META' && metaAccessToken ? encryptSecret(metaAccessToken) : undefined,
    },
  });
  res.status(201).json(sanitizeConnection(connection));
}

export async function listConnections(req: Request, res: Response): Promise<void> {
  const connections = await prisma.whatsappConnection.findMany({
    where: { tenantId: req.auth!.tenantId! },
    orderBy: { createdAt: 'desc' },
  });
  res.json(connections.map(sanitizeConnection));
}

export async function connectionStatus(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const connection = await prisma.whatsappConnection.findFirst({
    where: { id: req.params.id, tenantId },
  });
  if (!connection) throw new ApiError(404, 'الاتصال غير موجود', 'CONNECTION_NOT_FOUND');

  // إن كان المحرك حرًا ولم يبدأ بعد → ابدأ العميل ليصدر QR
  if (connection.engine === 'FREE_QR' && connection.status !== 'CONNECTED') {
    try {
      await whatsappWebJSService.ensureClient(connection);
    } catch (err) {
      await prisma.whatsappConnection.update({
        where: { id: connection.id },
        data: { status: 'BROKEN', error: (err as Error).message },
      });
    }
  }

  const fresh = await prisma.whatsappConnection.findUnique({ where: { id: connection.id } });
  res.json({
    id: fresh!.id,
    engine: fresh!.engine,
    status: fresh!.status,
    qrCode: fresh!.qrCode,
    qrExpiresAt: fresh!.qrExpiresAt?.toISOString() ?? null,
    error: fresh!.error,
    typingDelayMs: fresh!.typingDelayMs,
    spintaxEnabled: fresh!.spintaxEnabled,
    metaPhoneNumberId: fresh!.metaPhoneNumberId,
    metaConfigured: Boolean(fresh!.metaAccessTokenEnc),
  });
}

export async function disconnectConnection(req: Request, res: Response): Promise<void> {
  const connection = await prisma.whatsappConnection.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId! },
  });
  if (!connection) throw new ApiError(404, 'الاتصال غير موجود', 'CONNECTION_NOT_FOUND');
  await whatsappWebJSService.disconnect(connection);
  res.json({ ok: true });
}

export async function updateConnection(req: Request, res: Response): Promise<void> {
  const connection = await prisma.whatsappConnection.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId! },
  });
  if (!connection) throw new ApiError(404, 'الاتصال غير موجود', 'CONNECTION_NOT_FOUND');

  const { typingDelayMs, spintaxEnabled, outboundBlocked, metaPhoneNumberId, metaAccessToken, metaWabaId } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (typeof typingDelayMs === 'number') data.typingDelayMs = typingDelayMs;
  if (typeof spintaxEnabled === 'boolean') data.spintaxEnabled = spintaxEnabled;
  if (typeof outboundBlocked === 'boolean') data.outboundBlocked = outboundBlocked;
  if (metaPhoneNumberId) data.metaPhoneNumberId = metaPhoneNumberId;
  if (metaWabaId) data.metaWabaId = metaWabaId;
  if (metaAccessToken) data.metaAccessTokenEnc = encryptSecret(metaAccessToken);

  const updated = await prisma.whatsappConnection.update({ where: { id: connection.id }, data });
  res.json(sanitizeConnection(updated));
}

// ============================ Webhook (Meta) ============================

export async function metaWebhookVerify(req: Request, res: Response): Promise<void> {
  const mode = String(req.query['hub.mode'] ?? '');
  const token = String(req.query['hub.verify_token'] ?? '');
  const challenge = String(req.query['hub.challenge'] ?? '');
  res.send(metaOfficialService.verifyWebhook(mode, token, challenge));
}

export async function metaWebhook(req: Request, res: Response): Promise<void> {
  await metaOfficialService.handleWebhook(req.body);
  res.sendStatus(200);
}

// ============================ حملات القوالب الرسمية ============================

export async function createCampaign(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const { name, templateName, recipients, metaTemplateJson } = req.body ?? {};
  if (!name || !templateName || !Array.isArray(recipients) || recipients.length === 0) {
    throw new ApiError(422, 'يلزم name و templateName و recipients', 'MISSING_CAMPAIGN_FIELDS');
  }
  const connection = await prisma.whatsappConnection.findFirst({ where: { tenantId, engine: 'OFFICIAL_META' } });
  if (!connection) throw new ApiError(400, 'لا يوجد اتصال رسمي (Meta) مفعّل', 'META_CONNECTION_MISSING');

  const campaign = await prisma.broadcastCampaign.create({
    data: {
      tenantId,
      connectionId: connection.id,
      name,
      templateName,
      metaTemplateJson: metaTemplateJson ?? undefined,
      totalRecipients: recipients.length,
      meta: { recipients: recipients.slice(0, 5000) } as unknown as never,
    },
  });
  res.status(201).json(campaign);
}

export async function startCampaign(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId!;
  const campaign = await prisma.broadcastCampaign.findFirst({ where: { id: req.params.id, tenantId } });
  if (!campaign) throw new ApiError(404, 'الحملة غير موجودة', 'CAMPAIGN_NOT_FOUND');
  const connection = await prisma.whatsappConnection.findUnique({ where: { id: campaign.connectionId } });
  if (!connection) throw new ApiError(404, 'الاتصال غير موجود', 'CONNECTION_NOT_FOUND');

  const recipients = ((campaign.meta as { recipients?: { to: string; variables?: string[] }[] } | null)?.recipients ?? []).map((r) => ({
    to: r.to,
    variables: r.variables,
  }));

  // إطلاق غير متزامن — يُرجع فورًا ويستكمل في الخلفية
  void metaOfficialService.sendTemplateBroadcast(connection, campaign, recipients);
  res.json({ ok: true, status: 'RUNNING', totalRecipients: recipients.length });
}

export async function listCampaigns(req: Request, res: Response): Promise<void> {
  const campaigns = await prisma.broadcastCampaign.findMany({
    where: { tenantId: req.auth!.tenantId! },
    orderBy: { createdAt: 'desc' },
  });
  res.json(campaigns);
}
