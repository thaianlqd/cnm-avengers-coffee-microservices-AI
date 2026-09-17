import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from_name?: string;
  from_email?: string;
}

interface CachedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth_user: string;
  auth_pass: string;
  from_email: string;
  from_name: string;
  is_active: boolean;
  timestamp: number;
}

@Injectable()
export class MailSenderService {
  private readonly logger = new Logger(MailSenderService.name);
  private cachedConfig: CachedSmtpConfig | null = null;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds cache TTL
  private readonly orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://order-service:3005';

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Primary method to send emails.
   * Attempt 1: Call order-service's unified POST /smtp/send.
   * Attempt 2 (Fallback): Direct DB query to orders.smtp_config + local nodemailer.
   * Attempt 3 (Final fallback): process.env or Ethereal test account.
   */
  async sendMail(options: SendMailOptions): Promise<{ success: boolean; messageId?: string; previewUrl?: string }> {
    const { to, subject, html, text, from_name, from_email } = options;

    if (!to || !to.includes('@')) {
      throw new Error(`Dia chi email nguoi nhan khong hop le: ${to}`);
    }

    // 1. Try sending via order-service HTTP REST Mail Hub
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 seconds timeout

      const res = await fetch(`${this.orderServiceUrl}/smtp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, html, text, from_name, from_email }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as { success: boolean; messageId?: string; previewUrl?: string };
        this.logger.log(`[MailSenderService] Email sent via order-service hub to ${to}: "${subject}"`);
        return data;
      }
      this.logger.warn(`[MailSenderService] order-service /smtp/send responded with status ${res.status}, falling back to direct DB transport`);
    } catch (httpErr: any) {
      this.logger.warn(`[MailSenderService] Could not reach order-service hub (${httpErr.message}), falling back to direct DB transport`);
    }

    // 2. Fallback: Direct DB query + local nodemailer transport
    try {
      const { transporter, fromAddress, isDemo } = await this.getDirectTransporter(from_name, from_email);
      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text: text || undefined,
        html,
      });

      let previewUrl: string | undefined;
      if (isDemo) {
        previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
        this.logger.log(`[MailSenderService Demo] Ethereal preview for ${to}: ${previewUrl}`);
      }

      this.logger.log(`[MailSenderService Direct] Successfully sent "${subject}" to ${to} (MessageId: ${info.messageId})`);
      return {
        success: true,
        messageId: info.messageId,
        previewUrl,
      };
    } catch (directErr: any) {
      this.logger.error(`[MailSenderService] Failed to send email to ${to}: ${directErr.message}`, directErr.stack);
      throw directErr;
    }
  }

  /**
   * Fetch active SMTP configuration from database orders.smtp_config
   */
  private async getSmtpConfigFromDb(): Promise<CachedSmtpConfig | null> {
    const now = Date.now();
    if (this.cachedConfig && (now - this.cachedConfig.timestamp < this.CACHE_TTL_MS)) {
      return this.cachedConfig;
    }

    try {
      const rows = await this.dataSource.query(
        `SELECT host, port, secure, auth_user, auth_pass, from_email, from_name, is_active FROM orders.smtp_config WHERE id = 'DEFAULT' LIMIT 1`
      );

      if (rows && rows.length > 0) {
        const row = rows[0];
        this.cachedConfig = {
          host: row.host || 'smtp.gmail.com',
          port: Number(row.port) || 587,
          secure: Boolean(row.secure),
          auth_user: row.auth_user || '',
          auth_pass: (row.auth_pass || '').replace(/\s+/g, ''),
          from_email: row.from_email || row.auth_user || 'support@avengers.coffee',
          from_name: row.from_name || 'Avengers Coffee',
          is_active: row.is_active !== undefined ? Boolean(row.is_active) : true,
          timestamp: now,
        };
        return this.cachedConfig;
      }
    } catch (dbErr: any) {
      this.logger.warn(`[MailSenderService] Error querying orders.smtp_config: ${dbErr.message}`);
    }

    return null;
  }

  /**
   * Create nodemailer transporter based on database config, env, or Ethereal
   */
  private async getDirectTransporter(customFromName?: string, customFromEmail?: string): Promise<{
    transporter: Transporter;
    fromAddress: string;
    isDemo: boolean;
  }> {
    const dbConfig = await this.getSmtpConfigFromDb();

    const host = dbConfig?.host || process.env.SMTP_HOST || '';
    const port = dbConfig?.port || Number(process.env.SMTP_PORT || 587);
    const secure = dbConfig !== null ? dbConfig.secure : (process.env.SMTP_SECURE === 'true');
    const user = dbConfig?.auth_user || process.env.SMTP_USER || '';
    const pass = dbConfig?.auth_pass || (process.env.SMTP_PASS || '').replace(/\s+/g, '');
    const isActive = dbConfig !== null ? dbConfig.is_active : true;

    const fromName = customFromName || dbConfig?.from_name || process.env.APP_NAME || 'Avengers Coffee';
    const senderEmail = customFromEmail || dbConfig?.from_email || user || process.env.SMTP_FROM || 'support@avengers.coffee';
    const fromAddress = `"${fromName}" <${senderEmail}>`;

    if (isActive && host && user && pass) {
      this.logger.log(`[MailSenderService] Creating direct SMTP transport host=${host}:${port}, user=${user}, secure=${secure}`);
      const transporter = nodemailer.createTransport({
        host,
        port: port || (secure ? 465 : 587),
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      });
      return { transporter, fromAddress, isDemo: false };
    }

    // Fallback Ethereal
    this.logger.log('[MailSenderService] SMTP not fully configured, generating Ethereal demo account...');
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    return { transporter, fromAddress, isDemo: true };
  }
}
