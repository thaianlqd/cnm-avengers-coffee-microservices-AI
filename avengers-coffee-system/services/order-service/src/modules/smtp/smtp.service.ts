import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmtpConfig } from './smtp-config.entity';
import { DonHang } from '../thanh-toan/entities/don-hang.entity';
import { ChiTietDonHang } from '../thanh-toan/entities/chi-tiet-don-hang.entity';
import { DeliveryTracking } from '../shipper/features_thaian/delivery-tracking.entity';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';

export interface EmailTemplateOptions {
  headerTagline?: string;
  heroImageUrl?: string;
  heroTitle: string;
  heroSubtitle?: string;
  heroBadgeTitle?: string;
  heroBadgeValue?: string;
  heroBadgeSub?: string;
  greetingTitle: string;
  greetingBody: string;
  greetingEn?: string;
  highlightCode?: string;
  highlightLabel?: string;
  highlightSubText?: string;
  ctaText: string;
  ctaSubText?: string;
  ctaUrl: string;
  ctaColor?: 'green' | 'blue' | 'red';
  detailsTitle?: string;
  detailsHtml?: string;
  termsTitle?: string;
  termsHtml?: string;
  promoImageUrl?: string;
  promoTitle?: string;
  promoSubtitle?: string;
  hideCta?: boolean;
}

export function escapeEmailHtml(value: unknown): string {
  const replacements: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, character => replacements[character] || character);
}

export function buildBrandedEmailHtml(options: EmailTemplateOptions): string {
  const brand = '#6f1825';
  const trackingUrl = escapeEmailHtml(options.ctaUrl);
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeEmailHtml(options.heroTitle)}</title></head>
<body style="margin:0;background:#f5f4f1;color:#262321;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f1;"><tr><td align="center" style="padding:32px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e7e2dc;">
<tr><td style="padding:26px 32px;border-bottom:1px solid #e7e2dc;font-size:16px;letter-spacing:2px;font-weight:700;color:${brand};">AVENGERS COFFEE</td></tr>
<tr><td style="padding:36px 32px 14px;">
<h1 style="margin:0 0 10px;font-size:25px;line-height:1.3;font-weight:600;color:#262321;">${escapeEmailHtml(options.heroTitle)}</h1>
${options.heroSubtitle ? `<p style="margin:0;color:#756e68;font-size:13px;line-height:1.5;">${escapeEmailHtml(options.heroSubtitle)}</p>` : ''}
${options.heroBadgeValue ? `<div style="margin:28px 0 0;padding:16px 0;border-top:1px solid #e7e2dc;border-bottom:1px solid #e7e2dc;"><div style="font-size:11px;color:#756e68;letter-spacing:1px;">${escapeEmailHtml(options.heroBadgeTitle || '')}</div><div style="margin-top:6px;font-size:22px;color:${brand};font-weight:600;">${escapeEmailHtml(options.heroBadgeValue)}</div>${options.heroBadgeSub ? `<div style="margin-top:5px;font-size:12px;color:#756e68;">${escapeEmailHtml(options.heroBadgeSub)}</div>` : ''}</div>` : ''}
</td></tr>
<tr><td style="padding:12px 32px 26px;"><h2 style="margin:0 0 10px;font-size:16px;font-weight:600;">${escapeEmailHtml(options.greetingTitle)}</h2><div style="font-size:14px;line-height:1.7;color:#4d4843;">${options.greetingBody}</div>
${options.highlightCode ? `<p style="font-size:13px;color:#756e68;">${escapeEmailHtml(options.highlightLabel || 'Mã tra cứu')}: <strong style="color:${brand};">${escapeEmailHtml(options.highlightCode)}</strong></p>` : ''}
${!options.hideCta && options.ctaUrl ? `<p style="margin:26px 0 0;"><a href="${trackingUrl}" style="display:inline-block;background:${brand};color:#fff;text-decoration:none;padding:12px 20px;font-size:13px;font-weight:600;">${escapeEmailHtml(options.ctaText)}</a></p>` : ''}
</td></tr>
${options.detailsHtml ? `<tr><td style="padding:0 32px 26px;"><h3 style="margin:0 0 14px;font-size:13px;font-weight:600;color:#625b55;">${escapeEmailHtml(options.detailsTitle || 'Chi tiết đơn hàng')}</h3>${options.detailsHtml}</td></tr>` : ''}
${options.termsHtml ? `<tr><td style="padding:0 32px 28px;font-size:12px;line-height:1.6;color:#756e68;">${options.termsHtml}</td></tr>` : ''}
<tr><td style="padding:22px 32px;border-top:1px solid #e7e2dc;font-size:12px;line-height:1.6;color:#756e68;">Email tự động từ Avengers Coffee. Bạn có thể theo dõi đơn qua liên kết ở trên.</td></tr>
</table></td></tr></table></body></html>`;
}

@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);

  constructor(
    @InjectRepository(SmtpConfig)
    private readonly smtpRepo: Repository<SmtpConfig>,
    @InjectRepository(DeliveryTracking)
    private readonly trackingRepo: Repository<DeliveryTracking>,
  ) {}

  /**
   * Đảm bảo luôn có mã tra cứu đơn hàng (AC-XXXXX) cho khách vãng lai và email thông báo.
   * Tự động tái sử dụng nếu đã có, hoặc tạo mới và lưu vào bảng delivery_tracking.
   */
  async resolveTrackingCode(donHang: DonHang, providedCode?: string): Promise<string> {
    try {
      const cleanProvided = String(providedCode || '').trim().toUpperCase();
      if (cleanProvided && cleanProvided !== 'NULL' && cleanProvided !== 'UNDEFINED') {
        return cleanProvided;
      }

      if (!donHang?.ma_don_hang) {
        return `AC-${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5)}`;
      }

      // 1. Tìm bản ghi delivery_tracking tương ứng với ma_don_hang
      const tracking = await this.trackingRepo.findOne({
        where: { ma_don_hang: donHang.ma_don_hang },
      });

      if (tracking?.tracking_code && tracking.tracking_code.trim()) {
        return tracking.tracking_code.trim().toUpperCase();
      }

      // 2. Nếu đã có bản ghi tracking nhưng chưa có tracking_code, sinh mã mới và cập nhật
      const newTrackingCode = `AC-${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5)}`;

      if (tracking) {
        tracking.tracking_code = newTrackingCode;
        await this.trackingRepo.save(tracking);
        this.logger.log(`[SMTP] Generated and assigned new tracking_code ${newTrackingCode} to existing delivery_tracking for order #${donHang.ma_don_hang}`);
        return newTrackingCode;
      }

      // 3. Nếu chưa có bản ghi delivery_tracking nào, tạo mới cho đơn hàng
      const newTracking = this.trackingRepo.create({
        ma_don_hang: donHang.ma_don_hang,
        tracking_code: newTrackingCode,
        delivery_mode: (donHang.loai_don_hang as any) || 'GIAO_TAN_NOI',
        delivery_method: donHang.loai_don_hang === 'GIAO_TAN_NOI' ? 'INTERNAL' : null,
        customer_name: donHang.ten_khach_hang || donHang.guest_email || 'Khách vãng lai',
        customer_phone: donHang.guest_phone || null,
        delivery_address: donHang.dia_chi_giao_hang || null,
        branch_code: donHang.co_so_ma || null,
        table_number: donHang.ma_ban || null,
      });

      await this.trackingRepo.save(newTracking);
      this.logger.log(`[SMTP] Created new delivery_tracking with tracking_code ${newTrackingCode} for order #${donHang.ma_don_hang}`);
      return newTrackingCode;
    } catch (err) {
      this.logger.warn(`[SMTP] Error resolving tracking code for order #${donHang?.ma_don_hang}: ${err.message}`);
      const fallbackSuffix = String(donHang?.ma_don_hang || '').replace(/-/g, '').slice(-5).toUpperCase() || 'ORDER';
      return `AC-${fallbackSuffix}`;
    }
  }

  async getConfig(): Promise<SmtpConfig> {
    try {
      let config = await this.smtpRepo.findOne({ where: { id: 'DEFAULT' } });
      if (!config) {
        config = this.smtpRepo.create({
          id: 'DEFAULT',
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth_user: process.env.SMTP_USER || null,
          auth_pass: process.env.SMTP_PASS || null,
          from_email: process.env.SMTP_FROM || 'support@avengers.coffee',
          from_name: process.env.APP_NAME || 'Avengers Coffee',
          is_active: true,
        });
        try {
          await this.smtpRepo.save(config);
        } catch (saveErr) {
          this.logger.warn('Could not auto-persist default SMTP config into DB yet: ' + saveErr.message);
        }
      }
      return config;
    } catch (err) {
      this.logger.warn('Error reading smtp_config table: ' + err.message);
      return {
        id: 'DEFAULT',
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth_user: process.env.SMTP_USER || null,
        auth_pass: process.env.SMTP_PASS || null,
        from_email: process.env.SMTP_FROM || 'support@avengers.coffee',
        from_name: process.env.APP_NAME || 'Avengers Coffee',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as SmtpConfig;
    }
  }

  async getPublicConfig(): Promise<Partial<SmtpConfig> & { has_auth_pass: boolean }> {
    const config = await this.getConfig();
    return {
      id: config.id,
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth_user: config.auth_user,
      has_auth_pass: Boolean(config.auth_pass && config.auth_pass.trim().length > 0),
      from_email: config.from_email,
      from_name: config.from_name,
      is_active: config.is_active,
      updated_at: config.updated_at,
    };
  }

  async updateConfig(dto: {
    host?: string;
    port?: number;
    secure?: boolean;
    auth_user?: string;
    auth_pass?: string;
    from_email?: string;
    from_name?: string;
    is_active?: boolean;
  }): Promise<SmtpConfig> {
    const existing = await this.getConfig();

    if (dto.host !== undefined) existing.host = dto.host.trim();
    if (dto.port !== undefined) existing.port = Number(dto.port);
    if (dto.secure !== undefined) existing.secure = Boolean(dto.secure);
    if (dto.auth_user !== undefined) existing.auth_user = dto.auth_user.trim();
    if (dto.auth_pass !== undefined && dto.auth_pass.trim().length > 0) {
      existing.auth_pass = dto.auth_pass.trim();
    }
    if (dto.from_email !== undefined) existing.from_email = dto.from_email.trim();
    if (dto.from_name !== undefined) existing.from_name = dto.from_name.trim();
    if (dto.is_active !== undefined) existing.is_active = Boolean(dto.is_active);

    return this.smtpRepo.save(existing);
  }

  async getInternalConfig(): Promise<SmtpConfig> {
    return this.getConfig();
  }

  private async createTransporter(customConfig?: Partial<SmtpConfig>): Promise<{ transporter: nodemailer.Transporter; fromAddress: string; isDemo: boolean }> {
    const dbConfig = await this.getConfig();

    const config: SmtpConfig = { ...dbConfig };
    if (customConfig) {
      if (customConfig.host && customConfig.host.trim() !== '') config.host = customConfig.host.trim();
      if (customConfig.port && Number(customConfig.port) > 0) config.port = Number(customConfig.port);
      if (customConfig.secure !== undefined) config.secure = Boolean(customConfig.secure);
      if (customConfig.auth_user && customConfig.auth_user.trim() !== '') config.auth_user = customConfig.auth_user.trim();
      if (customConfig.auth_pass && customConfig.auth_pass.trim() !== '') config.auth_pass = customConfig.auth_pass.trim();
      if (customConfig.from_email && customConfig.from_email.trim() !== '') config.from_email = customConfig.from_email.trim();
      if (customConfig.from_name && customConfig.from_name.trim() !== '') config.from_name = customConfig.from_name.trim();
      if (customConfig.is_active !== undefined) config.is_active = Boolean(customConfig.is_active);
    }

    // Tự động chuẩn hóa mật khẩu ứng dụng (loại bỏ khoảng trắng nếu người dùng paste dạng "abcd efgh ijkl mnop")
    const cleanPass = (config.auth_pass || '').replace(/\s+/g, '');

    const senderEmail = (config.from_email && config.from_email.includes('@')) ? config.from_email : (config.auth_user || 'support@avengers.coffee');
    const fromAddress = `"${config.from_name || 'Avengers Coffee'}" <${senderEmail}>`;

    if (config.is_active && config.host && config.auth_user && cleanPass) {
      this.logger.log(`[SMTP] Initializing real SMTP connection with host=${config.host}:${config.port}, user=${config.auth_user}, secure=${config.secure}`);
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port || (config.secure ? 465 : 587),
        secure: Boolean(config.secure),
        auth: {
          user: config.auth_user,
          pass: cleanPass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
      return { transporter, fromAddress, isDemo: false };
    }

    // Fallback: Test account (Ethereal) chỉ khi chưa có tài khoản SMTP
    this.logger.log('SMTP config not fully configured, creating Ethereal demo account for test...');
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    return { transporter, fromAddress, isDemo: true };
  }

  async sendTestEmail(toEmail: string, customConfig?: Partial<SmtpConfig>): Promise<{ success: boolean; message: string; previewUrl?: string }> {
    if (!toEmail || !toEmail.includes('@')) {
      throw new Error('Địa chỉ email người nhận không hợp lệ.');
    }

    const { transporter, fromAddress, isDemo } = await this.createTransporter(customConfig);

    const adminWebUrl = process.env.ADMIN_WEB_URL || 'http://localhost:5174';

    const testDetailsHtml = `
      <div style="background-color: #f8fafc; border-radius: 14px; border: 1px solid #e2e8f0; padding: 20px; margin-bottom: 14px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
          <tr>
            <td style="padding: 7px 0; color: #64748b; width: 42%;">Thời gian kiểm tra:</td>
            <td style="padding: 7px 0; text-align: right; color: #1e293b; font-weight: 700;">${new Date().toLocaleString('vi-VN')}</td>
          </tr>
          <tr>
            <td style="padding: 7px 0; color: #64748b;">Chế độ kết nối:</td>
            <td style="padding: 7px 0; text-align: right; color: #059669; font-weight: 800;">${isDemo ? 'Demo Ethereal Mail' : 'Máy chủ SMTP Trực Tiếp (Gmail)'}</td>
          </tr>
          <tr>
            <td style="padding: 7px 0; color: #64748b;">Hòm thư nhận:</td>
            <td style="padding: 7px 0; text-align: right; color: #2563eb; font-weight: 800;">${toEmail}</td>
          </tr>
        </table>
      </div>
    `;

    const htmlContent = buildBrandedEmailHtml({
      headerTagline: 'THẾ MỚI ĐẬM VỊ • HỆ THỐNG QUẢN TRỊ',
      heroImageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&h=440&q=85',
      heroTitle: 'KIỂM TRA KẾT NỐI EMAIL SMTP',
      heroSubtitle: 'XÁC MINH CẤU HÌNH HỆ THỐNG GỬI THƯ TỰ ĐỘNG',
      heroBadgeTitle: 'TRẠNG THÁI KẾT NỐI MÁY CHỦ',
      heroBadgeValue: 'KẾT NỐI THÀNH CÔNG',
      heroBadgeSub: isDemo ? 'Chế độ: Demo Mail' : 'Chế độ: Google SMTP Trực tiếp',
      greetingTitle: 'Hệ thống gửi thư tự động đã sẵn sàng hoạt động',
      greetingBody: `Hệ thống <strong>Avengers Coffee</strong> đã thiết lập kết nối thành công tới máy chủ gửi thư. Giờ đây, mọi đơn hàng mới từ khách hàng sẽ được tự động gửi thông báo hóa đơn kèm liên kết tra cứu thời gian thực!`,
      greetingEn: 'Your SMTP mail server configuration is verified and fully operational.',
      highlightCode: 'SMTP-VERIFIED',
      ctaText: 'TRUY CẬP TRANG QUẢN TRỊ',
      ctaSubText: 'ADMIN SYSTEM CONSOLE',
      ctaUrl: adminWebUrl,
      ctaColor: 'green',
      detailsTitle: 'THÔNG TIN KIỂM THỬ KẾT NỐI (CONNECTION SPECS):',
      detailsHtml: testDetailsHtml,
      termsTitle: 'HƯỚNG DẪN BẢO MẬT HỆ THỐNG:',
      termsHtml: `
        - Cấu hình SMTP này được lưu trữ an toàn trong cơ sở dữ liệu hệ thống Avengers Coffee.<br/>
        - Để bảo mật, không chia sẻ mật khẩu ứng dụng với bất kỳ ai.<br/>
        - Bạn có thể tùy chỉnh thông số kết nối bất kỳ lúc nào tại màn hình Quản trị viên.
      `,
    });

    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: '[Avengers Coffee] Thử nghiệm cấu hình máy chủ Email SMTP thành công',
      html: htmlContent,
    });

    let previewUrl: string | undefined;
    if (isDemo) {
      previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      this.logger.log(`[SMTP-TEST] Ethereal preview: ${previewUrl}`);
    }

    return {
      success: true,
      message: isDemo ? 'Hệ thống chưa có mật khẩu SMTP thực tế, đã gửi qua máy chủ Demo Ethereal (Xem link bên dưới).' : 'Đã gửi email thử nghiệm thành công tới ' + toEmail,
      previewUrl,
    };
  }

  async sendOrderConfirmationEmail(
    donHang: DonHang,
    chiTiet: ChiTietDonHang[],
    trackingCode?: string,
  ): Promise<{ success: boolean; messageId?: string; previewUrl?: string } | null> {
    try {
      const emailRecipient = (donHang.guest_email || '').trim() ||
        (donHang.ma_nguoi_dung && donHang.ma_nguoi_dung.includes('@') ? donHang.ma_nguoi_dung.trim() : '');

      if (!emailRecipient) {
        this.logger.log(`[sendOrderConfirmationEmail] No recipient email found for order #${donHang.ma_don_hang}, skipping email.`);
        return null;
      }

      const { transporter, fromAddress, isDemo } = await this.createTransporter();

      // Đảm bảo luôn phân giải được mã tra cứu đơn hàng ngắn (AC-XXXXX) cho khách vãng lai
      const resolvedTrackingCode = await this.resolveTrackingCode(donHang, trackingCode);

      const clientBaseUrl = process.env.CUSTOMER_WEB_URL || process.env.WEB_CUSTOMER_BASE_URL || 'http://localhost:5173';
      const trackingUrl = `${clientBaseUrl}/?tab=tracking&code=${encodeURIComponent(resolvedTrackingCode)}`;
      
      const formattedTotal = Number(donHang.tong_tien || 0).toLocaleString('vi-VN') + ' đ';
      const formattedDiscount = Number(donHang.so_tien_giam || 0).toLocaleString('vi-VN') + ' đ';

      const itemsRowsHtml = (chiTiet || []).map((item, idx) => {
        const itemTotal = (Number(item.gia_ban || 0) * Number(item.so_luong || 1)).toLocaleString('vi-VN') + ' đ';
        const toppingsText = Array.isArray(item.toppings) && item.toppings.length
          ? `<div style="font-size: 11.5px; color: #756e68; margin-top: 3px;">Topping: ${escapeEmailHtml(item.toppings.join(', '))}</div>`
          : '';
        const sizeText = item.kich_co ? `<span style="font-size: 11.5px; color: #756e68;">(${escapeEmailHtml(item.kich_co)})</span>` : '';
        const noteText = item.ghi_chu ? `<div style="font-size: 11px; color: #756e68; margin-top: 2px;">Ghi chú: ${escapeEmailHtml(item.ghi_chu)}</div>` : '';

        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px 10px; font-size: 13.5px; color: #1e293b; vertical-align: top;">
              <strong style="color: #262321; font-weight: 600;">${idx + 1}. ${escapeEmailHtml(item.ten_san_pham)}</strong> ${sizeText}
              ${toppingsText}
              ${noteText}
            </td>
            <td style="padding: 12px 10px; font-size: 13.5px; text-align: center; color: #475569; vertical-align: top; font-weight: 700;">x${item.so_luong}</td>
            <td style="padding: 12px 10px; font-size: 13.5px; text-align: right; font-weight: 800; color: #0f172a; vertical-align: top;">${itemTotal}</td>
          </tr>
        `;
      }).join('');

      const paymentMethodMap: Record<string, string> = {
        VNPAY: 'Thanh toán qua VNPAY',
        NGAN_HANG_QR: 'Chuyển khoản QR ngân hàng (VietQR / SePay)',
        THANH_TOAN_KHI_NHAN_HANG: 'Thanh toán tiền mặt khi nhận hàng (COD)',
        VI_DIEN_TU: 'Ví điện tử Avengers',
      };
      const paymentMethodName = paymentMethodMap[donHang.phuong_thuc_thanh_toan] || donHang.phuong_thuc_thanh_toan;

      const deliveryModeMap: Record<string, string> = {
        GIAO_TAN_NOI: 'Giao hàng tận nơi',
        LAY_TAI_QUAN: 'Khách tự lấy tại quán',
        DUNG_TAI_CHO: 'Dùng tại chỗ (Bàn ' + escapeEmailHtml(donHang.ma_ban || '---') + ')',
      };
      const deliveryModeName = deliveryModeMap[donHang.loai_don_hang || ''] || 'Giao hàng tận nơi';

      const orderDetailsHtml = `
        <!-- Order Summary Card -->
        <div style="border-top: 1px solid #e7e2dc; border-bottom: 1px solid #e7e2dc; padding: 14px 0; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 40%;">Mã đơn hàng:</td>
              <td style="padding: 7px 0; text-align: right; color: #6f1825; font-weight: 600; font-size: 14px;">#${escapeEmailHtml(donHang.ma_don_hang)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b; font-weight: 600;">Mã tra cứu đơn hàng:</td>
              <td style="padding: 7px 0; text-align: right;">
                <span style="display: inline-block; background-color: #ecfdf5; color: #047857; font-family: 'Plus Jakarta Sans', monospace; font-weight: 900; font-size: 15px; padding: 4px 12px; border-radius: 8px; border: 1px solid #a7f3d0; letter-spacing: 1.2px;">
                  ${escapeEmailHtml(resolvedTrackingCode)}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Thời gian đặt:</td>
              <td style="padding: 7px 0; text-align: right; color: #1e293b; font-weight: 600;">${new Date(donHang.ngay_tao || Date.now()).toLocaleString('vi-VN')}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Hình thức nhận:</td>
              <td style="padding: 7px 0; text-align: right; color: #059669; font-weight: 800;">${deliveryModeName}</td>
            </tr>
            ${donHang.dia_chi_giao_hang && donHang.loai_don_hang === 'GIAO_TAN_NOI' ? `
            <tr>
              <td style="padding: 7px 0; color: #64748b; vertical-align: top;">Địa chỉ giao hàng:</td>
              <td style="padding: 7px 0; text-align: right; color: #262321; max-width: 290px; line-height: 1.4;">${escapeEmailHtml(donHang.dia_chi_giao_hang)}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Phương thức thanh toán:</td>
              <td style="padding: 7px 0; text-align: right; color: #1e293b; font-weight: 600;">${paymentMethodName}</td>
            </tr>
          </table>
        </div>

        <!-- Product Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px; border: 1px solid #e7e2dc;">
          <thead>
            <tr style="background-color: #faf9f6; color: #756e68; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.8px;">
              <th style="padding: 10px 10px; text-align: left;">Món</th>
              <th style="padding: 10px 10px; text-align: center; width: 50px;">SL</th>
              <th style="padding: 10px 10px; text-align: right; width: 105px;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
          <tfoot>
            ${Number(donHang.so_tien_giam || 0) > 0 ? `
            <tr>
              <td colspan="2" style="padding: 10px; text-align: right; font-size: 12.5px; color: #64748b; border-top: 1px solid #e2e8f0;">Giảm giá Voucher:</td>
              <td style="padding: 10px; text-align: right; font-size: 12.5px; font-weight: 700; color: #16a34a; border-top: 1px solid #e2e8f0;">-${formattedDiscount}</td>
            </tr>
            ` : ''}
            <tr style="background-color: #faf9f6;">
              <td colspan="2" style="padding: 12px 10px; text-align: right; font-size: 14.5px; font-weight: 800; color: #80071c; border-top: 2px solid #e2e8f0;">TỔNG THANH TOÁN:</td>
              <td style="padding: 12px 10px; text-align: right; font-size: 17px; font-weight: 900; color: #b22830; border-top: 2px solid #e2e8f0;">${formattedTotal}</td>
            </tr>
          </tfoot>
        </table>
      `;

      const termsHtml = 'Vui lòng kiểm tra món và địa chỉ nhận hàng trong phần chi tiết đơn.';

      const htmlContent = buildBrandedEmailHtml({
        heroTitle: 'Đơn hàng đã được ghi nhận',
        heroSubtitle: 'Cảm ơn bạn đã đặt món tại Avengers Coffee.',
        heroBadgeTitle: 'Tổng thanh toán',
        heroBadgeValue: formattedTotal,
        heroBadgeSub: `Mã đơn: #${donHang.ma_don_hang} • Hình thức: ${deliveryModeName}`,
        greetingTitle: `Xin chào ${donHang.ten_khach_hang || 'bạn'},`,
        greetingBody: `Đơn hàng <strong>#${escapeEmailHtml(donHang.ma_don_hang)}</strong> đã được ghi nhận. Chúng tôi sẽ thông báo khi trạng thái thay đổi.`,
        ctaText: 'Theo dõi đơn hàng',
        ctaUrl: trackingUrl,
        detailsTitle: 'Chi tiết đơn hàng',
        detailsHtml: orderDetailsHtml,
        termsHtml: termsHtml,
      });

      const info = await transporter.sendMail({
        from: fromAddress,
        to: emailRecipient,
        subject: `[Avengers Coffee] Xác nhận đơn hàng #${donHang.ma_don_hang} thành công - ${formattedTotal}`,
        html: htmlContent,
      });

      let previewUrl: string | undefined;
      if (isDemo) {
        previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
        this.logger.log(`[ORDER EMAIL ETHEREAL] Preview: ${previewUrl}`);
      }

      this.logger.log(`[ORDER EMAIL SENT] Successfully sent order confirmation for #${donHang.ma_don_hang} to ${emailRecipient}`);
      return {
        success: true,
        messageId: info.messageId,
        previewUrl,
      };
    } catch (err) {
      this.logger.error(`[ORDER EMAIL ERROR] Failed to send order confirmation email: ${err.message}`, err.stack);
      return null;
    }
  }

  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from_name?: string;
    from_email?: string;
  }): Promise<{ success: boolean; messageId?: string; previewUrl?: string }> {
    const { to, subject, html, text, from_name, from_email } = options;
    if (!to || !to.includes('@')) {
      throw new Error('Địa chỉ email người nhận không hợp lệ.');
    }

    const customConfig = (from_name || from_email) ? {
      from_name: from_name?.trim(),
      from_email: from_email?.trim(),
    } : undefined;

    const { transporter, fromAddress, isDemo } = await this.createTransporter(customConfig);

    const info = await transporter.sendMail({
      from: fromAddress,
      to: to.trim(),
      subject,
      text: text || undefined,
      html,
    });

    let previewUrl: string | undefined;
    if (isDemo) {
      previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      this.logger.log(`[SMTP-DEMO] Preview for ${to}: ${previewUrl}`);
    }

    this.logger.log(`[SMTP-SEND] Sent "${subject}" to ${to} (MessageId: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId,
      previewUrl,
    };
  }

  async sendOrderStatusUpdateEmail(
    donHang: DonHang,
    newStatus: string,
    note?: string,
  ): Promise<{ success: boolean; messageId?: string; previewUrl?: string } | null> {
    try {
      const emailRecipient = (donHang.guest_email || '').trim() ||
        (donHang.ma_nguoi_dung && donHang.ma_nguoi_dung.includes('@') ? donHang.ma_nguoi_dung.trim() : '');

      if (!emailRecipient) {
        return null;
      }

      // Đảm bảo luôn lấy được mã tra cứu đơn hàng cho khách theo dõi
      const resolvedTrackingCode = await this.resolveTrackingCode(donHang);

      const clientBaseUrl = process.env.CUSTOMER_WEB_URL || process.env.WEB_CUSTOMER_BASE_URL || 'http://localhost:5173';
      const trackingUrl = `${clientBaseUrl}/?tab=tracking&code=${encodeURIComponent(resolvedTrackingCode)}`;
      const formattedTotal = Number(donHang.tong_tien || 0).toLocaleString('vi-VN') + ' đ';

      let heroTitle = 'CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG';
      let heroSubtitle = 'TIẾN TRÌNH ĐƠN HÀNG CỦA BẠN TẠI AVENGERS COFFEE';
      let badgeTitle = 'TRẠNG THÁI HIỆN TẠI';
      let badgeValue = newStatus;
      let greetingTitle = `Kính gửi ${donHang.ten_khach_hang || 'Quý khách'},`;
      let greetingBody = `Đơn hàng #${donHang.ma_don_hang} của bạn đã được cập nhật trạng thái mới.`;
      let ctaColor: 'green' | 'blue' | 'red' = 'blue';

      switch (newStatus) {
        case 'DA_XAC_NHAN':
          heroTitle = 'ĐƠN HÀNG ĐÃ ĐƯỢC XÁC NHẬN';
          heroSubtitle = 'BARISTA ĐANG BẮT ĐẦU CHUẨN BỊ MÓN';
          badgeValue = 'ĐÃ XÁC NHẬN';
          ctaColor = 'blue';
          greetingBody = `Đơn hàng <strong>#${escapeEmailHtml(donHang.ma_don_hang)}</strong> đã được xác nhận và sẽ sớm được chuẩn bị.`;
          break;
        case 'DANG_CHUAN_BI':
          heroTitle = 'ĐỒ UỐNG ĐANG ĐƯỢC PHA CHẾ';
          heroSubtitle = 'TỪNG LY CÀ PHÊ ĐẬM VỊ ĐANG DẦN HOÀN THIỆN';
          badgeValue = 'ĐANG PHA CHẾ';
          ctaColor = 'blue';
          greetingBody = `Đơn hàng <strong>#${escapeEmailHtml(donHang.ma_don_hang)}</strong> đang được chuẩn bị.`;
          break;
        case 'DANG_GIAO':
          heroTitle = 'ĐƠN HÀNG ĐANG TRÊN ĐƯỜNG GIAO';
          heroSubtitle = 'SHIPPER ĐANG TỐC HÀNH MANG ĐỒ UỐNG ĐẾN BẠN';
          badgeValue = 'ĐANG GIAO HÀNG';
          ctaColor = 'blue';
          greetingBody = `Đơn hàng <strong>#${escapeEmailHtml(donHang.ma_don_hang)}</strong> đang trên đường giao đến bạn. Vui lòng giữ liên lạc để nhận hàng.`;
          break;
        case 'HOAN_THANH':
          heroTitle = 'ĐƠN HÀNG ĐÃ GIAO THÀNH CÔNG';
          heroSubtitle = 'CẢM ƠN BẠN ĐÃ LỰA CHỌN AVENGERS COFFEE';
          badgeValue = 'HOÀN TẤT GIAO HÀNG';
          ctaColor = 'green';
          greetingBody = `Đơn hàng <strong>#${escapeEmailHtml(donHang.ma_don_hang)}</strong> đã được giao thành công. Cảm ơn bạn.`;
          break;
        case 'DA_HUY':
          heroTitle = 'THÔNG BÁO HỦY ĐƠN HÀNG';
          heroSubtitle = 'ĐƠN HÀNG ĐÃ ĐƯỢC HỦY THEO YÊU CẦU';
          badgeValue = 'ĐÃ HỦY ĐƠN';
          ctaColor = 'red';
          greetingBody = `Đơn hàng <strong>#${escapeEmailHtml(donHang.ma_don_hang)}</strong> đã được hủy.${note ? ` Lý do: <strong>${escapeEmailHtml(note)}</strong>.` : ''}`;
          break;
      }

      const statusDetailsHtml = `
        <div style="border-top: 1px solid #e7e2dc; border-bottom: 1px solid #e7e2dc; padding: 14px 0; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 40%;">Mã đơn hàng:</td>
              <td style="padding: 7px 0; text-align: right; color: #6f1825; font-weight: 600; font-size: 14px;">#${escapeEmailHtml(donHang.ma_don_hang)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b; font-weight: 600;">Mã tra cứu đơn hàng:</td>
              <td style="padding: 7px 0; text-align: right;">
                <span style="display: inline-block; background-color: #ecfdf5; color: #047857; font-family: 'Plus Jakarta Sans', monospace; font-weight: 900; font-size: 15px; padding: 4px 12px; border-radius: 8px; border: 1px solid #a7f3d0; letter-spacing: 1.2px;">
                  ${escapeEmailHtml(resolvedTrackingCode)}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Thời gian cập nhật:</td>
              <td style="padding: 7px 0; text-align: right; color: #1e293b; font-weight: 600;">${new Date().toLocaleString('vi-VN')}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Tổng thanh toán:</td>
              <td style="padding: 7px 0; text-align: right; color: #0f172a; font-weight: 800;">${formattedTotal}</td>
            </tr>
            ${donHang.dia_chi_giao_hang ? `
            <tr>
              <td style="padding: 7px 0; color: #64748b; vertical-align: top;">Địa chỉ giao:</td>
              <td style="padding: 7px 0; text-align: right; color: #262321; line-height: 1.4;">${escapeEmailHtml(donHang.dia_chi_giao_hang)}</td>
            </tr>
            ` : ''}
            ${note ? `
            <tr>
              <td style="padding: 7px 0; color: #64748b; vertical-align: top;">Ghi chú:</td>
              <td style="padding: 7px 0; text-align: right; color: #6f1825;">${escapeEmailHtml(note)}</td>
            </tr>
            ` : ''}
          </table>
        </div>
      `;

      const htmlContent = buildBrandedEmailHtml({
        headerTagline: 'THẾ MỚI ĐẬM VỊ • HỆ THỐNG ĐƠN HÀNG',
        heroTitle,
        heroSubtitle,
        heroBadgeTitle: badgeTitle,
        heroBadgeValue: badgeValue,
        heroBadgeSub: `Mã đơn: #${donHang.ma_don_hang}`,
        greetingTitle,
        greetingBody,
        ctaText: 'THEO DÕI HÀNH TRÌNH ĐƠN HÀNG',
        ctaSubText: 'LIVE ORDER TRACKING',
        ctaUrl: trackingUrl,
        ctaColor,
        detailsTitle: 'THÔNG TIN CẬP NHẬT ĐƠN HÀNG:',
        detailsHtml: statusDetailsHtml,
      });

      return this.sendMail({
        to: emailRecipient,
        subject: `[Avengers Coffee] #${donHang.ma_don_hang} - ${badgeValue}`,
        html: htmlContent,
      });
    } catch (err) {
      this.logger.error(`[sendOrderStatusUpdateEmail] Error: ${err.message}`, err.stack);
      return null;
    }
  }
}

