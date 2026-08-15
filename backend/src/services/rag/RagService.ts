import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { KnowledgeDocument } from '@prisma/client';
import { ApiError } from '../../lib/errors';
import { openAIClientFor } from '../../lib/openai';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

const CHUNK_SIZE = 700;
const CHUNK_OVERLAP = 100;

/**
 * RAG: رفع المستندات + تقسيمها + تضمينها (embedding) ثم بحث تشابهي
 * عبر pgvector على جدول KnowledgeChunk لكل مستأجر على حدة.
 */
export class RagService {
  // ============================ Ingestion ============================

  async ingestDocument(tenantId: string, agentId: string, file: UploadedFile): Promise<KnowledgeDocument> {
    const text = await this.extractText(file);
    if (text.trim().length < 20) {
      throw new ApiError(422, 'المستند فارغ أو غير قابل للقراءة', 'EMPTY_DOCUMENT');
    }

    const doc = await prisma.knowledgeDocument.create({
      data: {
        tenantId,
        agentId,
        name: file.originalname,
        fileUrl: file.path,
        fileType: path.extname(file.originalname).toLowerCase().replace('.', ''),
        fileSize: file.size,
        status: 'PROCESSING',
      },
    });

    const chunks = this.chunkText(text);
    const embeddings = await this.embedBatch(chunks, tenantId);

    // embedding من نوع Unsupported("vector") — لا يقبله Prisma typing، لذا نكتب عبر SQL خام
    await prisma.$transaction(
      chunks.map((chunk, i) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO "KnowledgeChunk" ("id", "tenantId", "documentId", "content", "chunkIndex", "embedding", "metadata")
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb)`,
          crypto.randomUUID(),
          tenantId,
          doc.id,
          chunk,
          i,
          JSON.stringify(embeddings[i]),
          JSON.stringify({ chunkIndex: i }),
        ),
      ),
    );

    return prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { status: 'READY', chunkCount: chunks.length },
    });
  }

  private async extractText(file: UploadedFile): Promise<string> {
    const ext = path.extname(file.originalname).toLowerCase();
    const buffer = await fs.readFile(file.path);

    if (ext === '.txt' || ext === '.md' || ext === '.csv') {
      return buffer.toString('utf8');
    }
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      return data.text;
    }
    if (ext === '.xlsx' || ext === '.xls') {
      const XLSX = require('xlsx') as typeof import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const lines: string[] = [];
      for (const name of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }) as unknown[][];
        for (const row of rows) lines.push(row.filter(Boolean).join(' | '));
      }
      return lines.join('\n');
    }
    throw new ApiError(415, `نوع الملف غير مدعوم: ${ext}`, 'UNSUPPORTED_FILE');
  }

  private chunkText(text: string): string[] {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const sentences = normalized.split(/(?<=[.!?؟،])\s+/);
    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 > CHUNK_SIZE && current) {
        chunks.push(current.trim());
        current = current.slice(-CHUNK_OVERLAP) + ' ' + sentence;
      } else {
        current = current ? current + ' ' + sentence : sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.filter(Boolean);
  }

  // ============================ Embedding ============================

  private async embedBatch(texts: string[], tenantId?: string): Promise<number[][]> {
    const { client } = await openAIClientFor(tenantId);
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 20) {
      const batch = texts.slice(i, i + 20);
      const res = await client.embeddings.create({
        model: config.openaiEmbedModel,
        input: batch,
      });
      out.push(...(res.data as { embedding: number[] }[]).map((d) => d.embedding));
    }
    return out;
  }

  private async embedOne(text: string, tenantId?: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text], tenantId);
    return vec;
  }

  // ============================ Retrieval ============================

  async search(tenantId: string, query: string, agentId?: string, topK = 4): Promise<string[]> {
    if (!query.trim()) return [];
    try {
      const vector = await this.embedOne(query, tenantId);
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT c."content" FROM "KnowledgeChunk" c
         WHERE c."tenantId" = $1
           AND ($2::text IS NULL OR c."documentId" IN (
             SELECT "id" FROM "KnowledgeDocument" WHERE "agentId" = $2
           ))
         ORDER BY c."embedding" <-> $3::vector
         LIMIT $4`,
        tenantId,
        agentId ?? null,
        JSON.stringify(vector),
        topK,
      )) as { content: string }[];
      return rows.map((r) => r.content);
    } catch (err) {
      // بدون pgvector يعمل النظام بدون RAG ولا يسقط
      console.warn('RAG search skipped:', (err as Error).message);
      return [];
    }
  }
}

export const ragService = new RagService();
