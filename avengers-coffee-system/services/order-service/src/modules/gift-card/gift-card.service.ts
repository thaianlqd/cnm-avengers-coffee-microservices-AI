import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GiftCard } from './entities/gift-card.entity';
import { PurchaseGiftCardDto, RedeemGiftCardDto } from './dto/gift-card.dto';
import { GiftCardTheme } from './entities/gift-card-theme.entity';
import { CustomerWalletService } from '../customer-wallet/customer-wallet.service';
import { buildBrandedEmailHtml, SmtpService } from '../smtp/smtp.service';
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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'GIFT-';
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-';
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code; // e.g. GIFT-ABCD-1234
  }

  async purchaseGiftCard(dto: PurchaseGiftCardDto) {
    // 1. Tạo Gift Card
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
    });
    
    await this.giftCardRepo.save(card);

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
      email_url: emailUrl,
      loyalty_points_earned: Math.floor(dto.value / 10000), // Ví dụ: 10k = 1 điểm
    };
  }

  async redeemGiftCard(dto: RedeemGiftCardDto) {
    const card = await this.giftCardRepo.findOne({ where: { code: dto.code } });
    
    if (!card) throw new BadRequestException('Mã thẻ không tồn tại');
    if (card.status === 'REDEEMED' || card.status === 'CLAIMED' || card.redeemed_by) {
      throw new BadRequestException('Thẻ này đã được lưu vào bộ sưu tập của người khác hoặc đã sử dụng');
    }
    if (card.status === 'EXPIRED') throw new BadRequestException('Thẻ đã hết hạn');

    // Lưu thẻ vào bộ sưu tập
    card.status = 'CLAIMED';
    card.redeemed_by = dto.customer_id;
    card.redeemed_at = new Date();
    await this.giftCardRepo.save(card);

    return {
      success: true,
      message: `Đã lưu thẻ ${card.value} VND vào bộ sưu tập thành công`,
      data: card,
    };
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
    if (card.current_balance <= 0) throw new BadRequestException('Thẻ này đã hết số dư');

    const amountToTransfer = Number(card.current_balance);

    // Nạp tiền vào ví
    await this.walletService.topUp(customerId, amountToTransfer);

    // Cập nhật thẻ
    card.current_balance = 0;
    card.status = 'REDEEMED';
    await this.giftCardRepo.save(card);

    return {
      success: true,
      message: `Đã chuyển ${amountToTransfer.toLocaleString()} VND vào ví điện tử`,
      balance_added: amountToTransfer,
    };
  }

  async getGiftCardDetails(code: string) {
    const card = await this.giftCardRepo.findOne({ where: { code } });
    if (!card) throw new BadRequestException('Mã thẻ không tồn tại');
    
    return {
      success: true,
      data: card,
    };
  }

  async deleteGiftCard(id: string) {
    const card = await this.giftCardRepo.findOne({ where: { id } });
    if (!card) {
      throw new BadRequestException('Không tìm thấy thẻ quà tặng');
    }
    await this.giftCardRepo.remove(card);
    return {
      success: true,
      message: 'Đã xóa thẻ quà tặng thành công',
    };
  }

  // Gửi email thẻ quà tặng E-Gift Card đồng bộ từ máy chủ SMTP cấu hình
  private async sendGiftCardEmail(card: GiftCard) {
    try {
      if (!card.receiver_email || !card.receiver_email.includes('@')) {
        this.logger.warn(`No valid receiver email for gift card ${card.code}, skipping.`);
        return null;
      }

      // Tạo HTML template phong cách Avengers Coffee cực xịn
      const formattedValue = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(card.value);
      const clientBaseUrl = process.env.CUSTOMER_WEB_URL || process.env.WEB_CUSTOMER_BASE_URL || 'http://localhost:5173';
      const redeemUrl = `${clientBaseUrl}/?tab=wallet&code=${encodeURIComponent(card.code)}`;

      const giftDetailsHtml = `
        <div style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; text-align: center; margin-bottom: 16px;">
          ${card.message ? `
            <div style="background-color: #ffffff; border-left: 4px solid #b22830; padding: 14px 18px; border-radius: 8px; font-style: italic; color: #475569; font-size: 14px; margin-bottom: 18px; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              "${card.message}"
            </div>
          ` : ''}

          <div style="margin: 12px auto; background: #ffffff; padding: 16px; border-radius: 12px; border: 2px dashed #b22830; display: inline-block;">
            <div style="font-size: 12px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">MÃ THẺ QUÀ TẶNG CỦA BẠN:</div>
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 3px; color: #b22830; font-family: monospace;">${card.code}</div>
            <div style="margin-top: 14px;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${card.code}" style="width: 140px; height: 140px; border-radius: 8px;" alt="QR Code" />
            </div>
          </div>
        </div>
      `;

      const termsHtml = `
        - Thẻ quà tặng có giá trị thanh toán toàn bộ menu tại chuỗi cửa hàng Avengers Coffee.<br/>
        - Sử dụng mã để nạp tiền vào Ví Điện Tử trên website hoặc đưa mã QR cho thu ngân tại quầy.<br/>
        - Thẻ có thể sử dụng nhiều lần cho đến khi hết số dư.
      `;

      const htmlContent = buildBrandedEmailHtml({
        headerTagline: 'THẾ MỚI ĐẬM VỊ • MÓN QUÀ ĐẶC QUYỀN',
        heroTitle: 'BẠN NHẬN ĐƯỢC E-GIFT CARD ĐẶC QUYỀN',
        heroSubtitle: `MÓN QUÀ YÊU THƯƠNG TỪ ${card.sender_name.toUpperCase()}`,
        heroBadgeTitle: 'GIÁ TRỊ THẺ QUÀ TẶNG',
        heroBadgeValue: formattedValue,
        heroBadgeSub: `Mã thẻ: ${card.code} • Người gửi: ${card.sender_name}`,
        greetingTitle: `Chúc mừng ${card.receiver_name || 'bạn'},`,
        greetingBody: `Bạn vừa nhận được một chiếc <strong>E-Gift Card</strong> trị giá <strong>${formattedValue}</strong> từ <strong>${card.sender_name}</strong> gửi tặng qua Avengers Coffee.`,
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
      return err.message || String(err);
    }
  }
}
