-- ============================================================
-- run_migrations.sql - 迁移执行入口
-- 按顺序执行所有迁移文件
-- ============================================================

-- 使用方法:
-- psql -h localhost -U postgres -d your_database -f run_migrations.sql
-- 或者单独执行每个迁移文件:
-- psql -h localhost -U postgres -d your_database -f 0001_users.sql
-- psql -h localhost -U postgres -d your_database -f 0002_billing.sql
-- ...

\echo '============================================================'
\echo 'Starting database migrations...'
\echo '============================================================'

\echo ''
\echo '[1/19] Running 0001_users.sql - 用户与认证...'
\i 0001_users.sql
\echo 'Completed: 0001_users.sql'

\echo ''
\echo '[2/19] Running 0002_billing.sql - 余额与计费...'
\i 0002_billing.sql
\echo 'Completed: 0002_billing.sql'

\echo ''
\echo '[3/19] Running 0003_channels.sql - API 渠道配置...'
\i 0003_channels.sql
\echo 'Completed: 0003_channels.sql'

\echo ''
\echo '[4/19] Running 0004_admin.sql - 管理后台...'
\i 0004_admin.sql
\echo 'Completed: 0004_admin.sql'

\echo ''
\echo '[5/19] Running 0005_versions.sql - 版本与通知...'
\i 0005_versions.sql
\echo 'Completed: 0005_versions.sql'

\echo ''
\echo '[6/19] Running 0006_announcements_and_configs.sql - 公告和配置...'
\i 0006_announcements_and_configs.sql
\echo 'Completed: 0006_announcements_and_configs.sql'

\echo ''
\echo '[7/19] Running 0007_enhance_user_api_keys.sql - 增强 API Keys...'
\i 0007_enhance_user_api_keys.sql
\echo 'Completed: 0007_enhance_user_api_keys.sql'

\echo ''
\echo '[8/19] Running 0008_optimize_usage_logs_indexes.sql - 优化索引...'
\i 0008_optimize_usage_logs_indexes.sql
\echo 'Completed: 0008_optimize_usage_logs_indexes.sql'

\echo ''
\echo '[9/19] Running 0009_credits_system.sql - 积分计费体系...'
\i 0009_credits_system.sql
\echo 'Completed: 0009_credits_system.sql'

\echo ''
\echo '[10/19] Running 0010_preset_skills.sql - 预装 Skill 管理...'
\i 0010_preset_skills.sql
\echo 'Completed: 0010_preset_skills.sql'

\echo ''
\echo '[11/19] Running 0011_referral_system.sql - 分销系统...'
\i 0011_referral_system.sql
\echo 'Completed: 0011_referral_system.sql'

\echo ''
\echo '[12/19] Running 0012_email_system.sql - 邮件系统...'
\i 0012_email_system.sql
\echo 'Completed: 0012_email_system.sql'

\echo ''
\echo '[13/19] Running 0013_payment_config.sql - 支付配置...'
\i 0013_payment_config.sql
\echo 'Completed: 0013_payment_config.sql'

\echo ''
\echo '[14/19] Running 0014_discount_codes.sql - 折扣码...'
\i 0014_discount_codes.sql
\echo 'Completed: 0014_discount_codes.sql'

\echo ''
\echo '[15/19] Running 0015_email_verification_tokens.sql - 邮箱验证令牌...'
\i 0015_email_verification_tokens.sql
\echo 'Completed: 0015_email_verification_tokens.sql'

\echo ''
\echo '[16/19] Running 0016_spending_limits.sql - 积分消费限额...'
\i 0016_spending_limits.sql
\echo 'Completed: 0016_spending_limits.sql'

\echo ''
\echo '[17/19] Running 0017_password_reset_tokens.sql - 密码重置令牌...'
\i 0017_password_reset_tokens.sql
\echo 'Completed: 0017_password_reset_tokens.sql'

\echo ''
\echo '[18/19] Running 0018_seed_preset_skills.sql - 预装 Skill 种子数据...'
\i 0018_seed_preset_skills.sql
\echo 'Completed: 0018_seed_preset_skills.sql'

\echo ''
\echo '[19/22] Running 0019_i18n_support.sql - 多语言国际化支持...'
\i 0019_i18n_support.sql
\echo 'Completed: 0019_i18n_support.sql'

\echo ''
\echo '[20/22] Running 0020_checkin_and_fraud.sql - 签到与反欺诈...'
\i 0020_checkin_and_fraud.sql
\echo 'Completed: 0020_checkin_and_fraud.sql'

\echo ''
\echo '[21/22] Running 0021_redeem_codes.sql - 兑换码...'
\i 0021_redeem_codes.sql
\echo 'Completed: 0021_redeem_codes.sql'

\echo ''
\echo '[22/23] Running 0022_announcement_pinned.sql - 公告置顶...'
\i 0022_announcement_pinned.sql
\echo 'Completed: 0022_announcement_pinned.sql'

\echo ''
\echo '[23/24] Running 0023_add_important_announcement_type.sql - 公告类型扩展...'
\i 0023_add_important_announcement_type.sql
\echo 'Completed: 0023_add_important_announcement_type.sql'

\echo ''
\echo '[24/25] Running 0024_fix_welcome_credits_config.sql - 修复欢迎积分配置...'
\i 0024_fix_welcome_credits_config.sql
\echo 'Completed: 0024_fix_welcome_credits_config.sql'

\echo ''
\echo '[25/25] Running 0025_period_card_plans.sql - 期卡套餐系统...'
\i 0025_period_card_plans.sql
\echo 'Completed: 0025_period_card_plans.sql'

\echo ''
\echo '[26/26] Running 0026_period_card_usage_logs_pre_charge_id.sql - 期卡日志预扣关联...'
\i 0026_period_card_usage_logs_pre_charge_id.sql
\echo 'Completed: 0026_period_card_usage_logs_pre_charge_id.sql'

\echo ''
\echo '[27/27] Running 0027_backfill_pre_charge_id.sql - 回填历史期卡日志 pre_charge_id...'
\i 0027_backfill_pre_charge_id.sql
\echo 'Completed: 0027_backfill_pre_charge_id.sql'

\echo ''
\echo '[28/29] Running 0028_redeem_code_period_card.sql - 兑换码支持期卡...'
\i 0028_redeem_code_period_card.sql
\echo 'Completed: 0028_redeem_code_period_card.sql'

\echo ''
\echo '[29/31] Running 0029_allow_multiple_active_cards.sql - 允许多张期卡并行...'
\i 0029_allow_multiple_active_cards.sql
\echo 'Completed: 0029_allow_multiple_active_cards.sql'

\echo ''
\echo '[30/31] Running 0030_add_model_description.sql - 添加模型介绍字段...'
\i 0030_add_model_description.sql
\echo 'Completed: 0030_add_model_description.sql'

\echo ''
\echo '[31/31] Running 0031_add_period_card_description.sql - 添加期卡介绍字段...'
\i 0031_add_period_card_description.sql
\echo 'Completed: 0031_add_period_card_description.sql'

\echo ''
\echo 'Running 0035_skill_compatible_runtimes.sql - Skill 兼容运行时...'
\i 0035_skill_compatible_runtimes.sql
\echo 'Completed: 0035_skill_compatible_runtimes.sql'

\echo ''
\echo 'Running 0037_period_card_quota_mode.sql - 期卡双模式(每日重置+总量池)...'
\i 0037_period_card_quota_mode.sql
\echo 'Completed: 0037_period_card_quota_mode.sql'

\echo ''
\echo 'Running 0038_fix_duplicate_period_cards.sql - 修复重复期卡...'
\i 0038_fix_duplicate_period_cards.sql
\echo 'Completed: 0038_fix_duplicate_period_cards.sql'

\echo ''
\echo 'Running 0039_fix_period_card_usage_logs_conflict.sql - 修复期卡日志 ON CONFLICT 约束...'
\i 0039_fix_period_card_usage_logs_conflict.sql
\echo 'Completed: 0039_fix_period_card_usage_logs_conflict.sql'

\echo ''
\echo 'Running 0040_add_model_hidden.sql - 添加模型隐藏字段...'
\i 0040_add_model_hidden.sql
\echo 'Completed: 0040_add_model_hidden.sql'

\echo ''
\echo '============================================================'
\echo 'All migrations completed successfully!'
\echo '============================================================'
\echo ''
\echo 'Tables created:'
\echo '  - users'
\echo '  - user_api_keys'
\echo '  - user_balances'
\echo '  - recharge_records'
\echo '  - usage_records'
\echo '  - balance_transactions'
\echo '  - channels'
\echo '  - models'
\echo '  - price_multipliers'
\echo '  - admins'
\echo '  - admin_logs'
\echo '  - system_configs'
\echo '  - app_versions'
\echo '  - announcements'
\echo '  - credit_packages'
\echo '  - preset_skills'
\echo '  - referral_config'
\echo '  - referral_codes'
\echo '  - referral_relations'
\echo '  - referral_commissions'
\echo '  - referral_withdrawals'
\echo '  - email_logs'
\echo '  - email_templates'
\echo '  - discount_codes'
\echo '  - discount_code_usages'
\echo '  - password_reset_tokens'
\echo ''
\echo 'Default data inserted:'
\echo '  - 11 AI models (OpenAI, Anthropic, Google, DeepSeek)'
\echo '  - 5 credit packages (体验包, 基础包, 标准包, 专业包, 企业包)'
\echo '  - 24+ system configuration items'
\echo '  - 1 default admin account (username: admin, password: admin123)'
\echo '  - period_card_plans'
\echo '  - user_period_cards'
\echo '  - period_card_usage_logs'
\echo ''
\echo 'Default data inserted:'
\echo '  - 11 AI models (OpenAI, Anthropic, Google, DeepSeek)'
\echo '  - 5 credit packages (体验包, 基础包, 标准包, 专业包, 企业包)'
\echo '  - 24+ system configuration items'
\echo '  - 1 default admin account (username: admin, password: admin123)'
\echo '  - 7 email templates (welcome, purchase_confirm, low_balance, password_reset, refund, period-card-expiry-reminder, period-card-purchase-confirm)'
\echo '  - 1 default referral config'
\echo '  - 11 payment config items'
\echo '  - 14 preset skills (pdf, docx, pptx, xlsx, etc.)'
\echo '  - 14 preset skills i18n translations (zh, zh-TW, ja)'
\echo ''
\echo 'IMPORTANT: Change the default admin password in production!'
