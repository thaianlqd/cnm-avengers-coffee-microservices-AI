import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { GiftCard } from './entities/gift-card.entity';
import { PurchaseGiftCardDto, RedeemGiftCardDto } from './dto/gift-card.dto';
import { GiftCardTheme } from './entities/gift-card-theme.entity';
import { CustomerWalletService } from '../customer-wallet/customer-wallet.service';
import { buildBrandedEmailHtml, escapeEmailHtml, SmtpService } from '../smtp/smtp.service';
@Injectable()
export class GiftCardService {
  private readonly logger = new Logger(GiftCardService.name);

  constructor(
    @InjectRepository(GiftCard)
    private readonly giftCardRepo: Repository<GiftCard>,
    @InjectRepository(GiftCardTheme)
    private readonly themeRepo: Repository<GiftCardTheme>,
    private readonly walletService: CustomerWalletService,
    private readonly smtpService: SmtpService,
  ) {}

  async onModuleInit() {
    if (process.env.K8S_DEMO_READ_ONLY === 'true') return;
    const count = await this.themeRepo.count();
    if (count === 0) {
      this.logger.log('Seeding initial Gift Card Themes...');
      const themes = [
        // 2025 Collections (originally 2024)
        { id: 'chill_1', name: 'Chill Hè Vàng', color: '#ffd600', image_url: 'https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/GC%202%408x.png', collection_name: 'Chill Hè 2025' },
        { id: 'chill_2', name: 'Chill Hè Xanh', color: '#00bcd4', image_url: 'https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/GC%203%408x.png', collection_name: 'Chill Hè 2025' },
        { id: 'chill_3', name: 'Chill Hè Hồng', color: '#e91e63', image_url: 'https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/GC%201_1%408x.png', collection_name: 'Chill Hè 2025' },
        { id: 'tet_2025', name: 'Tết Mã Vàng', color: '#d32f2f', image_url: 'https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO-7721-FESTIVE-CARD-2024-02-approved-front.png', collection_name: 'Tết Mã 2025' },
        
        // 2026 Collections (originally 2023)
        { id: 'festive_1', name: 'Festive Đỏ', color: '#c62828', image_url: 'https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FESTIVE%20FA_HCO%207721_%20GIFT%20CARD%20THANK%20YOU-01.png', collection_name: 'Festive 2026' },
        { id: 'festive_2', name: 'Festive Xanh', color: '#2e7d32', image_url: 'https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FESTIVE%20FA_HCO%207721_%20GIFT%20CARD%20THANK%20YOU-02.png', collection_name: 'Festive 2026' },
        { id: 'thankyou_1', name: 'Thank You Fan', color: '#795548', image_url: 'https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FA-01.png', collection_name: 'Thank You 2026' },
        { id: 'thankyou_2', name: 'Thank You Trắng', color: '#f5f5f5', image_url: 'https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FA-02.png', collection_name: 'Thank You 2026' },
        { id: 'thankyou_3', name: 'Thank You Nâu', color: '#5d4037', image_url: 'https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FA-03.png', collection_name: 'Thank You 2026' },
      ];
      await this.themeRepo.save(themes);
      this.logger.log(`Seeded ${themes.length} themes.`);
    }
  }

  async getThemes() {
    return this.themeRepo.find();
  }

  private generateCode(): string {
    return randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g)!.join('-');
  }

  private normalizeCode(code: string) {
    const compact = String(code || '').toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z0-9]{12,16}$/.test(compact)) {
      throw new BadRequestException({ code: 'GIFT_CARD_INVALID', message: 'Mã thẻ phải gồm 12–16 ký tự chữ hoặc số' });
    }
    return compact.match(/.{1,4}/g)!.join('-');
  }

  private assertRedeemable(card: GiftCard | null, customerId: string) {
    if (!card) throw new BadRequestException({ code: 'GIFT_CARD_NOT_FOUND', message: 'Mã thẻ không tồn tại' });
    if (card.status === 'REDEEMED' || Number(card.current_balance) <= 0 ||
        (card.redeemed_by && card.redeemed_by !== customerId)) {
      throw new BadRequestException({ code: 'GIFT_CARD_USED', message: 'Thẻ quà tặng đã được sử dụng' });
    }
    if (card.status === 'EXPIRED' || (card.expires_at && new Date(card.expires_at).getTime() <= Date.now())) {
      throw new BadRequestException({ code: 'GIFT_CARD_EXPIRED', message: 'Thẻ quà tặng đã hết hạn' });
    }
    if (!['ACTIVE', 'CLAIMED'].includes(card.status)) {
      throw new BadRequestException({ code: 'GIFT_CARD_INVALID', message: 'Thẻ quà tặng không hợp lệ' });
    }
  }

  async validateGiftCard(code: string, customerId: string) {
    const card = await this.giftCardRepo.findOne({ where: { code: this.normalizeCode(code) } });
    this.assertRedeemable(card, customerId);
    // A code preview never exposes the sender or recipient's personal details.
    return { success: true, data: { code: card!.code, value: Number(card!.value),
      current_balance: Number(card!.current_balance), expires_at: card!.expires_at || null } };
  }

  async purchaseGiftCard(dto: PurchaseGiftCardDto) {
    if (typeof dto.sender_name !== 'string' || !dto.sender_name.trim() || dto.sender_name.length > 255
        || typeof dto.receiver_email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.receiver_email)
        || dto.receiver_email.length > 255 || (dto.message != null && (typeof dto.message !== 'string' || dto.message.length > 2000))) {
      throw new BadRequestException('Thông tin người gửi hoặc người nhận không hợp lệ');
    }
    if (!Number.isSafeInteger(dto.value) || dto.value < 10000 || dto.value > 5000000) {
      throw new BadRequestException('Mệnh giá phải từ 10.000đ đến 5.000.000đ');
    }
    // Issue funded cards only: wallet debit and card creation commit together.
    const card = this.giftCardRepo.create({
      code: this.generateCode(),
      value: dto.value,
      current_balance: dto.value,
      sender_id: dto.sender_id,
      sender_name: dto.sender_name,
      receiver_email: dto.receiver_email,
      receiver_phone: dto.receiver_phone,
      receiver_name: dto.receiver_name,
      message: dto.message,
      theme: dto.theme || 'default',
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    
    await this.walletService.withWalletPayment(dto.sender_id, dto.value, `GIFT_PURCHASE:${card.code}`,
      async manager => manager.getRepository(GiftCard).save(card));

    // 2. Gửi Email xịn xò
    let emailUrl: string | null | boolean = null;
    try {
      emailUrl = await this.sendGiftCardEmail(card);
    } catch (err) {
      this.logger.error('Failed to send email:', err);
    }

    // 3. Tích hợp điểm Loyalty (Giả lập gọi sang Identity Service hoặc bắn event)
    return {
      success: true,
      message: 'Mua thẻ quà tặng thành công',
      data: card,
      email_status: emailUrl ? 'SENT' : 'NOT_SENT',
    };
  }

  async redeemGiftCard(dto: RedeemGiftCardDto) {
    const code = this.normalizeCode(dto.code);
    return this.giftCardRepo.manager.transaction(async manager => {
      const repo = manager.getRepository(GiftCard);
      const card = await repo.findOne({ where: { code }, lock: { mode: 'pessimistic_write' } });
      this.assertRedeemable(card, dto.customer_id);
      const amount = Number(card!.current_balance);
      const credit = await this.walletService.creditGiftCard(dto.customer_id, amount, card!.code, manager);
      card!.status = 'REDEEMED';
      card!.current_balance = 0;
      card!.redeemed_by = dto.customer_id;
      card!.redeemed_at = new Date();
      await repo.save(card!);
      return { success: true, message: 'Đã nạp thẻ quà tặng vào ví', balance_added: amount,
        code: card!.code, ...credit };
    });
  }

  async getMyGiftCards(customerId: string) {
    // Join with GiftCardTheme manually using QueryBuilder
    const cards = await this.giftCardRepo
      .createQueryBuilder('card')
      .leftJoinAndMapOne('card.theme_detail', GiftCardTheme, 'theme', 'theme.id = card.theme')
      .where('card.redeemed_by = :customerId', { customerId })
      .orderBy('card.redeemed_at', 'DESC')
      .getMany();

    return cards;
  }

  async transferGiftCardBalance(giftCardId: string, customerId: string) {
    const card = await this.giftCardRepo.findOne({ where: { id: giftCardId, redeemed_by: customerId } });
    if (!card) throw new BadRequestException('Không tìm thấy thẻ trong bộ sưu tập của bạn');
    return this.redeemGiftCard({ code: card.code, customer_id: customerId });
  }

  async getGiftCardDetails(code: string, customerId: string) {
    return this.validateGiftCard(code, customerId);
  }

  // Gửi email thẻ quà tặng E-Gift Card đồng bộ từ máy chủ SMTP cấu hình
  private async sendGiftCardEmail(card: GiftCard) {
    try {
      if (!card.receiver_email || !card.receiver_email.includes('@')) {
        this.logger.warn(`No valid receiver email for gift card ${card.code}, skipping.`);
        return null;
      }

      const formattedValue = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(card.value);
      const clientBaseUrl = process.env.CUSTOMER_WEB_URL || process.env.WEB_CUSTOMER_BASE_URL || 'http://localhost:5173';
      const redeemUrl = `${clientBaseUrl}/?tab=wallet&code=${encodeURIComponent(card.code)}`;
      const safeSender = escapeEmailHtml(card.sender_name);
      const giftDetailsHtml = `
        <div style="padding:16px 0;border-top:1px solid #e7e2dc;border-bottom:1px solid #e7e2dc;">
          ${card.message ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4d4843;">“${escapeEmailHtml(card.message)}”</p>` : ''}
          <div style="font-size:11px;color:#756e68;letter-spacing:1px;">MÃ THẺ QUÀ TẶNG</div>
          <div style="margin-top:6px;font-size:21px;font-weight:600;letter-spacing:2px;color:#6f1825;">${escapeEmailHtml(card.code)}</div>
        </div>`;
      const termsHtml = `Mã thẻ được nạp vào ví một lần. Hạn sử dụng: ${card.expires_at ? new Date(card.expires_at).toLocaleDateString('vi-VN') : 'Không giới hạn'}. Số dư ví có thể dùng cho nhiều đơn hàng.`;

      const htmlContent = buildBrandedEmailHtml({
        headerTagline: 'THẾ MỚI ĐẬM VỊ • MÓN QUÀ ĐẶC QUYỀN',
        heroTitle: 'BẠN NHẬN ĐƯỢC E-GIFT CARD ĐẶC QUYỀN',
        heroSubtitle: `MÓN QUÀ YÊU THƯƠNG TỪ ${String(card.sender_name || '').toUpperCase()}`,
        heroBadgeTitle: 'GIÁ TRỊ THẺ QUÀ TẶNG',
        heroBadgeValue: formattedValue,
        heroBadgeSub: `Mã thẻ: ${card.code} • Người gửi: ${card.sender_name}`,
        greetingTitle: `Chúc mừng ${card.receiver_name || 'bạn'},`,
        greetingBody: `Bạn vừa nhận được thẻ quà tặng trị giá <strong>${formattedValue}</strong> từ <strong>${safeSender}</strong>.`,
        greetingEn: `You have received a special Gift Card worth ${formattedValue} from ${card.sender_name}.`,
        highlightCode: card.code,
        ctaText: 'NẠP VÍ & SỬ DỤNG NGAY',
        ctaSubText: 'REDEEM GIFT CARD NOW',
        ctaUrl: redeemUrl,
        ctaColor: 'green',
        detailsTitle: 'THÔNG TIN THẺ QUÀ TẶNG (GIFT CARD DETAILS):',
        detailsHtml: giftDetailsHtml,
        termsTitle: 'ĐIỀU KIỆN & HƯỚNG DẪN SỬ DỤNG:',
        termsHtml: termsHtml,
      });

      const res = await this.smtpService.sendMail({
        to: card.receiver_email,
        subject: `[Avengers Coffee] Quà tặng ${formattedValue} từ ${card.sender_name}`,
        html: htmlContent,
      });

      this.logger.log(`Gift Card email sent successfully to ${card.receiver_email}`);
      return res.previewUrl || true;
    } catch (err) {
      this.logger.error('Email error:', err);
      return null;
    }
  }
}
