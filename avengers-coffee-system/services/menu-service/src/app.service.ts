import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { SanPham } from './modules/menu/san-pham.entity';
import { DanhMuc } from './modules/menu/danh-muc.entity';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(SanPham) private spRepo: Repository<SanPham>,
    @InjectRepository(DanhMuc) private dmRepo: Repository<DanhMuc>,
  ) {}

  getHello(): string {
    return 'Menu service is running';
  }

  // Lấy danh mục thật từ DB
  async getCategories() {
    const categories = await this.dmRepo.find();
    return categories.map(cat => ({
      code: cat.ma_danh_muc.toString(),
      label: cat.ten_danh_muc
    }));
  }

  // Lấy sản phẩm thật từ DB kèm logic lọc (search, category, sort)
  async getMenuItems(params: { search?: string; category?: string; sort?: string }) {
    const { search, category, sort } = params;

    const queryBuilder = this.spRepo.createQueryBuilder('san_pham')
      .leftJoinAndSelect('san_pham.danhMuc', 'danh_muc');

    if (search) {
      queryBuilder.andWhere('san_pham.ten_san_pham ILIKE :search', { search: `%${search}%` });
    }

    if (category && category !== 'all') {
      queryBuilder.andWhere('danh_muc.ma_danh_muc = :category', { category });
    }

    if (sort === 'price_asc') {
      queryBuilder.orderBy('san_pham.gia_ban', 'ASC');
    } else if (sort === 'price_desc') {
      queryBuilder.orderBy('san_pham.gia_ban', 'DESC');
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      total,
      items: items.map(item => ({
        id: item.ma_san_pham.toString(),
        name: item.ten_san_pham,
        category: item.danhMuc?.ten_danh_muc,
        price: Number(item.gia_ban),
        image: item.hinh_anh_url,
        dang_ban: Boolean(item.trang_thai),
        status: item.trang_thai ? 'available' : 'sold_out'
      })),
    };
  }

  // Gợi ý sản phẩm thật
  async getSuggestions(userId: string) {
    const items = await this.spRepo.find({ where: { trang_thai: true }, take: 3 });
    return {
      userId,
      suggestions: items
    };
  }

  async updateMenuItemStatus(itemId: number, dangBan: boolean) {
    const item = await this.spRepo.findOne({ where: { ma_san_pham: itemId } });
    if (!item) {
      throw new NotFoundException('Khong tim thay mon trong menu');
    }

    item.trang_thai = dangBan;
    const saved = await this.spRepo.save(item);

    return {
      message: dangBan ? 'Mo ban lai mon thanh cong' : 'Tam ngung ban mon thanh cong',
      item: {
        id: saved.ma_san_pham.toString(),
        dang_ban: Boolean(saved.trang_thai),
        status: saved.trang_thai ? 'available' : 'sold_out',
      },
    };
  }
}