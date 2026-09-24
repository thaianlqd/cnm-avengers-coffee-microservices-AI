import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CartItem } from './cart.entity';
import { VoucherService } from '../voucher/voucher.service';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem) private cartRepo: Repository<CartItem>,
    private readonly dataSource: DataSource,
    private readonly voucherService: VoucherService,
  ) {}

  private normalizeValue(value: unknown) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .toLowerCase()
      .trim();
  }

  private async resolveAuthoritativeProduct(dto: any) {
    const productId = Number(dto?.ma_san_pham);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('Ma san pham khong hop le');
    }

    const rows = await this.dataSource.query(
      `SELECT ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, trang_thai
       FROM menu.san_pham WHERE ma_san_pham = $1 LIMIT 1`,
      [productId],
    );
    const product = rows?.[0];
    if (!product || product.trang_thai === false) {
      throw new NotFoundException('San pham khong ton tai hoac dang ngung ban');
    }

    const variantRows = await this.dataSource.query(
      `SELECT tt.ten_thuoc_tinh, bt.gia_tri, bt.phu_thu
         FROM menu.bien_the_san_pham bt
         JOIN menu.thuoc_tinh tt ON tt.ma_thuoc_tinh = bt.ma_thuoc_tinh
        WHERE bt.ma_san_pham = $1`,
      [productId],
    );

    const selectedValues: unknown[] = [...(dto?.toppings || []), dto?.loai_sua];
    for (const value of Object.values(dto?.custom_attributes || {})) {
      if (Array.isArray(value)) selectedValues.push(...value);
      else selectedValues.push(value);
    }
    const selectedExtras = new Set(selectedValues.map((value) => this.normalizeValue(value)).filter(Boolean));
    const selectedSize = this.normalizeValue(dto?.size);
    const normalizedVariants = (variantRows || []).map((row) => {
      const attribute = this.normalizeValue(row.ten_thuoc_tinh);
      return {
        value: this.normalizeValue(row.gia_tri),
        amount: Number(row.phu_thu || 0),
        isSize: attribute.includes('size') || attribute.includes('kich thuoc'),
      };
    });
    const sizeVariant = normalizedVariants.find((row) => row.isSize && selectedSize && row.value === selectedSize);
    // Size rows store the complete selling price. Other rows store a
    // surcharge. This mirrors the menu and AI pricing contract.
    const unitPrice = (sizeVariant?.amount ?? Number(product.gia_ban || 0))
      + normalizedVariants
        .filter((row) => !row.isSize && selectedExtras.has(row.value))
        .reduce((sum, row) => sum + row.amount, 0);

    return {
      productId,
      productName: String(product.ten_san_pham),
      imageUrl: String(product.hinh_anh_url || ''),
      unitPrice,
    };
  }

  async layGiỏHàng(ma_nguoi_dung: string) {
    return this.cartRepo.find({ where: { ma_nguoi_dung } });
  }

  async themVaoGiỏ(dto: any) {
    const quantity = Number(dto?.so_luong ?? 1);
    if (!Number.isInteger(quantity) || quantity === 0) {
      throw new BadRequestException('So luong phai la so nguyen khac 0');
    }
    const authoritative = await this.resolveAuthoritativeProduct(dto);
    const normalizedDto = {
      ...dto,
      ma_san_pham: authoritative.productId,
      ten_san_pham: authoritative.productName,
      gia_ban: authoritative.unitPrice,
      hinh_anh_url: authoritative.imageUrl,
      so_luong: quantity,
    };
    const { ma_nguoi_dung, ma_san_pham, size } = normalizedDto;
    if (!ma_nguoi_dung) throw new BadRequestException('ma_nguoi_dung la bat buoc');
    const kichCo = size || 'Nhỏ';
    
    // Find all items with same user and product
    const items = await this.cartRepo.find({ where: { ma_nguoi_dung, ma_san_pham, size: kichCo } });
    
    let item = items.find(i => {
      // Compare toppings
      const t1 = [...(i.toppings || [])].sort().join(',');
      const t2 = [...(normalizedDto.toppings || [])].sort().join(',');
      if (t1 !== t2) return false;
      
      // Compare string fields
      if ((i.luong_da || '') !== (normalizedDto.luong_da || '')) return false;
      if ((i.do_ngot || '') !== (normalizedDto.do_ngot || '')) return false;
      if ((i.loai_sua || '') !== (normalizedDto.loai_sua || '')) return false;
      
      // Compare custom_attributes
      const aAttrs = i.custom_attributes || {};
      const bAttrs = normalizedDto.custom_attributes || {};
      const aKeys = Object.keys(aAttrs);
      const bKeys = Object.keys(bAttrs);
      if (aKeys.length !== bKeys.length) return false;
      for (const key of aKeys) {
        const valA = aAttrs[key];
        const valB = bAttrs[key];
        if (Array.isArray(valA) && Array.isArray(valB)) {
          if ([...valA].sort().join(',') !== [...valB].sort().join(',')) return false;
        } else if (valA !== valB) {
          return false;
        }
      }
      return true;
    });

    if (item) {
      item.so_luong += quantity;
      if (item.so_luong <= 0) {
        await this.cartRepo.remove(item);
        return null;
      }
      item.gia_ban = authoritative.unitPrice;
      return this.cartRepo.save(item);
    }
    
    return this.cartRepo.save(this.cartRepo.create({
      ...normalizedDto,
      hinh_anh_url: authoritative.imageUrl,
      size: kichCo,
      toppings: normalizedDto.toppings || [],
      luong_da: normalizedDto.luong_da || '',
      do_ngot: normalizedDto.do_ngot || '',
      loai_sua: normalizedDto.loai_sua || '',
      custom_attributes: normalizedDto.custom_attributes || {},
    }));
  }

  async quote(maNguoiDung: string, voucherCode?: string) {
    const items = await this.layGiỏHàng(maNguoiDung);
    const subtotal = items.reduce((sum, item) => sum + Number(item.gia_ban) * Number(item.so_luong), 0);
    let discountAmount = 0;
    let appliedVoucher: string | null = null;
    if (voucherCode?.trim()) {
      const hasToppings = items.some((item) => Array.isArray(item.toppings) && item.toppings.length > 0);
      const result = await this.voucherService.kiemTraVoucher(voucherCode, subtotal, maNguoiDung, hasToppings);
      discountAmount = Number(result.so_tien_giam || 0);
      appliedVoucher = result.voucher.ma_voucher;
    }
    return {
      items: items.map((item) => ({
        ...item,
        unit_price: Number(item.gia_ban),
        line_total: Number(item.gia_ban) * Number(item.so_luong),
      })),
      item_count: items.reduce((sum, item) => sum + Number(item.so_luong), 0),
      subtotal,
      discount_amount: discountAmount,
      voucher_code: appliedVoucher,
      final_total: Math.max(0, subtotal - discountAmount),
    };
  }

  async xoaKhoiGiỏ(id: number, maNguoiDung?: string) {
    const where: any = { id };
    if (maNguoiDung) where.ma_nguoi_dung = maNguoiDung;
    return this.cartRepo.delete(where);
  }

  async xoaSanPhamKhoiGio(maNguoiDung: string, maSanPham: number, size?: string) {
    const where: any = { ma_nguoi_dung: maNguoiDung, ma_san_pham: maSanPham };
    if (size) where.size = size;
    return this.cartRepo.delete(where);
  }

  async xoaToanBoGio(ma_nguoi_dung: string) {
    return this.cartRepo.delete({ ma_nguoi_dung });
  }
}
