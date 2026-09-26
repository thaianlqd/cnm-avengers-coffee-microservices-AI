import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      .toLowerCase()
      .replace(/đ/g, 'd')
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
    if (Array.isArray(value))
      return `[${value.map((entry) => this.stableJson(entry)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.stableJson(value[key])}`)
        .join(',')}}`;
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

  private cartMutationRequestHash(
    operationType: string,
    userId: string,
    payload: any,
  ): string {
    return createHash('sha256')
      .update(
        this.stableJson({
          operation_type: operationType,
          user_id: String(userId),
          payload,
        }),
      )
      .digest('hex');
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(
      `ALTER TABLE "${schema}".cart_mutation_operation
       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    );
  }

  private async ensureCartMetadataTable() {
    const schema = this.cartSchema();
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".cart_metadata (
        user_id VARCHAR PRIMARY KEY,
        cart_id VARCHAR(200) NOT NULL UNIQUE,
        cart_version BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  /**
   * Execute a mutation exactly once when the caller supplies an idempotency
   * key.  The operation row and cart write share one database transaction, so
   * a retry can only observe the stored canonical envelope, never a partially
   * applied cart change.
   */
  private async executeCartMutation(
    userId: string,
    operationType: string,
    operationId: string | undefined,
    payload: any,
    mutate: (manager: any, lockedMetadata: any) => Promise<any>,
  ) {
    const normalizedOperationId = String(operationId || '').trim();
    if (!normalizedOperationId) {
      await this.ensureCartMetadataTable();
      return this.dataSource.transaction(async (manager) => {
        // Every authenticated cart write takes this lock first.  This is the
        // lock order for ADD/UPDATE/REMOVE/CLEAR: metadata -> operation ->
        // cart rows.  It serializes distinct operation ids for one cart too.
        const lockedMetadata = await this.lockCartMetadata(manager, userId);
        return mutate(manager, lockedMetadata);
      });
    }
    if (normalizedOperationId.length > 200) {
      throw new BadRequestException('Idempotency key qua dai');
    }

    await Promise.all([
      this.ensureMutationOperationTable(),
      this.ensureCartMetadataTable(),
    ]);
    const schema = this.cartSchema();
    const requestHash = this.cartMutationRequestHash(
      operationType,
      userId,
      payload,
    );
    return this.dataSource.transaction(async (manager) => {
      // Do not move this below the idempotency/cart-row reads: all mutation
      // paths must acquire the per-cart lock in the same order to avoid lost
      // updates and lock-order deadlocks.
      const lockedMetadata = await this.lockCartMetadata(manager, userId);
      const existingRows = await manager.query(
        `SELECT request_hash, result FROM "${schema}".cart_mutation_operation WHERE operation_id = $1 FOR UPDATE`,
        [normalizedOperationId],
      );
      const existing = existingRows?.[0];
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ConflictException(
            'Idempotency key da duoc dung cho yeu cau khac',
          );
        }
        if (existing.result == null) {
          throw new ConflictException(
            'Cart mutation with this id is still being processed',
          );
        }
        const stored =
          typeof existing.result === 'string'
            ? JSON.parse(existing.result)
            : existing.result;
        return {
          ...stored,
          already_processed: true,
          operation_id: normalizedOperationId,
        };
      }

      const inserted = await manager.query(
        `INSERT INTO "${schema}".cart_mutation_operation
          (operation_id, user_id, operation_type, request_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (operation_id) DO NOTHING
         RETURNING operation_id`,
        [normalizedOperationId, userId, operationType, requestHash],
      );
      if (!inserted?.length) {
        const racedRows = await manager.query(
          `SELECT request_hash, result FROM "${schema}".cart_mutation_operation WHERE operation_id = $1 FOR UPDATE`,
          [normalizedOperationId],
        );
        const raced = racedRows?.[0];
        if (!raced || raced.request_hash !== requestHash) {
          throw new ConflictException(
            'Idempotency key da duoc dung cho yeu cau khac',
          );
        }
        if (raced.result == null) {
          throw new ConflictException(
            'Cart mutation with this id is still being processed',
          );
        }
        const stored =
          typeof raced.result === 'string'
            ? JSON.parse(raced.result)
            : raced.result;
        return {
          ...stored,
          already_processed: true,
          operation_id: normalizedOperationId,
        };
      }

      const result = await mutate(manager, lockedMetadata);
      await manager.query(
        `UPDATE "${schema}".cart_mutation_operation SET result = $2::jsonb, updated_at = NOW() WHERE operation_id = $1`,
        [normalizedOperationId, JSON.stringify(result)],
      );
      return {
        ...result,
        already_processed: false,
        operation_id: normalizedOperationId,
      };
    });
  }

  private cartIdFor(userId: string) {
    return `user:${userId}`;
  }

  private async lockCartMetadata(manager: any, userId: string) {
    const schema = this.cartSchema();
    await manager.query(
      `INSERT INTO "${schema}".cart_metadata (user_id, cart_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, this.cartIdFor(userId)],
    );
    const rows = await manager.query(
      `SELECT user_id, cart_id, cart_version
       FROM "${schema}".cart_metadata
       WHERE user_id = $1
       FOR UPDATE`,
      [userId],
    );
    return rows[0];
  }

  private async readCartMetadata(userId: string) {
    await this.ensureCartMetadataTable();
    const schema = this.cartSchema();
    await this.dataSource.query(
      `INSERT INTO "${schema}".cart_metadata (user_id, cart_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, this.cartIdFor(userId)],
    );
    const rows = await this.dataSource.query(
      `SELECT user_id, cart_id, cart_version
       FROM "${schema}".cart_metadata WHERE user_id = $1`,
      [userId],
    );
    return rows[0];
  }

  private async bumpCartVersion(
    manager: any,
    userId: string,
    lockedMetadata?: any,
  ) {
    const schema = this.cartSchema();
    // Mutations pass their already locked metadata row.  The fallback keeps
    // this helper safe for future callers, but must not be used to acquire a
    // cart lock late in a mutation.
    if (!lockedMetadata) await this.lockCartMetadata(manager, userId);
    const rows = await manager.query(
      `UPDATE "${schema}".cart_metadata
       SET cart_version = cart_version + 1, updated_at = NOW()
       WHERE user_id = $1
       RETURNING user_id, cart_id, cart_version`,
      [userId],
    );
    return rows[0];
  }

  private configurationSignature(item: any) {
    const normalizeConfigurationValue = (value: any): any => {
      if (Array.isArray(value)) {
        return value
          .map((entry) => normalizeConfigurationValue(entry))
          .sort((left, right) =>
            this.stableJson(left).localeCompare(this.stableJson(right)),
          );
      }
      if (value && typeof value === 'object') {
        return Object.keys(value)
          .sort()
          .reduce((result: Record<string, any>, key) => {
            result[this.normalizeValue(key)] = normalizeConfigurationValue(
              value[key],
            );
            return result;
          }, {});
      }
      return typeof value === 'string'
        ? this.normalizeValue(value)
        : (value ?? null);
    };
    const canonical = this.stableJson({
      product_id: Number(item.ma_san_pham ?? item.product_id),
      size: normalizeConfigurationValue(item.size || item.kich_co || 'Nhỏ'),
      toppings: normalizeConfigurationValue(item.toppings || []),
      luong_da: normalizeConfigurationValue(item.luong_da || ''),
      do_ngot: normalizeConfigurationValue(item.do_ngot || ''),
      loai_sua: normalizeConfigurationValue(item.loai_sua || ''),
      custom_attributes: normalizeConfigurationValue(
        item.custom_attributes || {},
      ),
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private toCartLine(item: CartItem) {
    const unitPrice = Number(item.gia_ban || 0);
    const quantity = Number(item.so_luong || 0);
    return {
      line_id: item.id,
      product_id: item.ma_san_pham,
      product_name: item.ten_san_pham,
      quantity,
      size: item.size || 'Nhỏ',
      toppings: item.toppings || [],
      luong_da: item.luong_da || '',
      do_ngot: item.do_ngot || '',
      loai_sua: item.loai_sua || '',
      custom_attributes: item.custom_attributes || {},
      unit_price: unitPrice,
      line_total: unitPrice * quantity,
      configuration_signature: this.configurationSignature(item),
      // Legacy aliases let existing web callers migrate incrementally.
      id: item.id,
      ma_san_pham: item.ma_san_pham,
      ten_san_pham: item.ten_san_pham,
      so_luong: quantity,
      gia_ban: unitPrice,
      hinh_anh_url: item.hinh_anh_url || '',
    };
  }

  private async cartEnvelope(userId: string, manager?: any, metadata?: any) {
    const cartRepo = manager ? manager.getRepository(CartItem) : this.cartRepo;
    const rows = await cartRepo.find({ where: { ma_nguoi_dung: userId } });
    const cartMeta = metadata || (await this.readCartMetadata(userId));
    const items = rows.map((item) => this.toCartLine(item));
    return {
      cart_id: String(cartMeta.cart_id),
      cart_version: Number(cartMeta.cart_version),
      user_id: userId,
      items,
      item_count: items.reduce((sum, item) => sum + Number(item.quantity), 0),
      subtotal: items.reduce((sum, item) => sum + Number(item.line_total), 0),
    };
  }

  private async finalizedMutation(
    manager: any,
    userId: string,
    line?: CartItem | null,
    affected = 1,
    lockedMetadata?: any,
  ) {
    const metadata = await this.bumpCartVersion(
      manager,
      userId,
      lockedMetadata,
    );
    const cart = await this.cartEnvelope(userId, manager, metadata);
    return {
      ...cart,
      affected,
      persisted_line: line ? this.toCartLine(line) : null,
    };
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
    const selectedExtras = new Set(
      selectedValues.map((value) => this.normalizeValue(value)).filter(Boolean),
    );
    const selectedSize = this.normalizeValue(dto?.size);
    const normalizedVariants = (variantRows || []).map((row) => {
      const attribute = this.normalizeValue(row.ten_thuoc_tinh);
      return {
        value: this.normalizeValue(row.gia_tri),
        amount: Number(row.phu_thu || 0),
        isSize: attribute.includes('size') || attribute.includes('kich thuoc'),
      };
    });
    const sizeVariant = normalizedVariants.find(
      (row) => row.isSize && selectedSize && row.value === selectedSize,
    );
    // Size rows store the complete selling price. Other rows store a
    // surcharge. This mirrors the menu and AI pricing contract.
    const unitPrice =
      (sizeVariant?.amount ?? Number(product.gia_ban || 0)) +
      normalizedVariants
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
    return this.cartEnvelope(ma_nguoi_dung);
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
    if (!ma_nguoi_dung)
      throw new BadRequestException('ma_nguoi_dung la bat buoc');
    const kichCo = size || 'Nhỏ';

    // Find all items with same user and product
    const items = await cartRepo.find({
      where: { ma_nguoi_dung, ma_san_pham, size: kichCo },
    });

    const mergeCandidate = { ...normalizedDto, size: kichCo };
    const item = items.find((existing) =>
      this.sameConfiguration(existing, mergeCandidate),
    );

    if (item) {
      item.so_luong += quantity;
      if (item.so_luong <= 0) {
        await cartRepo.remove(item);
        return null;
      }
      item.gia_ban = authoritative.unitPrice;
      return cartRepo.save(item);
    }

    return cartRepo.save(
      cartRepo.create({
        ...normalizedDto,
        hinh_anh_url: authoritative.imageUrl,
        size: kichCo,
        toppings: normalizedDto.toppings || [],
        luong_da: normalizedDto.luong_da || '',
        do_ngot: normalizedDto.do_ngot || '',
        loai_sua: normalizedDto.loai_sua || '',
        custom_attributes: normalizedDto.custom_attributes || {},
      }),
    );
  }

  async themVaoGiỏ(dto: any, operationId?: string) {
    const userId = String(dto?.ma_nguoi_dung || '');
    if (!userId) throw new BadRequestException('ma_nguoi_dung la bat buoc');
    const normalizedOperationId = String(operationId || '').trim();
    if (!normalizedOperationId) {
      await this.ensureCartMetadataTable();
      return this.dataSource.transaction(async (manager) => {
        const lockedMetadata = await this.lockCartMetadata(manager, userId);
        const line = await this.themVaoGiỏNoIdempotency(dto, manager);
        return this.finalizedMutation(
          manager,
          userId,
          line,
          1,
          lockedMetadata,
        );
      });
    }
    if (normalizedOperationId.length > 200) {
      throw new BadRequestException('Idempotency key qua dai');
    }

    await Promise.all([
      this.ensureMutationOperationTable(),
      this.ensureCartMetadataTable(),
    ]);
    const schema = this.cartSchema();
    const requestHash = this.mutationRequestHash(dto);
    return this.dataSource.transaction(async (manager) => {
      // Keep ADD in the exact same metadata -> operation -> cart-row order as
      // the generic mutation wrapper below.
      const lockedMetadata = await this.lockCartMetadata(manager, userId);
      const existingRows = await manager.query(
        `SELECT request_hash, result FROM "${schema}".cart_mutation_operation WHERE operation_id = $1 FOR UPDATE`,
        [normalizedOperationId],
      );
      const existing = existingRows?.[0];
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ConflictException(
            'Idempotency key da duoc dung cho yeu cau khac',
          );
        }
        if (existing.result == null) {
          throw new ConflictException(
            'Cart mutation with this id is still being processed',
          );
        }
        const stored =
          typeof existing.result === 'string'
            ? JSON.parse(existing.result)
            : existing.result;
        return {
          ...stored,
          already_processed: true,
          operation_id: normalizedOperationId,
        };
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
          throw new ConflictException(
            'Idempotency key da duoc dung cho yeu cau khac',
          );
        }
        if (raced.result == null) {
          throw new ConflictException(
            'Cart mutation with this id is still being processed',
          );
        }
        const stored =
          typeof raced.result === 'string'
            ? JSON.parse(raced.result)
            : raced.result;
        return {
          ...stored,
          already_processed: true,
          operation_id: normalizedOperationId,
        };
      }
      const line = await this.themVaoGiỏNoIdempotency(dto, manager);
      const result = await this.finalizedMutation(
        manager,
        userId,
        line,
        1,
        lockedMetadata,
      );
      await manager.query(
        `UPDATE "${schema}".cart_mutation_operation SET result = $2::jsonb, updated_at = NOW() WHERE operation_id = $1`,
        [normalizedOperationId, JSON.stringify(result)],
      );
      return {
        ...(result || {}),
        already_processed: false,
        operation_id: normalizedOperationId,
      };
    });
  }

  async quote(maNguoiDung: string, voucherCode?: string) {
    const cart = await this.layGiỏHàng(maNguoiDung);
    const items = cart.items;
    const subtotal = cart.subtotal;
    let discountAmount = 0;
    let appliedVoucher: string | null = null;
    if (voucherCode?.trim()) {
      const hasToppings = items.some(
        (item) => Array.isArray(item.toppings) && item.toppings.length > 0,
      );
      const result = await this.voucherService.kiemTraVoucher(
        voucherCode,
        subtotal,
        maNguoiDung,
        hasToppings,
      );
      discountAmount = Number(result.so_tien_giam || 0);
      appliedVoucher = result.voucher.ma_voucher;
    }
    return {
      ...cart,
      items,
      item_count: cart.item_count,
      subtotal,
      discount_amount: discountAmount,
      voucher_code: appliedVoucher,
      final_total: Math.max(0, subtotal - discountAmount),
    };
  }

  async xoaKhoiGiỏ(id: number, maNguoiDung?: string, operationId?: string) {
    const owner = String(maNguoiDung || '');
    if (!owner)
      throw new BadRequestException('ma_nguoi_dung la bat buoc cho cart mutation');
    return this.executeCartMutation(
      String(owner),
      'REMOVE_CART_LINE',
      operationId,
      { line_id: id },
      async (manager, lockedMetadata) => {
        const source = await manager.findOne(CartItem, { where: { id } });
        if (!source || (maNguoiDung && source.ma_nguoi_dung !== maNguoiDung)) {
          throw new NotFoundException('Không tìm thấy món trong giỏ hàng');
        }
        await manager.remove(source);
        return this.finalizedMutation(
          manager,
          source.ma_nguoi_dung,
          null,
          1,
          lockedMetadata,
        );
      },
    );
  }

  private sameConfiguration(a: any, b: any) {
    return this.configurationSignature(a) === this.configurationSignature(b);
  }

  /** Update one row without the unsafe add-then-delete client dance. */
  async capNhatMucGio(
    id: number,
    dto: any,
    maNguoiDung?: string,
    operationId?: string,
  ) {
    const owner = String(maNguoiDung || '');
    if (!owner)
      throw new BadRequestException('ma_nguoi_dung la bat buoc cho cart mutation');
    const requestPayload = {
      line_id: id,
      product_id: dto?.product_id ?? dto?.ma_san_pham ?? null,
      quantity: dto?.quantity ?? dto?.so_luong ?? null,
      size: dto?.size ?? null,
      toppings: dto?.toppings ?? null,
      luong_da: dto?.luong_da ?? null,
      do_ngot: dto?.do_ngot ?? null,
      loai_sua: dto?.loai_sua ?? null,
      custom_attributes: dto?.custom_attributes ?? null,
    };
    return this.executeCartMutation(
      String(owner),
      'UPDATE_CART_LINE',
      operationId,
      requestPayload,
      async (manager, lockedMetadata) => {
        const source = await manager.findOne(CartItem, { where: { id } });
        if (!source || (maNguoiDung && source.ma_nguoi_dung !== maNguoiDung)) {
          throw new NotFoundException('Không tìm thấy món trong giỏ hàng');
        }

        const quantity = Number(
          dto?.quantity ?? dto?.so_luong ?? source.so_luong,
        );
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw new BadRequestException('Số lượng phải là số nguyên lớn hơn 0');
        }
        const desired = {
          ma_san_pham:
            dto?.product_id ?? dto?.ma_san_pham ?? source.ma_san_pham,
          size: dto?.size ?? source.size ?? 'Nhỏ',
          toppings: dto?.toppings ?? source.toppings ?? [],
          luong_da: dto?.luong_da ?? source.luong_da ?? '',
          do_ngot: dto?.do_ngot ?? source.do_ngot ?? '',
          loai_sua: dto?.loai_sua ?? source.loai_sua ?? '',
          custom_attributes:
            dto?.custom_attributes ?? source.custom_attributes ?? {},
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
          where: {
            ma_nguoi_dung: source.ma_nguoi_dung,
            ma_san_pham: authoritative.productId,
            size: desired.size || 'Nhỏ',
          },
        });
        const duplicate = siblings.find(
          (item) => item.id !== source.id && this.sameConfiguration(item, next),
        );
        if (duplicate) {
          duplicate.so_luong = Number(duplicate.so_luong) + quantity;
          duplicate.gia_ban = authoritative.unitPrice;
          await manager.save(duplicate);
          await manager.remove(source);
          return this.finalizedMutation(
            manager,
            source.ma_nguoi_dung,
            duplicate,
            1,
            lockedMetadata,
          );
        }
        Object.assign(source, next, {
          size: desired.size || 'Nhỏ',
          toppings: desired.toppings || [],
          luong_da: desired.luong_da || '',
          do_ngot: desired.do_ngot || '',
          loai_sua: desired.loai_sua || '',
          custom_attributes: desired.custom_attributes || {},
        });
        const saved = await manager.save(source);
        return this.finalizedMutation(
          manager,
          source.ma_nguoi_dung,
          saved,
          1,
          lockedMetadata,
        );
      },
    );
  }

  async xoaSanPhamKhoiGio(
    maNguoiDung: string,
    maSanPham: number,
    size?: string,
    operationId?: string,
  ) {
    // Deprecated legacy adapter only. Canonical callers must use DELETE
    // /cart/:line_id because product+size can delete multiple option variants.
    // Its broad matching remains for frontend compatibility and is deliberately
    // not exposed to the canonical AI mutation flow.
    return this.executeCartMutation(
      maNguoiDung,
      'REMOVE_CART_PRODUCT_LEGACY',
      operationId,
      { product_id: maSanPham, size: size || null },
      async (manager, lockedMetadata) => {
        const where: any = {
          ma_nguoi_dung: maNguoiDung,
          ma_san_pham: maSanPham,
        };
        if (size) where.size = size;
        const result = await manager.delete(CartItem, where);
        if (!result.affected) {
          const cart = await this.cartEnvelope(
            maNguoiDung,
            manager,
            lockedMetadata,
          );
          return { ...cart, affected: 0, persisted_line: null };
        }
        return this.finalizedMutation(
          manager,
          maNguoiDung,
          null,
          result.affected,
          lockedMetadata,
        );
      },
    );
  }

  async xoaToanBoGio(ma_nguoi_dung: string, operationId?: string) {
    return this.executeCartMutation(
      ma_nguoi_dung,
      'CLEAR_CART',
      operationId,
      { user_id: ma_nguoi_dung },
      async (manager, lockedMetadata) => {
        const result = await manager.delete(CartItem, { ma_nguoi_dung });
        if (!result.affected) {
          const cart = await this.cartEnvelope(
            ma_nguoi_dung,
            manager,
            lockedMetadata,
          );
          return { ...cart, affected: 0, persisted_line: null };
        }
        return this.finalizedMutation(
          manager,
          ma_nguoi_dung,
          null,
          result.affected,
          lockedMetadata,
        );
      },
    );
  }
}
