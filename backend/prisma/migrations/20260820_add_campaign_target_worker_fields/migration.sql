-- AlterTable: إضافة حقول معالجة Campaign Worker
ALTER TABLE "CampaignTarget" ADD COLUMN "processingStartedAt" TIMESTAMP(3);
ALTER TABLE "CampaignTarget" ADD COLUMN "workerId" TEXT;
ALTER TABLE "CampaignTarget" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
