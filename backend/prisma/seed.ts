import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    create: { name: 'شركة التجربة', slug: 'demo' },
    update: {},
  });
  await prisma.tierLimit.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id }, update: {} });
  await prisma.featureToggle.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id }, update: {} });
  await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    create: { email: 'admin@demo.local', name: 'مدير التجربة', role: 'CLIENT_ADMIN', tenantId: tenant.id, active: true },
    update: { tenantId: tenant.id },
  });

  const agentCount = await prisma.agent.count({ where: { tenantId: tenant.id } });
  if (agentCount === 0) {
    await prisma.agent.create({
      data: {
        tenantId: tenant.id,
        name: 'وكيل المبيعات التجريبي',
        status: 'ACTIVE',
        objective: 'استقبال العميل، التعرف على احتياجه، واستخراج الميزانية وموعد المتابعة.',
        voiceId: 'ar-EG-SalmaNeural',
        systemPrompt: 'أنت وكيل مبيعات ذكي يتحدث العربية بطلاقة. ابدأ بتحية ودية، واسأل عن احتياج العميل، ثم اقترح الحل.',
      },
    });
    await prisma.dynamicField.createMany({
      data: [
        { tenantId: tenant.id, key: 'budget', label: 'الميزانية', type: 'CURRENCY', description: 'القيمة المالية القصوى التي يقبلها العميل', position: 0 },
        { tenantId: tenant.id, key: 'followup_date', label: 'موعد المتابعة', type: 'DATE', description: 'الموعد المقترح لمعاودة الاتصال', position: 1 },
        { tenantId: tenant.id, key: 'interested', label: 'جاهز للشراء', type: 'BOOLEAN', description: 'هل أبدى العميل اهتمامًا فعليًا؟', position: 2 },
      ],
    });
  }

  console.log('Seed انتهى بنجاح ✓  (tenant=demo / admin@demo.local)');
}

void main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
