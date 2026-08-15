import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireTenant, requireSuperAdmin } from '../lib/auth';
import { asyncHandler } from '../lib/errors';
import { config } from '../config';
import { devLogin, login, me } from '../controllers/authController';
import { getCurrentAgent, updateAgent, listDynamicFields, listDocuments } from '../controllers/agentController';
import { startCall, getCall, listCalls } from '../controllers/callController';
import {
  listConversations,
  getConversation,
  listMessages,
  listExtractions,
  closeConversation,
  takeover,
} from '../controllers/conversationController';
import { ttsPreview, ttsCacheStats, usage } from '../controllers/ttsController';
import { reports } from '../controllers/reportController';
import {
  createConnection,
  listConnections,
  connectionStatus,
  disconnectConnection,
  updateConnection,
  metaWebhook,
  metaWebhookVerify,
  createCampaign,
  startCampaign,
  listCampaigns,
} from '../controllers/whatsappController';
import {
  listTenants,
  createTenant,
  updateTenant,
  createTenantUser,
  listTenantUsers,
  setTenantUserPassword,
  getTenantAgent,
  replaceTenantFields,
  uploadTenantDocument,
  deleteTenantDocument,
  updateAgentPrompt,
  setTenantAiKeys,
  getTenantAiKeys,
  globalMetrics,
} from '../controllers/adminController';

export const router = Router();

const uploadsDir = path.join(config.storageDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir, limits: { fileSize: 20 * 1024 * 1024 } });

// ——— Auth ———
router.post('/auth/dev-login', asyncHandler(devLogin));
router.post('/auth/login', asyncHandler(login));
router.get('/auth/me', requireAuth, asyncHandler(me));

// ——— Super Admin (قبل requireTenant — لا يملك الـ Admin عملاً معيّنًا) ———
router.get('/admin/tenants', requireSuperAdmin, asyncHandler(listTenants));
router.post('/admin/tenants', requireSuperAdmin, asyncHandler(createTenant));
router.patch('/admin/tenants/:id', requireSuperAdmin, asyncHandler(updateTenant));
router.get('/admin/tenants/:tenantId/agent', requireSuperAdmin, asyncHandler(getTenantAgent));
router.put('/admin/tenants/:tenantId/fields', requireSuperAdmin, asyncHandler(replaceTenantFields));
router.post('/admin/tenants/:tenantId/users', requireSuperAdmin, asyncHandler(createTenantUser));
router.get('/admin/tenants/:tenantId/users', requireSuperAdmin, asyncHandler(listTenantUsers));
router.put('/admin/tenants/:tenantId/agents/:agentId/prompt', requireSuperAdmin, asyncHandler(updateAgentPrompt));
router.put('/admin/tenants/:tenantId/users/:userId/password', requireSuperAdmin, asyncHandler(setTenantUserPassword));
router.put('/admin/tenants/:tenantId/ai-keys', requireSuperAdmin, asyncHandler(setTenantAiKeys));
router.get('/admin/tenants/:tenantId/ai-keys', requireSuperAdmin, asyncHandler(getTenantAiKeys));
router.post('/admin/tenants/:tenantId/documents', requireSuperAdmin, upload.single('file'), asyncHandler(uploadTenantDocument));
router.delete('/admin/tenants/:tenantId/documents/:docId', requireSuperAdmin, asyncHandler(deleteTenantDocument));
router.get('/admin/metrics', requireSuperAdmin, asyncHandler(globalMetrics));

// ——— Tenant scope ———
router.use(requireTenant);

// Agent Builder
router.get('/agents/current', asyncHandler(getCurrentAgent));
router.put('/agents/:id', asyncHandler(updateAgent));
router.get('/dynamic-fields', asyncHandler(listDynamicFields));
router.get('/documents', asyncHandler(listDocuments));

// Call (Voice)
router.post('/calls', asyncHandler(startCall));
router.get('/calls', asyncHandler(listCalls));
router.get('/calls/:id', asyncHandler(getCall));

// Conversations / Live Inbox
router.get('/conversations', asyncHandler(listConversations));
router.get('/conversations/:id', asyncHandler(getConversation));
router.get('/conversations/:id/messages', asyncHandler(listMessages));
router.get('/conversations/:id/extractions', asyncHandler(listExtractions));
router.post('/conversations/:id/close', asyncHandler(closeConversation));
router.post('/conversations/:id/takeover', asyncHandler(takeover));

// TTS / Usage
router.post('/tts/preview', asyncHandler(ttsPreview));
router.get('/tts/cache-stats', asyncHandler(ttsCacheStats));
router.get('/tenants/me/usage', asyncHandler(usage));

// Reports
router.get('/reports', asyncHandler(reports));

// WhatsApp — إدارة الاتصالات
router.post('/whatsapp/connections', asyncHandler(createConnection));
router.get('/whatsapp/connections', asyncHandler(listConnections));
router.get('/whatsapp/connections/:id/status', asyncHandler(connectionStatus));
router.post('/whatsapp/connections/:id/disconnect', asyncHandler(disconnectConnection));
router.put('/whatsapp/connections/:id', asyncHandler(updateConnection));

// WhatsApp — حملات القوالب الرسمية
router.post('/whatsapp/campaigns', asyncHandler(createCampaign));
router.get('/whatsapp/campaigns', asyncHandler(listCampaigns));
router.post('/whatsapp/campaigns/:id/start', asyncHandler(startCampaign));

// ——— Meta Webhook (لا يتطلب Auth — يتحقق عبر token نفسه) ———
router.get('/whatsapp/webhook', metaWebhookVerify);
router.post('/whatsapp/webhook', asyncHandler(metaWebhook));
