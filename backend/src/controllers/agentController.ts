import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';

export async function getCurrentAgent(req: Request, res: Response): Promise<void> {
  const agent = await prisma.agent.findFirst({
    where: { tenantId: req.auth!.tenantId!, status: 'ACTIVE' },
    include: { dynamicFields: { orderBy: { position: 'asc' } }, documents: { orderBy: { createdAt: 'desc' } } },
  });
  if (!agent) throw new ApiError(404, 'لا يوجد وكيل نشط بعد — أنشئ واحدًا من الـ Agent Builder', 'AGENT_NOT_FOUND');
  // الـ System Prompt مُدار من بوابة الإدارة المركزية فقط — لا يصل للعميل
  res.json({ ...agent, systemPrompt: '' });
}

export async function updateAgent(req: Request, res: Response): Promise<void> {
  const agentId = req.params.id;
  const tenantId = req.auth!.tenantId!;
  const existing = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
  if (!existing) throw new ApiError(404, 'الوكيل غير موجود', 'AGENT_NOT_FOUND');

  const body = req.body ?? {};
  // systemPrompt يُقصى دائمًا — إدارته حكر على بوابة الإدارة المركزية (Super Admin)
  const { dynamicFields = undefined, documents: _documents, systemPrompt: _systemPrompt, ...fields } = body;

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: {
      name: fields.name,
      status: fields.status,
      language: fields.language,
      objective: fields.objective,
      voiceProvider: fields.voiceProvider,
      voiceId: fields.voiceId,
      voiceRate: fields.voiceRate,
      sttProvider: fields.sttProvider,
      llmProvider: fields.llmProvider,
      llmModel: fields.llmModel,
      sileroVadEnabled: fields.sileroVadEnabled,
      bargeInEnabled: fields.bargeInEnabled,
      smartTtsCacheEnabled: fields.smartTtsCacheEnabled,
      fallbackPhoneNumber: fields.fallbackPhoneNumber,
      maxTurnsBeforeHandoff: fields.maxTurnsBeforeHandoff,
      config: fields.config ?? existing.config,
    },
  });

  if (Array.isArray(dynamicFields)) {
    await prisma.$transaction([
      prisma.dynamicField.deleteMany({ where: { tenantId } }),
      prisma.dynamicField.createMany({
        data: dynamicFields
          .filter((f: { key?: string; label?: string }) => f?.key && f?.label)
          .map((f: { key: string; label: string; type?: string; description?: string; exampleValue?: string; required?: boolean; position?: number; enabled?: boolean }, i: number) => ({
            tenantId,
            agentId: agent.id,
            key: f.key,
            label: f.label,
            type: (f.type as never) ?? 'TEXT',
            description: f.description ?? null,
            exampleValue: f.exampleValue ?? null,
            required: f.required ?? false,
            position: f.position ?? i,
            enabled: f.enabled ?? true,
          })),
      }),
    ]);
  }

  const fresh = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { dynamicFields: { orderBy: { position: 'asc' } }, documents: { orderBy: { createdAt: 'desc' } } },
  });
  res.json(fresh);
}

export async function listDynamicFields(req: Request, res: Response): Promise<void> {
  const fields = await prisma.dynamicField.findMany({
    where: { tenantId: req.auth!.tenantId!, enabled: true },
    orderBy: { position: 'asc' },
  });
  res.json(fields);
}

export async function listDocuments(req: Request, res: Response): Promise<void> {
  const docs = await prisma.knowledgeDocument.findMany({
    where: { tenantId: req.auth!.tenantId! },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
}
