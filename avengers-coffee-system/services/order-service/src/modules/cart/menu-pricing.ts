import { BadRequestException, NotFoundException } from '@nestjs/common';

const normalizeValue = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();
const aliases: Record<string,string> = {size:'size','kich thuoc':'size','kich co':'size',topping:'toppings',toppings:'toppings','luong da':'luong_da',ice:'luong_da','do ngot':'do_ngot',sweetness:'do_ngot','loai sua':'loai_sua',milk:'loai_sua'};

// Prices are resolved again at quote and checkout: a cart never extends a sale's schedule.
export async function resolveMenuProduct(query: (sql: string, parameters: any[]) => Promise<any>, input: any) {
  const dto = {...input, custom_attributes: Object.fromEntries(Object.entries(input?.custom_attributes || {}).filter(([key]) => {
    const field = aliases[normalizeValue(key)];
    return !field || input?.[field] == null;
  }))};
    const productId = Number(dto?.ma_san_pham);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('Ma san pham khong hop le');
    }

    const rows = await query(
      `SELECT p.ma_san_pham,p.ten_san_pham,p.gia_ban,p.hinh_anh_url,p.trang_thai,
         COALESCE((SELECT MIN(f.sale_price) FROM orders.flash_sale f WHERE f.product_id=p.ma_san_pham AND f.enabled AND f.starts_at<=now() AND f.ends_at>now()),p.gia_ban) AS effective_price
       FROM menu.san_pham p WHERE p.ma_san_pham = $1 LIMIT 1`,
      [productId],
    );
    const product = rows?.[0];
    if (!product || product.trang_thai === false) {
      throw new NotFoundException('San pham khong ton tai hoac dang ngung ban');
    }

    const variantRows = await query(
      `SELECT tt.ten_thuoc_tinh, bt.gia_tri, bt.phu_thu
         FROM menu.bien_the_san_pham bt
         JOIN menu.thuoc_tinh tt ON tt.ma_thuoc_tinh = bt.ma_thuoc_tinh
        WHERE bt.ma_san_pham = $1`,
      [productId],
    );

    const selectedValues: unknown[] = [...(dto?.toppings || []), dto?.loai_sua, dto?.luong_da, dto?.do_ngot];
    for (const value of Object.values(dto?.custom_attributes || {})) {
      if (Array.isArray(value)) selectedValues.push(...value);
      else selectedValues.push(value);
    }
    const selectedExtras = new Set(
      selectedValues.map((value) => normalizeValue(value)).filter(Boolean),
    );
    const selectedSize = normalizeValue(dto?.size);
    const normalizedVariants = (variantRows || []).map((row) => {
      const attribute = normalizeValue(row.ten_thuoc_tinh);
      return {
        value: normalizeValue(row.gia_tri),
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
      Math.max(0,(sizeVariant?.amount ?? Number(product.gia_ban || 0)) - Math.max(0,Number(product.gia_ban || 0)-Number(product.effective_price ?? product.gia_ban ?? 0))) +
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

export async function repriceCartLines(query: (sql: string, parameters: any[]) => Promise<any>, lines: any[]) {
  return Promise.all(lines.map(async line => {
    const product = await resolveMenuProduct(query, line);
    return { ...line, gia_ban: product.unitPrice };
  }));
}
