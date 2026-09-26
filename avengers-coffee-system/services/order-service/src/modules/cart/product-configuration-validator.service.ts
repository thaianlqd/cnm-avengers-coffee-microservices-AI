import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

/**
 * The Menu database exposes option values/surcharges through
 * menu.thuoc_tinh + menu.bien_the_san_pham.  It currently has no persisted
 * required/min/max columns, so this component cannot invent those rules; it
 * does strictly validate every group that Menu does define.  Both cart writes
 * and strict checkout call this class so a cart line cannot be priced with
 * different semantics at quote/confirm time.
 */
@Injectable()
export class ProductConfigurationValidator {
  normalize(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .trim();
  }

  private semanticGroup(name: unknown): 'size' | 'toppings' | 'ice' | 'sugar' | 'milk' | null {
    const normalized = this.normalize(name);
    if (normalized.includes('size') || normalized.includes('kich thuoc')) return 'size';
    if (normalized.includes('topping')) return 'toppings';
    if (normalized.includes('ice') || normalized === 'da' || normalized.includes('luong da')) return 'ice';
    if (normalized.includes('sugar') || normalized.includes('duong') || normalized.includes('do ngot')) return 'sugar';
    if (normalized.includes('milk') || normalized === 'sua' || normalized.includes('loai sua')) return 'milk';
    return null;
  }

  private values(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : [value];
    return raw.map((item) => this.normalize(item)).filter(Boolean);
  }

  /** Normalize canonical fields first, then retain only real custom groups. */
  private selectedByGroup(selection: any): Map<string, string[]> {
    const result = new Map<string, string[]>();
    result.set('size', this.values(selection?.size || selection?.kich_co || 'Nhỏ'));
    result.set('toppings', this.values(selection?.toppings));
    result.set('ice', this.values(selection?.luong_da));
    result.set('sugar', this.values(selection?.do_ngot));
    result.set('milk', this.values(selection?.loai_sua));
    for (const [key, value] of Object.entries(selection?.custom_attributes || {})) {
      // Canonical rows occasionally repeat e.g. "Kích thước" in JSON.  It
      // is a representation alias, not an independent paid option.
      if (this.semanticGroup(key)) continue;
      result.set(`custom:${this.normalize(key)}`, this.values(value));
    }
    return result;
  }

  async resolve(queryable: { query: (sql: string, params?: any[]) => Promise<any[]> }, selection: any) {
    const productId = Number(selection?.ma_san_pham ?? selection?.product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new ConflictException({ code: 'REQUOTE_REQUIRED', reason: 'INVALID_PRODUCT' });
    }
    const productRows = await queryable.query(
      `SELECT ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url, trang_thai
         FROM menu.san_pham WHERE ma_san_pham = $1 LIMIT 1`, [productId],
    );
    const product = productRows[0];
    if (!product || product.trang_thai === false) {
      throw new NotFoundException('San pham khong ton tai hoac dang ngung ban');
    }
    const rows: Array<{ ten_thuoc_tinh: string; gia_tri: string; phu_thu: number }> = await queryable.query(
      `SELECT tt.ten_thuoc_tinh, bt.gia_tri, bt.phu_thu
         FROM menu.bien_the_san_pham bt
         JOIN menu.thuoc_tinh tt ON tt.ma_thuoc_tinh = bt.ma_thuoc_tinh
        WHERE bt.ma_san_pham = $1`, [productId],
    );
    const selected = this.selectedByGroup(selection);
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const semantic = this.semanticGroup(row.ten_thuoc_tinh);
      const key = semantic || `custom:${this.normalize(row.ten_thuoc_tinh)}`;
      groups.set(key, [...(groups.get(key) || []), row]);
    }

    let unitPrice = Number(product.gia_ban || 0);
    for (const [group, choices] of groups) {
      const requested = selected.get(group) || [];
      if (group === 'size') {
        const size = requested[0];
        const selectedVariant = choices.find((row) => this.normalize(row.gia_tri) === size);
        if (!selectedVariant) {
          throw new ConflictException({ code: 'REQUOTE_REQUIRED', reason: 'OPTION_UNAVAILABLE', option: 'size' });
        }
        // Menu stores the completed price for a size, not a surcharge.
        unitPrice = Number(selectedVariant.phu_thu || 0);
        continue;
      }
      for (const value of requested) {
        const selectedVariant = choices.find((row) => this.normalize(row.gia_tri) === value);
        if (!selectedVariant) {
          throw new ConflictException({ code: 'REQUOTE_REQUIRED', reason: 'OPTION_UNAVAILABLE', option: group, value });
        }
        unitPrice += Number(selectedVariant.phu_thu || 0);
      }
    }

    // A custom key unknown to Menu must never become a free, fabricated
    // option. Canonical ice/sugar/milk remain backwards-compatible free text
    // only if this product has no corresponding Menu group.
    for (const [group, requested] of selected) {
      if (requested.length && group.startsWith('custom:') && !groups.has(group)) {
        throw new ConflictException({ code: 'REQUOTE_REQUIRED', reason: 'OPTION_UNAVAILABLE', option: group });
      }
    }
    return {
      productId,
      productName: String(product.ten_san_pham),
      imageUrl: String(product.hinh_anh_url || ''),
      unitPrice,
    };
  }
}
