import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ==========================================
// 用户表
// ==========================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }),
  role: varchar('role', { length: 20 }).notNull().default('user'),
  avatarUrl: text('avatar_url'),
  supabaseId: varchar('supabase_id', { length: 100 }).unique(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }).unique(),
  isActive: boolean('is_active').notNull().default(true),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  supabaseIdIdx: index('users_supabase_id_idx').on(table.supabaseId),
}));

// ==========================================
// 订阅计划表
// ==========================================
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  description: text('description'),
  priceMonthly: decimal('price_monthly', { precision: 10, scale: 2 }).notNull(),
  priceYearly: decimal('price_yearly', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  features: jsonb('features').notNull().default([]),
  limits: jsonb('limits').notNull().default({}), // { requests: 1000, tokens: 100000 }
  stripePriceIdMonthly: varchar('stripe_price_id_monthly', { length: 100 }),
  stripePriceIdYearly: varchar('stripe_price_id_yearly', { length: 100 }),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ==========================================
// 用户订阅表
// ==========================================
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, canceled, past_due, unpaid
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }).unique(),
  xunhupayOrderId: varchar('xunhupay_order_id', { length: 100 }),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('subscriptions_user_id_idx').on(table.userId),
  stripeSubIdx: uniqueIndex('subscriptions_stripe_id_idx').on(table.stripeSubscriptionId),
}));

// ==========================================
// API 使用量记录表
// ==========================================
export const usageLogs = pgTable('usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  apiKeyId: uuid('api_key_id'),
  requestId: varchar('request_id', { length: 100 }),
  model: varchar('model', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  latencyMs: integer('latency_ms'),
  status: varchar('status', { length: 20 }).notNull().default('success'), // success, error
  errorMessage: text('error_message'),
  cost: decimal('cost', { precision: 10, scale: 6 }),
  creditsConsumed: decimal('credits_consumed', { precision: 10, scale: 4 }).default('0'),
  quotaUsed: decimal('quota_used', { precision: 12, scale: 2 }).notNull().default('0'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('usage_logs_user_id_idx').on(table.userId),
  createdAtIdx: index('usage_logs_created_at_idx').on(table.createdAt),
  modelIdx: index('usage_logs_model_idx').on(table.model),
}));

// ==========================================
// 用户余额表
// ==========================================
export const userBalances = pgTable('user_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  balance: decimal('balance', { precision: 12, scale: 4 }).notNull().default('0'),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  totalDeposited: decimal('total_deposited', { precision: 12, scale: 4 }).notNull().default('0'),
  totalSpent: decimal('total_spent', { precision: 12, scale: 4 }).notNull().default('0'),
  credits: decimal('credits', { precision: 12, scale: 2 }).notNull().default('0'),
  totalCreditsPurchased: decimal('total_credits_purchased', { precision: 12, scale: 2 }).notNull().default('0'),
  totalCreditsConsumed: decimal('total_credits_consumed', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: uniqueIndex('user_balances_user_id_idx').on(table.userId),
}));

// ==========================================
// 余额交易记录表
// ==========================================
export const balanceTransactions = pgTable('balance_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(), // deposit, withdrawal, usage, bonus, refund
  amount: decimal('amount', { precision: 12, scale: 4 }).notNull(),
  balanceBefore: decimal('balance_before', { precision: 12, scale: 4 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 12, scale: 4 }).notNull(),
  creditsAmount: decimal('credits_amount', { precision: 12, scale: 2 }).default('0'),
  creditsBefore: decimal('credits_before', { precision: 12, scale: 2 }).default('0'),
  creditsAfter: decimal('credits_after', { precision: 12, scale: 2 }).default('0'),
  description: text('description'),
  referenceType: varchar('reference_type', { length: 50 }), // payment, usage_log, etc.
  referenceId: uuid('reference_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('balance_transactions_user_id_idx').on(table.userId),
  createdAtIdx: index('balance_transactions_created_at_idx').on(table.createdAt),
  typeIdx: index('balance_transactions_type_idx').on(table.type),
}));

// ==========================================
// 支付记录表
// ==========================================
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, succeeded, failed, refunded
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // stripe, xunhupay
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 100 }),
  stripeInvoiceId: varchar('stripe_invoice_id', { length: 100 }),
  xunhupayOrderId: varchar('xunhupay_order_id', { length: 100 }),
  xunhupayTransactionId: varchar('xunhupay_transaction_id', { length: 100 }),
  description: text('description'),
  metadata: jsonb('metadata'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('payments_user_id_idx').on(table.userId),
  statusIdx: index('payments_status_idx').on(table.status),
}));

// ==========================================
// 关系定义
// ==========================================
export const usersRelations = relations(users, ({ many, one }) => ({
  subscriptions: many(subscriptions),
  usageLogs: many(usageLogs),
  payments: many(payments),
  balance: one(userBalances),
  balanceTransactions: many(balanceTransactions),
  userPeriodCards: many(userPeriodCards),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  user: one(users, {
    fields: [usageLogs.userId],
    references: [users.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
}));

export const userBalancesRelations = relations(userBalances, ({ one }) => ({
  user: one(users, {
    fields: [userBalances.userId],
    references: [users.id],
  }),
}));

export const balanceTransactionsRelations = relations(balanceTransactions, ({ one }) => ({
  user: one(users, {
    fields: [balanceTransactions.userId],
    references: [users.id],
  }),
}));

// ==========================================
// 积分充值套餐表
// ==========================================
export const creditPackages = pgTable('credit_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  credits: decimal('credits', { precision: 10, scale: 2 }).notNull(),
  priceCents: integer('price_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('CNY'),
  bonusCredits: decimal('bonus_credits', { precision: 10, scale: 2 }).notNull().default('0'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ==========================================
// 安全审计日志表
// ==========================================
export const securityAuditLogs = pgTable('security_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 50 }).notNull(),
  userId: uuid('user_id'),
  apiKeyId: uuid('api_key_id'),
  ip: varchar('ip', { length: 45 }).notNull(),
  userAgent: text('user_agent'),
  path: text('path'),
  method: varchar('method', { length: 10 }),
  reason: varchar('reason', { length: 100 }),
  latencyMs: integer('latency_ms'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  typeIdx: index('security_audit_logs_type_idx').on(table.type),
  userIdIdx: index('security_audit_logs_user_id_idx').on(table.userId),
  apiKeyIdIdx: index('security_audit_logs_api_key_id_idx').on(table.apiKeyId),
  ipIdx: index('security_audit_logs_ip_idx').on(table.ip),
  createdAtIdx: index('security_audit_logs_created_at_idx').on(table.createdAt),
}));

// ==========================================
// IP 封禁列表表
// ==========================================
export const ipBlocklist = pgTable('ip_blocklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  ip: varchar('ip', { length: 45 }).notNull().unique(),
  reason: text('reason').notNull(),
  blockedBy: varchar('blocked_by', { length: 20 }).notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ipIdx: index('ip_blocklist_ip_idx').on(table.ip),
}));

// ==========================================
// Webhook 事件表
// ==========================================
export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 50 }).notNull(), // stripe, xunhupay
  eventId: varchar('event_id', { length: 255 }).notNull(), // 支付提供商的事件 ID
  eventType: varchar('event_type', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, processing, completed, failed
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  rawPayload: jsonb('raw_payload').notNull(), // 原始 webhook 数据
  processedAt: timestamp('processed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details'),
  signature: varchar('signature', { length: 500 }),
  signatureVerified: boolean('signature_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerEventIdIdx: uniqueIndex('webhook_events_provider_event_id_unique').on(table.provider, table.eventId),
  providerIdx: index('webhook_events_provider_idx').on(table.provider),
  statusIdx: index('webhook_events_status_idx').on(table.status),
  createdAtIdx: index('webhook_events_created_at_idx').on(table.createdAt),
  userIdIdx: index('webhook_events_user_id_idx').on(table.userId),
  paymentIdIdx: index('webhook_events_payment_id_idx').on(table.paymentId),
  eventTypeIdx: index('webhook_events_event_type_idx').on(table.eventType),
}));

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  user: one(users, {
    fields: [webhookEvents.userId],
    references: [users.id],
  }),
  payment: one(payments, {
    fields: [webhookEvents.paymentId],
    references: [payments.id],
  }),
}));

// ==========================================
// 签到记录表
// ==========================================
export const checkInRecords = pgTable('check_in_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  checkInDate: varchar('check_in_date', { length: 10 }).notNull(), // YYYY-MM-DD
  consecutiveDays: integer('consecutive_days').notNull().default(1),
  creditsEarned: decimal('credits_earned', { precision: 10, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateIdx: uniqueIndex('check_in_records_user_date_idx').on(table.userId, table.checkInDate),
  userIdIdx: index('check_in_records_user_id_idx').on(table.userId),
  createdAtIdx: index('check_in_records_created_at_idx').on(table.createdAt),
}));

export const checkInRecordsRelations = relations(checkInRecords, ({ one }) => ({
  user: one(users, {
    fields: [checkInRecords.userId],
    references: [users.id],
  }),
}));

// ==========================================
// 可疑账户记录表
// ==========================================
export const suspiciousAccounts = pgTable('suspicious_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 100 }).notNull(),
  details: jsonb('details'),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, reviewed, dismissed, banned
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  actionTaken: varchar('action_taken', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('suspicious_accounts_user_id_idx').on(table.userId),
  statusIdx: index('suspicious_accounts_status_idx').on(table.status),
  createdAtIdx: index('suspicious_accounts_created_at_idx').on(table.createdAt),
}));

export const suspiciousAccountsRelations = relations(suspiciousAccounts, ({ one }) => ({
  user: one(users, {
    fields: [suspiciousAccounts.userId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [suspiciousAccounts.reviewedBy],
    references: [users.id],
  }),
}));

// ==========================================
// IP 注册频率追踪表
// ==========================================
export const ipRegistrationLog = pgTable('ip_registration_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  ip: varchar('ip', { length: 45 }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  isDisposable: boolean('is_disposable').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ipIdx: index('ip_registration_log_ip_idx').on(table.ip),
  createdAtIdx: index('ip_registration_log_created_at_idx').on(table.createdAt),
}));

export const ipRegistrationLogRelations = relations(ipRegistrationLog, ({ one }) => ({
  user: one(users, {
    fields: [ipRegistrationLog.userId],
    references: [users.id],
  }),
}));

// ==========================================
// 兑换码表
// ==========================================
export const redeemCodes = pgTable('redeem_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  creditsAmount: decimal('credits_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  maxUses: integer('max_uses').default(1),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  redeemType: varchar('redeem_type', { length: 20 }).notNull().default('credits'),
  periodCardPlanId: uuid('period_card_plan_id').references(() => periodCardPlans.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  codeIdx: uniqueIndex('redeem_codes_code_idx').on(table.code),
  isActiveIdx: index('redeem_codes_is_active_idx').on(table.isActive),
  expiresAtIdx: index('redeem_codes_expires_at_idx').on(table.expiresAt),
}));

// ==========================================
// 兑换记录表
// ==========================================
export const redeemCodeUsages = pgTable('redeem_code_usages', {
  id: uuid('id').primaryKey().defaultRandom(),
  redeemCodeId: uuid('redeem_code_id').notNull().references(() => redeemCodes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  creditsAwarded: decimal('credits_awarded', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  codeIdIdx: index('redeem_code_usages_code_id_idx').on(table.redeemCodeId),
  userIdIdx: index('redeem_code_usages_user_id_idx').on(table.userId),
  userCodeIdx: uniqueIndex('redeem_code_usages_user_code_idx').on(table.redeemCodeId, table.userId),
}));

// ==========================================
// 期卡套餐定义表
// ==========================================
export const periodCardPlans = pgTable('period_card_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  periodType: varchar('period_type', { length: 20 }).notNull(), // 'daily', 'weekly', 'monthly'
  periodDays: integer('period_days').notNull(),
  dailyCredits: decimal('daily_credits', { precision: 12, scale: 2 }).notNull().default('0'),
  quotaMode: varchar('quota_mode', { length: 10 }).notNull().default('daily'),
  totalCredits: decimal('total_credits', { precision: 12, scale: 2 }).notNull().default('0'),
  priceCents: integer('price_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('CNY'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ==========================================
// 用户期卡记录表
// ==========================================
export const userPeriodCards = pgTable('user_period_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => periodCardPlans.id),
  paymentId: uuid('payment_id').references(() => payments.id),
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, expired, cancelled, upgraded
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  dailyCredits: decimal('daily_credits', { precision: 12, scale: 2 }).notNull(),
  dailyQuotaRemaining: decimal('daily_quota_remaining', { precision: 12, scale: 2 }).notNull(),
  quotaMode: varchar('quota_mode', { length: 10 }).notNull().default('daily'),
  totalCredits: decimal('total_credits', { precision: 12, scale: 2 }).notNull().default('0'),
  totalRemaining: decimal('total_remaining', { precision: 12, scale: 2 }).notNull().default('0'),
  quotaResetDate: varchar('quota_reset_date', { length: 10 }),
  expiryNotified: boolean('expiry_notified').notNull().default(false),
  upgradedToId: uuid('upgraded_to_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('user_period_cards_user_id_idx').on(table.userId),
  statusIdx: index('user_period_cards_status_idx').on(table.status),
  expiresAtIdx: index('user_period_cards_expires_at_idx').on(table.expiresAt),
  activeExpiresIdx: index('user_period_cards_active_expires_idx').on(table.userId, table.expiresAt).where(sql`status = 'active'`),
}));

// ==========================================
// 期卡额度使用日志表
// ==========================================
export const periodCardUsageLogs = pgTable('period_card_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userPeriodCardId: uuid('user_period_card_id').notNull().references(() => userPeriodCards.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  preChargeId: varchar('pre_charge_id', { length: 64 }),
  usageDate: varchar('usage_date', { length: 10 }).notNull(),
  quotaUsed: decimal('quota_used', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('period_card_usage_logs_user_id_idx').on(table.userId),
  dateIdx: index('period_card_usage_logs_date_idx').on(table.usageDate),
  preChargeIdIdx: uniqueIndex('period_card_usage_logs_card_precharge_uidx')
    .on(table.userPeriodCardId, table.preChargeId), // 实际约束以 migration 0039 的 partial index (WHERE pre_charge_id IS NOT NULL) 为准
}));

// ==========================================
// 期卡相关 Relations
// ==========================================
export const periodCardPlansRelations = relations(periodCardPlans, ({ many }) => ({
  userPeriodCards: many(userPeriodCards),
}));

export const userPeriodCardsRelations = relations(userPeriodCards, ({ one }) => ({
  user: one(users, {
    fields: [userPeriodCards.userId],
    references: [users.id],
  }),
  plan: one(periodCardPlans, {
    fields: [userPeriodCards.planId],
    references: [periodCardPlans.id],
  }),
  payment: one(payments, {
    fields: [userPeriodCards.paymentId],
    references: [payments.id],
  }),
}));

export const periodCardUsageLogsRelations = relations(periodCardUsageLogs, ({ one }) => ({
  userPeriodCard: one(userPeriodCards, {
    fields: [periodCardUsageLogs.userPeriodCardId],
    references: [userPeriodCards.id],
  }),
  user: one(users, {
    fields: [periodCardUsageLogs.userId],
    references: [users.id],
  }),
}));

export const redeemCodesRelations = relations(redeemCodes, ({ one, many }) => ({
  creator: one(users, {
    fields: [redeemCodes.createdBy],
    references: [users.id],
  }),
  usages: many(redeemCodeUsages),
}));

export const redeemCodeUsagesRelations = relations(redeemCodeUsages, ({ one }) => ({
  redeemCode: one(redeemCodes, {
    fields: [redeemCodeUsages.redeemCodeId],
    references: [redeemCodes.id],
  }),
  user: one(users, {
    fields: [redeemCodeUsages.userId],
    references: [users.id],
  }),
}));
