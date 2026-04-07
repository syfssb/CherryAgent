/**
 * 管理后台路由索引
 * 统一导出所有管理后台路由
 */

import { Router } from 'express';
import { adminAuthRouter } from './auth.js';
import { adminUsersRouter } from './users.js';
import { adminAdminsRouter } from './admins.js';
import { adminFinanceRouter } from './finance.js';
import { adminDashboardRouter } from './dashboard.js';
import { adminChannelsRouter } from './channels.js';
import { adminModelsRouter } from './models.js';
import { adminVersionsRouter } from './versions.js';
import { adminAnnouncementsRouter } from './announcements.js';
import { adminConfigsRouter } from './configs.js';
import { adminPackagesRouter } from './packages.js';
import { adminSkillsRouter } from './skills.js';
import { adminReferralsRouter } from './referrals.js';
import { adminEmailsRouter, adminEmailSettingsRouter } from './emails.js';
import { adminDiscountsRouter } from './discounts.js';
import { adminSystemSettingsRouter } from './system-settings.js';
import { adminSyncRouter } from './sync.js';
import { adminPaymentSettingsRouter } from './payment-settings.js';
import { adminRedeemCodesRouter } from './redeem-codes.js';
import { adminFraudRouter } from './fraud.js';
import { adminPeriodCardsRouter } from './period-cards.js';
import { adminExternalSkillsRouter } from './external-skills.js';
import { adminLegalContentsRouter } from './legal-contents.js';
import { adminProvidersRouter } from './providers.js';

export const adminRouter = Router();

// ==========================================
// 注册管理后台路由
// ==========================================

// 认证路由 (不需要认证)
adminRouter.use('/auth', adminAuthRouter);

// 以下路由需要管理员认证
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/admins', adminAdminsRouter);
adminRouter.use('/finance', adminFinanceRouter);
adminRouter.use('/dashboard', adminDashboardRouter);
adminRouter.use('/channels', adminChannelsRouter);
adminRouter.use('/models', adminModelsRouter);
adminRouter.use('/versions', adminVersionsRouter);
adminRouter.use('/announcements', adminAnnouncementsRouter);
adminRouter.use('/configs', adminConfigsRouter);
adminRouter.use('/packages', adminPackagesRouter);
adminRouter.use('/skills', adminSkillsRouter);
adminRouter.use('/referrals', adminReferralsRouter);
adminRouter.use('/emails', adminEmailsRouter);
adminRouter.use('/settings/email', adminEmailSettingsRouter);
adminRouter.use('/settings/system', adminSystemSettingsRouter);
adminRouter.use('/discounts', adminDiscountsRouter);
adminRouter.use('/redeem-codes', adminRedeemCodesRouter);
adminRouter.use('/sync', adminSyncRouter);
adminRouter.use('/settings/payment', adminPaymentSettingsRouter);
adminRouter.use('/fraud', adminFraudRouter);
adminRouter.use('/period-cards', adminPeriodCardsRouter);
adminRouter.use('/external-skills', adminExternalSkillsRouter);
adminRouter.use('/legal-contents', adminLegalContentsRouter);
adminRouter.use('/providers', adminProvidersRouter);

// ==========================================
// 导出各个子路由
// ==========================================

export {
  adminAuthRouter,
  adminUsersRouter,
  adminAdminsRouter,
  adminFinanceRouter,
  adminDashboardRouter,
  adminChannelsRouter,
  adminModelsRouter,
  adminVersionsRouter,
  adminAnnouncementsRouter,
  adminConfigsRouter,
  adminPackagesRouter,
  adminSkillsRouter,
  adminReferralsRouter,
  adminEmailsRouter,
  adminEmailSettingsRouter,
  adminSystemSettingsRouter,
  adminDiscountsRouter,
  adminRedeemCodesRouter,
  adminFraudRouter,
  adminSyncRouter,
  adminPaymentSettingsRouter,
  adminPeriodCardsRouter,
  adminExternalSkillsRouter,
  adminLegalContentsRouter,
  adminProvidersRouter,
};

export default adminRouter;
