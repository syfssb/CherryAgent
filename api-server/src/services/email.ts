import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { pool } from '../db/index.js';

// ==========================================
// 类型定义
// ==========================================

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  enabled: boolean;
}

interface EmailTemplate {
  slug: string;
  name: string;
  subject: string;
  htmlContent: string;
  variables: string;
  isEnabled: boolean;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  userId?: string;
  template?: string;
}

// ==========================================
// SMTP 配置缓存
// ==========================================

interface SmtpConfigCache {
  data: SmtpConfig | null;
  lastUpdated: number;
}

const SMTP_CACHE_TTL_MS = 60_000; // 1 分钟缓存

let smtpConfigCache: SmtpConfigCache = {
  data: null,
  lastUpdated: 0,
};

let cachedTransporter: Transporter | null = null;
let cachedTransporterConfigHash = '';

// ==========================================
// 低余额提醒冷却缓存 (内存级别, 24 小时)
// ==========================================

const lowBalanceCooldown = new Map<string, number>();
const LOW_BALANCE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 小时

// ==========================================
// 邮件服务
// ==========================================

export const emailService = {
  /**
   * 从数据库加载 SMTP 配置
   */
  async loadSmtpConfig(): Promise<SmtpConfig> {
    const now = Date.now();
    if (
      smtpConfigCache.data !== null &&
      now - smtpConfigCache.lastUpdated < SMTP_CACHE_TTL_MS
    ) {
      return smtpConfigCache.data;
    }

    const result = await pool.query(
      `SELECT key, value FROM system_configs WHERE key IN (
        'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure',
        'smtp_from_name', 'smtp_from_email', 'smtp_reply_to', 'email_enabled'
      )`
    );

    const configMap = new Map<string, string>();
    for (const row of result.rows as Array<{ key: string; value: string }>) {
      configMap.set(row.key, row.value);
    }

    const config: SmtpConfig = {
      host: configMap.get('smtp_host') ?? '',
      port: parseInt(configMap.get('smtp_port') ?? '587', 10),
      secure: configMap.get('smtp_secure') === 'true',
      user: configMap.get('smtp_user') ?? '',
      pass: configMap.get('smtp_pass') ?? '',
      fromName: configMap.get('smtp_from_name') ?? 'Cherry Agent',
      fromEmail: configMap.get('smtp_from_email') ?? '',
      replyTo: configMap.get('smtp_reply_to') ?? '',
      enabled: configMap.get('email_enabled') === 'true',
    };

    smtpConfigCache = { data: config, lastUpdated: now };
    return config;
  },

  /**
   * 清除 SMTP 配置缓存
   */
  clearSmtpConfigCache(): void {
    smtpConfigCache = { data: null, lastUpdated: 0 };
    cachedTransporter = null;
    cachedTransporterConfigHash = '';
  },

  /**
   * 获取或创建 nodemailer transporter
   */
  async getTransporter(): Promise<Transporter> {
    const config = await this.loadSmtpConfig();
    const configHash = `${config.host}:${config.port}:${config.user}:${config.secure}`;

    if (cachedTransporter && cachedTransporterConfigHash === configHash) {
      return cachedTransporter;
    }

    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    cachedTransporterConfigHash = configHash;
    return cachedTransporter;
  },

  /**
   * 加载邮件模板
   */
  async getTemplate(slug: string): Promise<EmailTemplate | null> {
    const result = await pool.query(
      `SELECT slug, name, subject, html_content, variables, is_enabled
       FROM email_templates
       WHERE slug = $1`,
      [slug]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as {
      slug: string;
      name: string;
      subject: string;
      html_content: string;
      variables: string;
      is_enabled: boolean;
    };

    return {
      slug: row.slug,
      name: row.name,
      subject: row.subject,
      htmlContent: row.html_content,
      variables: row.variables,
      isEnabled: row.is_enabled,
    };
  },

  /**
   * 替换模板变量
   */
  renderTemplate(template: string, variables: Record<string, string>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(pattern, value);
    }
    return rendered;
  },

  /**
   * 发送邮件 (底层方法)
   */
  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
    const config = await this.loadSmtpConfig();

    if (!config.enabled) {
      return { success: false, error: '邮件服务未启用' };
    }

    if (!config.host || !config.fromEmail) {
      return { success: false, error: 'SMTP 配置不完整' };
    }

    // 记录邮件日志 (pending 状态)
    const logResult = await pool.query(
      `INSERT INTO email_logs (user_id, to_email, subject, template, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [options.userId ?? null, options.to, options.subject, options.template ?? 'custom']
    );
    const logId = (logResult.rows[0] as { id: string }).id;

    try {
      const transporter = await this.getTransporter();

      const mailOptions: nodemailer.SendMailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      };

      if (config.replyTo) {
        mailOptions.replyTo = config.replyTo;
      }

      await transporter.sendMail(mailOptions);

      // 更新日志为 sent
      await pool.query(
        `UPDATE email_logs SET status = 'sent', sent_at = NOW() WHERE id = $1`,
        [logId]
      );

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // 更新日志为 failed
      await pool.query(
        `UPDATE email_logs SET status = 'failed', error_message = $1 WHERE id = $2`,
        [errorMessage, logId]
      );

      console.error('[Email] 发送邮件失败:', errorMessage);
      return { success: false, error: errorMessage };
    }
  },

  /**
   * 使用模板发送邮件
   */
  async sendTemplateEmail(
    templateSlug: string,
    to: string,
    variables: Record<string, string>,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const template = await this.getTemplate(templateSlug);

    if (!template) {
      return { success: false, error: `模板 "${templateSlug}" 不存在` };
    }

    if (!template.isEnabled) {
      return { success: false, error: `模板 "${templateSlug}" 已禁用` };
    }

    const subject = this.renderTemplate(template.subject, variables);
    const html = this.renderTemplate(template.htmlContent, variables);

    return this.sendEmail({
      to,
      subject,
      html,
      userId,
      template: templateSlug,
    });
  },

  // ==========================================
  // 业务邮件方法
  // ==========================================

  /**
   * 发送欢迎邮件
   */
  async sendWelcomeEmail(
    to: string,
    username: string,
    welcomeCredits: string
  ): Promise<void> {
    const result = await this.sendTemplateEmail('welcome', to, {
      username,
      appName: 'Cherry Agent',
      welcomeCredits,
    });

    if (!result.success) {
      console.error('[Email] 发送欢迎邮件失败:', result.error);
    }
  },

  /**
   * 发送购买确认邮件
   */
  async sendPurchaseConfirmEmail(
    to: string,
    username: string,
    amount: string,
    credits: string,
    orderId: string
  ): Promise<void> {
    const result = await this.sendTemplateEmail('purchase_confirm', to, {
      username,
      appName: 'Cherry Agent',
      amount,
      credits,
      orderId,
    });

    if (!result.success) {
      console.error('[Email] 发送购买确认邮件失败:', result.error);
    }
  },

  /**
   * 发送余额不足提醒邮件 (带 24 小时冷却)
   */
  async sendLowBalanceEmail(
    to: string,
    username: string,
    currentCredits: string,
    userId?: string
  ): Promise<void> {
    // 检查冷却期
    const cooldownKey = userId ?? to;
    const lastSent = lowBalanceCooldown.get(cooldownKey);
    if (lastSent && Date.now() - lastSent < LOW_BALANCE_COOLDOWN_MS) {
      return;
    }

    const result = await this.sendTemplateEmail(
      'low_balance',
      to,
      {
        username,
        appName: 'Cherry Agent',
        currentCredits,
      },
      userId
    );

    if (result.success) {
      lowBalanceCooldown.set(cooldownKey, Date.now());
    } else {
      console.error('[Email] 发送余额不足提醒失败:', result.error);
    }
  },

  /**
   * 发送邮箱验证邮件
   */
  async sendVerificationEmail(
    to: string,
    username: string,
    verifyLink: string
  ): Promise<void> {
    const result = await this.sendTemplateEmail('email_verification', to, {
      username,
      appName: 'Cherry Agent',
      verifyLink,
    });

    if (!result.success) {
      console.error('[Email] 发送邮箱验证邮件失败:', result.error);
    }
  },

  /**
   * 发送密码重置邮件
   */
  async sendPasswordResetEmail(
    to: string,
    username: string,
    resetLink: string
  ): Promise<void> {
    const result = await this.sendTemplateEmail('password_reset', to, {
      username,
      appName: 'Cherry Agent',
      resetLink,
    });

    if (!result.success) {
      console.error('[Email] 发送密码重置邮件失败:', result.error);
    }
  },

  /**
   * 发送退款通知邮件
   */
  async sendRefundEmail(
    to: string,
    username: string,
    amount: string,
    reason: string
  ): Promise<void> {
    const result = await this.sendTemplateEmail('refund', to, {
      username,
      appName: 'Cherry Agent',
      amount,
      reason,
    });

    if (!result.success) {
      console.error('[Email] 发送退款通知邮件失败:', result.error);
    }
  },

  /**
   * 发送期卡购买确认邮件
   */
  async sendPeriodCardPurchaseEmail(
    to: string,
    username: string,
    planName: string,
    startsAt: string,
    expiresAt: string,
    dailyCredits: string,
    quotaMode: 'daily' | 'total' = 'daily',
    totalCredits: string = '0'
  ): Promise<void> {
    const isTotal = quotaMode === 'total';
    const result = await this.sendTemplateEmail('period-card-purchase-confirm', to, {
      username,
      appName: 'Cherry Agent',
      planName,
      startsAt,
      expiresAt,
      dailyCredits,
      creditsLabel: isTotal ? '总额度' : '每日额度',
      creditsDisplay: isTotal ? totalCredits : dailyCredits,
      creditsNote: isTotal
        ? '总额度在有效期内可自由使用，用完即止。超出部分将从充值积分中扣除。'
        : '每日额度在北京时间 00:00 自动重置，当天未用完的额度不累积。超出额度部分将从充值积分中扣除。',
      introText: isTotal
        ? `您已成功购买 <strong>${planName}</strong>，现在可以使用总额度了。`
        : `您已成功购买 <strong>${planName}</strong>，现在可以享受每日额度了。`,
    });

    if (!result.success) {
      console.error('[Email] 发送期卡购买确认邮件失败:', result.error);
    }
  },

  /**
   * 发送期卡到期提醒邮件
   */
  async sendPeriodCardExpiryEmail(
    to: string,
    username: string,
    planName: string,
    expiresAt: string,
    renewLink: string
  ): Promise<void> {
    const result = await this.sendTemplateEmail('period-card-expiry-reminder', to, {
      username,
      appName: 'Cherry Agent',
      planName,
      expiresAt,
      renewLink,
    });

    if (!result.success) {
      console.error('[Email] 发送期卡到期提醒邮件失败:', result.error);
    }
  },

  /**
   * 测试 SMTP 连接
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
    try {
      const config = await this.loadSmtpConfig();

      if (!config.host) {
        return { success: false, message: 'SMTP 服务器地址未配置' };
      }

      const transporter = await this.getTransporter();
      await transporter.verify();

      return {
        success: true,
        message: 'SMTP 连接测试成功',
        details: {
          host: config.host,
          port: config.port,
          secure: config.secure,
          user: config.user,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `SMTP 连接失败: ${errorMessage}`,
      };
    }
  },

  /**
   * 发送测试邮件
   */
  async sendTestEmail(
    to: string,
    subject?: string
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.loadSmtpConfig();

    // 临时启用以发送测试邮件
    const originalEnabled = config.enabled;
    if (smtpConfigCache.data) {
      smtpConfigCache.data = { ...smtpConfigCache.data, enabled: true };
    }

    try {
      const result = await this.sendEmail({
        to,
        subject: subject ?? '系统测试邮件 - Cherry Agent',
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:40px;background:#f5f5f5">
            <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
              <h1 style="color:#1f2937;margin-top:0">邮件配置测试</h1>
              <p style="color:#4b5563;line-height:1.6">这是一封测试邮件，用于验证 SMTP 配置是否正确。</p>
              <p style="color:#4b5563;line-height:1.6">如果您收到了这封邮件，说明邮件服务配置正常。</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
              <p style="color:#9ca3af;font-size:12px">发送时间: ${new Date().toLocaleString('zh-CN')}</p>
              <p style="color:#9ca3af;font-size:12px">SMTP 服务器: ${config.host}:${config.port}</p>
            </div>
          </body>
          </html>
        `,
        template: 'test',
      });

      if (result.success) {
        return { success: true, message: `测试邮件已发送到 ${to}` };
      }
      return { success: false, message: result.error ?? '发送失败' };
    } finally {
      // 恢复原始启用状态
      if (smtpConfigCache.data) {
        smtpConfigCache.data = { ...smtpConfigCache.data, enabled: originalEnabled };
      }
    }
  },
};

export default emailService;
