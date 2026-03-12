import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationType, ThongBao } from './entities/thong-bao.entity';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(ThongBao)
    private readonly thongBaoRepo: Repository<ThongBao>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async taoThongBao(payload: {
    ma_nguoi_dung: string;
    tieu_de: string;
    noi_dung: string;
    loai?: NotificationType;
    du_lieu?: Record<string, any> | null;
  }) {
    const thongBao = this.thongBaoRepo.create({
      ma_nguoi_dung: payload.ma_nguoi_dung,
      tieu_de: payload.tieu_de,
      noi_dung: payload.noi_dung,
      loai: payload.loai || 'SYSTEM',
      du_lieu: payload.du_lieu || null,
      da_doc: false,
    });
    const saved = await this.thongBaoRepo.save(thongBao);
    this.notificationGateway.guiThongBaoTheoNguoiDung(saved.ma_nguoi_dung, saved);
    return saved;
  }

  async layDanhSachThongBao(maNguoiDung: string, options?: { chiLayChuaDoc?: boolean; limit?: number }) {
    const limit = Math.min(Math.max(Number(options?.limit || 20), 1), 100);
    const where = options?.chiLayChuaDoc ? { ma_nguoi_dung: maNguoiDung, da_doc: false } : { ma_nguoi_dung: maNguoiDung };

    const [items, unreadCount] = await Promise.all([
      this.thongBaoRepo.find({ where, order: { ngay_tao: 'DESC' }, take: limit }),
      this.thongBaoRepo.count({ where: { ma_nguoi_dung: maNguoiDung, da_doc: false } }),
    ]);

    return { items, unreadCount };
  }

  async danhDauDaDoc(maNguoiDung: string, notificationId: number) {
    const thongBao = await this.thongBaoRepo.findOne({ where: { id: notificationId, ma_nguoi_dung: maNguoiDung } });
    if (!thongBao) {
      throw new NotFoundException('Khong tim thay thong bao');
    }

    if (!thongBao.da_doc) {
      thongBao.da_doc = true;
      await this.thongBaoRepo.save(thongBao);
    }

    return { success: true };
  }

  async danhDauTatCaDaDoc(maNguoiDung: string) {
    await this.thongBaoRepo.update({ ma_nguoi_dung: maNguoiDung, da_doc: false }, { da_doc: true });
    return { success: true };
  }
}
