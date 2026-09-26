import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
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

  private cartSchema() {
    const schema = process.env.DB_SCHEMA || 'orders';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
      throw new BadRequestException('DB_SCHEMA khong hop le');
    }
    return schema;
  }

  private stableJson(value: any): string {
    if (Array.isArray(value)) return `[${value.map((entry) => this.stableJson(entry)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${this.stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
  }

  private mutationRequestHash(dto: any): string {
    // Price/name/image are deliberately excluded: they are resolved from Menu
    // inside this service and must not alter idempotency semantics.
    const canonicalRequest = this.stableJson({
      user_id: String(dto?.ma_nguoi_dung || ''),
      product_id: Number(dto?.ma_san_pham),
      quantity: Number(dto?.so_luong ?? 1),
      size: dto?.size || 'Nhỏ',
      toppings: [...(dto?.toppings || [])].map(String).sort(),
      luong_da: dto?.luong_da || '',
      do_ngot: dto?.do_ngot || '',
      loai_sua: dto?.loai_sua || '',
      custom_attributes: dto?.custom_attributes || {},
    });
    return createHash('sha256').update(canonicalRequest).digest('hex');
  }

  private async ensureMutationOperationTable() {
    const schema = this.cartSchema();
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".cart_mutation_operation (
        operation_id VARCHAR(200) PRIMARY KEY,
        user_id VARCHAR NOT NULL,
        operation_type VARCHAR(64) NOT NULL,
        request_hash TEXT NOT NULL,
        result JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
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

  private async themVaoGiỏNoIdempotency(dto: any, manager?: any) {
    const cartRepo = manager ? manager.getRepository(CartItem) : this.cartRepo;
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
    const items = await cartRepo.find({ where: { ma_nguoi_dung, ma_san_pham, size: kichCo } });
    
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
        await cartRepo.remove(item);
        return null;
      }
      item.gia_ban = authoritative.unitPrice;
      return cartRepo.save(item);
    }
    
    return cartRepo.save(cartRepo.create({
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

  async themVaoGiỏ(dto: any, operationId?: string) {
    const normalizedOperationId = String(operationId || '').trim();
    if (!normalizedOperationId) {
      return this.themVaoGiỏNoIdempotency(dto);
    }
    if (normalizedOperationId.length > 200) {
      throw new BadRequestException('Idempotency key qua dai');
    }

    await this.ensureMutationOperationTable();
    const schema = this.cartSchema();
    const requestHash = this.mutationRequestHash(dto);
    const userId = String(dto?.ma_nguoi_dung || '');
    return this.dataSource.transaction(async (manager) => {
      const existingRows = await manager.query(
        `SELECT request_hash, result FROM "${schema}".cart_mutation_operation WHERE operation_id = $1 FOR UPDATE`,
        [normalizedOperationId],
      );
      const existing = existingRows?.[0];
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ConflictException('Idempotency key da duoc dung cho yeu cau khac');
        }
        if (existing.result == null) {
          throw new ConflictException('Cart mutation with this id is still being processed');
        }
        const stored = typeof existing.result === 'string' ? JSON.parse(existing.result) : existing.result;
        return { ...stored, already_processed: true, operation_id: normalizedOperationId };
      }

      const inserted = await manager.query(
        `INSERT INTO "${schema}".cart_mutation_operation
          (operation_id, user_id, operation_type, request_hash)
         VALUES ($1, $2, 'ADD_CART_LINE', $3)
         ON CONFLICT (operation_id) DO NOTHING
         RETURNING operation_id`,
        [normalizedOperationId, userId, requestHash],
      );
      if (!inserted?.length) {
        // Another transaction won the insert race. PostgreSQL waits for that
        // transaction before ON CONFLICT returns, so this locked read obtains
        // its completed result instead of performing the mutation again.
        const racedRows = await manager.query(
          `SELECT request_hash, result FROM "${schema}".cart_mutation_operation WHERE operation_id = $1 FOR UPDATE`,
          [normalizedOperationId],
        );
        const raced = racedRows?.[0];
        if (!raced || raced.request_hash !== requestHash) {
          throw new ConflictException('Idempotency key da duoc dung cho yeu cau khac');
        }
        if (raced.result == null) {
          throw new ConflictException('Cart mutation with this id is still being processed');
        }
        const stored = typeof raced.result === 'string' ? JSON.parse(raced.result) : raced.result;
        return { ...stored, already_processed: true, operation_id: normalizedOperationId };
      }
      const result = await this.themVaoGiỏNoIdempotency(dto, manager);
      await manager.query(
        `UPDATE "${schema}".cart_mutation_operation SET result = $2::jsonb WHERE operation_id = $1`,
        [normalizedOperationId, JSON.stringify(result)],
      );
      return { ...(result || {}), already_processed: false, operation_id: normalizedOperationId };
    });
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

  private sameConfiguration(a: any, b: any) {
    const toppingsA = [...(a.toppings || [])].map(String).sort().join(',');
    const toppingsB = [...(b.toppings || [])].map(String).sort().join(',');
    if (toppingsA !== toppingsB) return false;
    if ((a.luong_da || '') !== (b.luong_da || '')) return false;
    if ((a.do_ngot || '') !== (b.do_ngot || '')) return false;
    if ((a.loai_sua || '') !== (b.loai_sua || '')) return false;
    return JSON.stringify(a.custom_attributes || {}) === JSON.stringify(b.custom_attributes || {});
  }

  /** Update one row without the unsafe add-then-delete client dance. */
  async capNhatMucGio(id: number, dto: any, maNguoiDung?: string) {
    return this.dataSource.transaction(async (manager) => {
      const source = await manager.findOne(CartItem, { where: { id } });
      if (!source || (maNguoiDung && source.ma_nguoi_dung !== maNguoiDung)) {
        throw new NotFoundException('Không tìm thấy món trong giỏ hàng');
      }

      const quantity = Number(dto?.quantity ?? dto?.so_luong ?? source.so_luong);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException('Số lượng phải là số nguyên lớn hơn 0');
      }
      const desired = {
        ma_san_pham: dto?.product_id ?? dto?.ma_san_pham ?? source.ma_san_pham,
        size: dto?.size ?? source.size ?? 'Nhỏ',
        toppings: dto?.toppings ?? source.toppings ?? [],
        luong_da: dto?.luong_da ?? source.luong_da ?? '',
        do_ngot: dto?.do_ngot ?? source.do_ngot ?? '',
        loai_sua: dto?.loai_sua ?? source.loai_sua ?? '',
        custom_attributes: dto?.custom_attributes ?? source.custom_attributes ?? {},
      };
      const authoritative = await this.resolveAuthoritativeProduct(desired);
      const next = {
        ...desired,
        ma_nguoi_dung: source.ma_nguoi_dung,
        ten_san_pham: authoritative.productName,
        gia_ban: authoritative.unitPrice,
        hinh_anh_url: authoritative.imageUrl,
        so_luong: quantity,
      };

      const siblings = await manager.find(CartItem, {
        where: { ma_nguoi_dung: source.ma_nguoi_dung, ma_san_pham: authoritative.productId, size: desired.size || 'Nhỏ' },
      });
      const duplicate = siblings.find((item) => item.id !== source.id && this.sameConfiguration(item, next));
      if (duplicate) {
        duplicate.so_luong = Number(duplicate.so_luong) + quantity;
        duplicate.gia_ban = authoritative.unitPrice;
        await manager.save(duplicate);
        await manager.remove(source);
        return duplicate;
      }
      Object.assign(source, next, {
        size: desired.size || 'Nhỏ',
        toppings: desired.toppings || [],
        luong_da: desired.luong_da || '',
        do_ngot: desired.do_ngot || '',
        loai_sua: desired.loai_sua || '',
        custom_attributes: desired.custom_attributes || {},
      });
      return manager.save(source);
    });
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
