import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config';
import { ApiError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

/**
 * كاش TTS الذكي: الجمل المتكررة (مقدمة/إغلاق/أسئلة شائعة) تُولَّد مرة واحدة من Azure
 * ثم تُعاد من الكاش — يقلل التكلفة بشكل كبير (هدف ≤ $0.01-0.015/دقيقة).
 */
export class TtsSmartCache {
  async synthesize(args: {
    tenantId: string;
    text: string;
    voiceId: string;
    enabled: boolean;
  }): Promise<{ audioUrl: string; cached: boolean }> {
    const { tenantId, text, voiceId, enabled } = args;
    const trimmed = text.trim();
    if (!trimmed) throw new ApiError(422, 'نص فارغ', 'EMPTY_TEXT');

    const textHash = crypto.createHash('sha256').update(`${voiceId}|${trimmed}`).digest('hex');

    if (enabled) {
      const cached = await prisma.ttsCache.findUnique({
        where: { tenantId_textHash_voiceId: { tenantId, textHash, voiceId } },
      });
      if (cached) {
        await prisma.ttsCache.update({
          where: { id: cached.id },
          data: { hits: { increment: 1 }, lastUsedAt: new Date() },
        });
        return { audioUrl: cached.audioUrl, cached: true };
      }
    }

    const audioPath = await this.synthesizeAzure(tenantId, textHash, trimmed, voiceId);
    const audioUrl = `/tts/${tenantId}/${textHash}.mp3`;

    await prisma.ttsCache.upsert({
      where: { tenantId_textHash_voiceId: { tenantId, textHash, voiceId } },
      create: { tenantId, textHash, text: trimmed, voiceId, audioUrl, audioPath },
      update: {},
    });

    return { audioUrl, cached: false };
  }

  private async synthesizeAzure(tenantId: string, textHash: string, text: string, voiceId: string): Promise<string> {
    if (!config.azureSpeechKey || !config.azureSpeechRegion) {
      throw new ApiError(503, 'Azure Speech غير مهيأ', 'AZURE_NOT_CONFIGURED');
    }

    // مصادقة REST عبر Authorization header
    const token = await this.getToken();
    const url = `https://${config.azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ssml = `<speak version='1.0' xml:lang='ar-EG'><voice name='${voiceId}'><prosody rate='1.0'>${this.escapeXml(text)}</prosody></voice></speak>`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      },
      body: ssml,
    });

    if (!res.ok) {
      throw new ApiError(502, `Azure TTS فشل: ${res.status}`, 'AZURE_TTS_FAILED');
    }

    const dir = path.join(config.storageDir, 'tts', tenantId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${textHash}.mp3`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    return filePath;
  }

  private async getToken(): Promise<string> {
    const url = `https://${config.azureSpeechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': config.azureSpeechKey!, 'Content-Length': '0' },
    });
    if (!res.ok) throw new ApiError(502, `Azure token فشل: ${res.status}`, 'AZURE_TOKEN_FAILED');
    return res.text();
  }

  private escapeXml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const ttsService = new TtsSmartCache();
