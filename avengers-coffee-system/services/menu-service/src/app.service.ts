import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
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

  private formatMenuItem(item: SanPham) {
    return {
      id: item.ma_san_pham.toString(),
      name: item.ten_san_pham,
      category: item.danhMuc?.ten_danh_muc,
      category_code: item.danhMuc?.ma_danh_muc,
      price: Number(item.gia_ban),
      image: item.hinh_anh_url,
      description: item.mo_ta,
      dang_ban: Boolean(item.trang_thai),
      status: item.trang_thai ? 'available' : 'sold_out',
    };
  }

  private slugifyProductName(value: string) {
    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    return normalized || 'san-pham';
  }

  private getProductUploadDirectory() {
    return join(process.cwd(), 'uploads', 'products');
  }

  private async generateUniqueImageFilename(baseSlug: string, extension: string) {
    const uploadDir = this.getProductUploadDirectory();
    let attempt = 1;

    while (attempt < 5000) {
      const suffix = attempt === 1 ? '' : `-${attempt}`;
      const candidate = `${baseSlug}${suffix}${extension}`;
      const absolutePath = join(uploadDir, candidate);

      try {
        await fs.access(absolutePath);
        attempt += 1;
      } catch {
        return candidate;
      }
    }

    throw new BadRequestException('Khong the tao ten file anh hop le');
  }

  private toManagedImageFilename(imageUrl?: string | null) {
    const value = String(imageUrl || '').trim();
    if (!value.startsWith('/images/products/')) {
      return null;
    }

    const filename = value.replace('/images/products/', '').trim();
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return null;
    }

    return filename;
  }

  private async removeImageIfUnused(imageUrl?: string | null, ignoreProductId?: number) {
    const filename = this.toManagedImageFilename(imageUrl);
    if (!filename) return;

    const query = this.spRepo.createQueryBuilder('sp').where('sp.hinh_anh_url = :imageUrl', { imageUrl });
    if (ignoreProductId) {
      query.andWhere('sp.ma_san_pham != :ignoreProductId', { ignoreProductId });
    }

    const stillUsedCount = await query.getCount();
    if (stillUsedCount > 0) return;

    const absolutePath = join(this.getProductUploadDirectory(), filename);
    try {
      await fs.unlink(absolutePath);
    } catch {
      // Ignore remove errors so CRUD flow is not blocked by missing file.
    }
  }

  private normalizeProductImagePath(raw: string) {
    const value = String(raw || '').trim();
    if (!value) return null;

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (value.startsWith('/images/products/')) {
      return value;
    }

    const filename = value.split('/').pop() || value;
    if (!filename) return null;
    return `/images/products/${filename}`;
  }

  async uploadProductImage(file?: any, productName?: string) {
    if (!file) {
      throw new BadRequestException('Vui long chon file anh');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Chi ho tro file JPG, PNG hoac WEBP');
    }

    const uploadDir = this.getProductUploadDirectory();
    await fs.mkdir(uploadDir, { recursive: true });

    const extension = extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeBaseName = this.slugifyProductName(productName || file.originalname.replace(/\.[^.]+$/, ''));
    const filename = await this.generateUniqueImageFilename(safeBaseName, extension);
    const absolutePath = join(uploadDir, filename);

    await fs.writeFile(absolutePath, file.buffer);

    return {
      message: 'Tai anh thanh cong',
      file_name: filename,
      file_url: `/images/products/${filename}`,
      stored_path: absolutePath,
    };
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
      items: items.map((item) => this.formatMenuItem(item)),
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

  async createMenuItem(payload: {
    name?: string;
    category_code?: string | number;
    price?: number;
    image?: string;
    description?: string;
    dang_ban?: boolean;
  }) {
    const name = String(payload.name || '').trim();
    const categoryCode = Number(payload.category_code);
    const price = Number(payload.price);

    if (!name || Number.isNaN(categoryCode) || Number.isNaN(price) || price < 0) {
      throw new BadRequestException('Du lieu mon moi khong hop le');
    }

    const category = await this.dmRepo.findOne({ where: { ma_danh_muc: categoryCode } });
    if (!category) {
      throw new NotFoundException('Khong tim thay danh muc');
    }

    const created = new SanPham();
    created.ten_san_pham = name;
    created.gia_ban = price;
    created.mo_ta = payload.description?.trim() || null;
    created.hinh_anh_url = this.normalizeProductImagePath(payload.image || '');
    created.trang_thai = payload.dang_ban !== undefined ? Boolean(payload.dang_ban) : true;
    created.danhMuc = category;

    const saved = await this.spRepo.save(created);
    const item = await this.spRepo.findOne({ where: { ma_san_pham: saved.ma_san_pham }, relations: ['danhMuc'] });
    return {
      message: 'Them mon moi thanh cong',
      item: item ? this.formatMenuItem(item) : null,
    };
  }

  async updateMenuItem(
    itemId: number,
    payload: {
      name?: string;
      category_code?: string | number;
      price?: number;
      image?: string;
      description?: string;
      dang_ban?: boolean;
    },
  ) {
    const item = await this.spRepo.findOne({ where: { ma_san_pham: itemId }, relations: ['danhMuc'] });
    if (!item) {
      throw new NotFoundException('Khong tim thay mon trong menu');
    }

    if (payload.name !== undefined) {
      const name = String(payload.name || '').trim();
      if (!name) throw new BadRequestException('Ten mon khong hop le');
      item.ten_san_pham = name;
    }

    if (payload.price !== undefined) {
      const price = Number(payload.price);
      if (Number.isNaN(price) || price < 0) throw new BadRequestException('Gia ban khong hop le');
      item.gia_ban = price;
    }

    if (payload.description !== undefined) {
      item.mo_ta = payload.description?.trim() || null;
    }

    if (payload.image !== undefined) {
      const nextImage = this.normalizeProductImagePath(payload.image || '');
      const previousImage = item.hinh_anh_url;
      item.hinh_anh_url = nextImage;

      if (previousImage && previousImage !== nextImage) {
        await this.removeImageIfUnused(previousImage, itemId);
      }
    }

    if (payload.dang_ban !== undefined) {
      item.trang_thai = Boolean(payload.dang_ban);
    }

    if (payload.category_code !== undefined) {
      const categoryCode = Number(payload.category_code);
      if (Number.isNaN(categoryCode)) throw new BadRequestException('Danh muc khong hop le');
      const category = await this.dmRepo.findOne({ where: { ma_danh_muc: categoryCode } });
      if (!category) throw new NotFoundException('Khong tim thay danh muc');
      item.danhMuc = category;
    }

    await this.spRepo.save(item);
    const saved = await this.spRepo.findOne({ where: { ma_san_pham: itemId }, relations: ['danhMuc'] });

    return {
      message: 'Cap nhat mon thanh cong',
      item: saved ? this.formatMenuItem(saved) : null,
    };
  }

  async deleteMenuItem(itemId: number) {
    const item = await this.spRepo.findOne({ where: { ma_san_pham: itemId } });
    if (!item) {
      throw new NotFoundException('Khong tim thay mon trong menu');
    }

    const deletedImage = item.hinh_anh_url;
    await this.spRepo.remove(item);
    await this.removeImageIfUnused(deletedImage, itemId);
    return { message: 'Xoa mon thanh cong', id: itemId };
  }
}