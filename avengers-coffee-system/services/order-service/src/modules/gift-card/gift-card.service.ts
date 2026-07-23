import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GiftCard } from './entities/gift-card.entity';
import { PurchaseGiftCardDto, RedeemGiftCardDto } from './dto/gift-card.dto';
import { GiftCardTheme } from './entities/gift-card-theme.entity';
import { CustomerWalletService } from '../customer-wallet/customer-wallet.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class GiftCardService {
  private readonly logger = new Logger(GiftCardService.name);

  constructor(
    @InjectRepository(GiftCard)
    private readonly giftCardRepo: Repository<GiftCard>,
    @InjectRepository(GiftCardTheme)
    private readonly themeRepo: Repository<GiftCardTheme>,
    private readonly walletService: CustomerWalletService,
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

  // Tiện ích gửi mail Ethereal (Miễn phí, không cần cấu hình tài khoản thật) hoặc Mail thật (nếu có cấu hình SMTP)
  private async sendGiftCardEmail(card: GiftCard) {
    try {
      let transporter;
      let isDemo = false;

      if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        // Gửi qua SMTP thật (Gmail, v.v...)
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        this.logger.log('Using REAL SMTP to send email');
      } else {
        // Fallback: Dùng Ethereal để test (nó sẽ cấp cho một link web để xem email đã gửi)
        isDemo = true;
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        this.logger.log('Using Ethereal (Demo) to send email');
      }

      // Tạo HTML template cực xịn
      const formattedValue = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(card.value);
      
      const themeColors = {
        default: '#b22830',
        birthday: '#ff9800',
        anniversary: '#e91e63',
        apology: '#607d8b'
      };
      const mainColor = themeColors[card.theme] || themeColors.default;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
          <div style="background-color: ${mainColor}; color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">🎁 Avengers Coffee Gift Card</h1>
          </div>
          <div style="padding: 40px 30px; background-color: #fafafa; text-align: center;">
            <p style="font-size: 18px; color: #333;">Chào <strong>${card.receiver_name || 'bạn'}</strong>,</p>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">Bạn vừa nhận được một thẻ quà tặng trị giá <strong style="color: ${mainColor}; font-size: 20px;">${formattedValue}</strong> từ <strong>${card.sender_name}</strong>!</p>
            
            ${card.message ? `<div style="margin: 30px 0; padding: 20px; background-color: white; border-left: 4px solid ${mainColor}; font-style: italic; color: #666; font-size: 16px;">"${card.message}"</div>` : ''}
            
            <div style="margin: 40px auto; background: white; padding: 20px; border-radius: 15px; border: 2px dashed ${mainColor}; display: inline-block;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #888;">Mã thẻ của bạn:</p>
              <h2 style="margin: 0; font-size: 32px; letter-spacing: 3px; color: #333;">${card.code}</h2>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${card.code}" style="margin-top: 20px; width: 150px; height: 150px;" alt="QR Code" />
            </div>

            <p style="font-size: 14px; color: #777;">Sử dụng mã này trên ứng dụng Avengers Coffee để nạp vào Ví Điện Tử hoặc mang mã QR này đến quầy thu ngân để thanh toán trực tiếp.</p>
          </div>
          <div style="background-color: #333; color: #aaa; text-align: center; padding: 15px; font-size: 12px;">
            © 2026 Avengers Coffee. All rights reserved.
          </div>
        </div>
      `;

      const info = await transporter.sendMail({
        from: `"Avengers Coffee" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@avengerscoffee.com'}>`,
        to: card.receiver_email,
        subject: `🎁 Quà tặng ${formattedValue} từ ${card.sender_name}`,
        html: htmlContent,
      });

      if (isDemo) {
        const url = nodemailer.getTestMessageUrl(info);
        this.logger.log(`Demo Email sent: ${url}`);
        return url;
      } else {
        this.logger.log(`Real Email sent to: ${card.receiver_email}`);
        return true; // Sent real email successfully, no preview URL
      }
    } catch (err) {
      this.logger.error('Email error:', err);
      return err.message || String(err);
    }
  }
}
