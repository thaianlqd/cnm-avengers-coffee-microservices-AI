import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DonHang } from '../modules/thanh-toan/entities/don-hang.entity';
import { ChiTietDonHang } from '../modules/thanh-toan/entities/chi-tiet-don-hang.entity';
import { GiaoDichThanhToan } from '../modules/thanh-toan/entities/giao-dich-thanh-toan.entity';
import { RedisCacheService } from '../infrastructure/cache/redis-cache.service';
import { NotificationService } from '../modules/notification/notification.service';

export const RANKING_WEIGHTS = { purchases: 1, orders: .7, rating: 2, reviews: .5, favorites: 2.5, vouchers: .8 };
export function rankingScore(row: any, w = RANKING_WEIGHTS) {
  return Math.round((Number(row.total_qty || 0) * w.purchases + Number(row.order_count || 0) * w.orders + Number(row.avg_rating || 0) * w.rating + Number(row.total_reviews || 0) * w.reviews + Number(row.favorite_count || 0) * w.favorites + Number(row.voucher_qty || 0) * w.vouchers) * 100) / 100;
}
export function validateSale(body: any, basePrice: number) {
  const price = Number(body.sale_price), start = new Date(body.starts_at), end = new Date(body.ends_at);
  if (!String(body.title || '').trim()) throw new BadRequestException('Vui lòng nhập tên chương trình.');
  if (!Number.isFinite(price) || price <= 0) throw new BadRequestException('Giá flash sale phải lớn hơn 0 đ.');
  if (price >= basePrice) throw new BadRequestException(`Giá flash sale phải thấp hơn giá bán thường ${basePrice.toLocaleString('vi-VN')} đ.`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu.');
  if (typeof body.enabled !== 'boolean') throw new BadRequestException('Trạng thái chương trình không hợp lệ.');
  return { price, start, end };
}

@Injectable()
export class CommerceService {
  constructor(private readonly db: DataSource, private readonly notifications: NotificationService, private readonly cache: RedisCacheService) {}

  async sales(activeOnly = false) {
    const rows = await this.db.query(`SELECT f.*, p.ten_san_pham, p.hinh_anh_url, p.gia_ban AS original_price,
      CASE WHEN NOT f.enabled THEN 'INACTIVE' WHEN now() < f.starts_at THEN 'SCHEDULED' WHEN now() >= f.ends_at THEN 'EXPIRED' ELSE 'ACTIVE' END AS status
      FROM orders.flash_sale f JOIN menu.san_pham p ON p.ma_san_pham=f.product_id
      ${activeOnly ? 'WHERE f.enabled AND now() >= f.starts_at AND now() < f.ends_at AND p.trang_thai' : ''}
      ORDER BY f.starts_at DESC, f.id DESC`);
    return { items: rows };
  }

  async saveSale(body: any, id?: number) {
    const productId = Number(body.product_id);
    const [product] = await this.db.query('SELECT gia_ban FROM menu.san_pham WHERE ma_san_pham=$1 AND trang_thai=true', [productId]);
    if (!product) throw new BadRequestException('Chọn sản phẩm đang kinh doanh.');
    const { price, start, end } = validateSale(body, Number(product.gia_ban));
    return this.db.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [productId]);
      const overlap = await manager.query(`SELECT id FROM orders.flash_sale WHERE product_id=$1 AND enabled=true AND $2::boolean
        AND starts_at < $4 AND ends_at > $3 AND id <> COALESCE($5,0)`, [productId, body.enabled, start, end, id || null]);
      if (overlap.length) throw new ConflictException('Sản phẩm đã có flash sale trong khoảng thời gian này.');
      const values = [productId, body.title.trim().slice(0,200), price, start, end, body.enabled];
      const rows = id
        ? await manager.query('UPDATE orders.flash_sale SET product_id=$1,title=$2,sale_price=$3,starts_at=$4,ends_at=$5,enabled=$6 WHERE id=$7 RETURNING *', [...values,id])
        : await manager.query('INSERT INTO orders.flash_sale(product_id,title,sale_price,starts_at,ends_at,enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', values);
      if (!rows[0]) throw new NotFoundException('Không tìm thấy flash sale.');
      return { item: rows[0] };
    });
  }
  async deleteSale(id: number) { await this.db.query('DELETE FROM orders.flash_sale WHERE id=$1',[id]); return { success: true }; }

  async campaigns() {
    const items = await this.db.query(`SELECT c.*,
      CASE WHEN NOT c.enabled THEN 'INACTIVE' WHEN now()<c.starts_at THEN 'SCHEDULED' WHEN now()>=c.ends_at THEN 'EXPIRED' ELSE 'ACTIVE' END AS status,
      COALESCE(jsonb_agg(jsonb_build_object('product_id',f.product_id,'sale_price',f.sale_price,'original_price',p.gia_ban,'ten_san_pham',p.ten_san_pham,'hinh_anh_url',p.hinh_anh_url) ORDER BY f.id) FILTER (WHERE f.id IS NOT NULL),'[]'::jsonb) AS products
      FROM orders.flash_sale_campaign c LEFT JOIN orders.flash_sale f ON f.campaign_id=c.id LEFT JOIN menu.san_pham p ON p.ma_san_pham=f.product_id
      GROUP BY c.id ORDER BY c.starts_at DESC,c.id DESC`);
    return { items };
  }

  async saveCampaign(body: any, id?: number) {
    if (!String(body.title || '').trim()) throw new BadRequestException('Vui lòng nhập tên chương trình.');
    const lines = body.products;
    if (!Array.isArray(lines) || !lines.length || lines.length>150 || lines.some(line=>!Number.isInteger(Number(line.product_id)) || Number(line.product_id)<=0)) throw new BadRequestException('Chọn ít nhất một sản phẩm hợp lệ cho chương trình.');
    const productIds = lines.map(line=>Number(line.product_id)).sort((a,b)=>a-b);
    if (new Set(productIds).size!==productIds.length) throw new BadRequestException('Mỗi sản phẩm chỉ xuất hiện một lần trong chương trình.');
    return this.db.transaction(async manager => {
      // Use the same product locks as single-product sales; sorted order avoids deadlocks.
      for (const productId of productIds) await manager.query('SELECT pg_advisory_xact_lock($1)',[productId]);
      if (id) {
        const existing = await manager.query('SELECT id FROM orders.flash_sale_campaign WHERE id=$1 FOR UPDATE',[id]);
        if (!existing.length) throw new NotFoundException('Không tìm thấy chương trình.');
      }
      const products = await manager.query('SELECT ma_san_pham,ten_san_pham,gia_ban FROM menu.san_pham WHERE ma_san_pham=ANY($1::int[]) AND trang_thai=true',[productIds]);
      const validated = lines.map(line=>{
        const product = products.find(p=>Number(p.ma_san_pham)===Number(line.product_id));
        if (!product) throw new BadRequestException('Có sản phẩm không còn kinh doanh. Hãy chọn lại món.');
        try {
          return { productId:Number(line.product_id),...validateSale({...body,sale_price:line.sale_price},Number(product.gia_ban)) };
        } catch (error) {
          if (error instanceof BadRequestException) throw new BadRequestException(`“${product.ten_san_pham || `Món #${line.product_id}`}”: ${error.message}`);
          throw error;
        }
      });
      const {start,end} = validated[0];
      const overlaps = await manager.query(`SELECT product_id FROM orders.flash_sale WHERE product_id=ANY($1::int[]) AND enabled=true AND $2::boolean AND starts_at<$4 AND ends_at>$3 AND ($5::int IS NULL OR campaign_id IS DISTINCT FROM $5) LIMIT 1`,[productIds,body.enabled,start,end,id||null]);
      if (overlaps.length) throw new ConflictException('Một món đã có chương trình khác trùng thời gian. Hãy điều chỉnh món hoặc lịch chạy.');
      const values=[body.title.trim().slice(0,200),start,end,body.enabled];
      const result = id
        ? await manager.query('UPDATE orders.flash_sale_campaign SET title=$1,starts_at=$2,ends_at=$3,enabled=$4 WHERE id=$5 RETURNING *',[...values,id])
        : await manager.query('INSERT INTO orders.flash_sale_campaign(title,starts_at,ends_at,enabled) VALUES($1,$2,$3,$4) RETURNING *',values);
      const rows=Array.isArray(result[0])?result[0]:result;
      const campaign=rows[0];
      await manager.query('DELETE FROM orders.flash_sale WHERE campaign_id=$1',[campaign.id]);
      for (const line of validated) await manager.query('INSERT INTO orders.flash_sale(campaign_id,product_id,title,sale_price,starts_at,ends_at,enabled) VALUES($1,$2,$3,$4,$5,$6,$7)',[campaign.id,line.productId,values[0],line.price,start,end,body.enabled]);
      return { item:campaign };
    });
  }

  async deleteCampaign(id: number) {
    await this.db.query('DELETE FROM orders.flash_sale_campaign WHERE id=$1',[id]);
    return { success:true };
  }

  async rankingConfig() {
    const [config] = await this.db.query('SELECT weights,updated_at FROM orders.product_ranking_config WHERE id=1');
    return config || { weights: RANKING_WEIGHTS };
  }
  async saveRanking(weights: any) {
    const valid = Object.fromEntries(Object.keys(RANKING_WEIGHTS).map(key => [key, Number(weights?.[key])]));
    if (Object.values(valid).some(value => !Number.isFinite(value) || value < 0 || value > 100) || !Object.values(valid).some(value => value > 0)) throw new BadRequestException('Trọng số từ 0 đến 100 và phải có ít nhất một tiêu chí lớn hơn 0.');
    await this.db.query('UPDATE orders.product_ranking_config SET weights=$1::jsonb,updated_at=now() WHERE id=1',[JSON.stringify(valid)]);
    return this.rankingConfig();
  }
  async ranking() {
    const config = await this.rankingConfig();
    const rows = await this.db.query(`WITH purchase AS (
      SELECT ct.ma_san_pham, SUM(ct.so_luong)::float total_qty,COUNT(DISTINCT d.ma_don_hang)::float order_count,
        COALESCE(SUM(ct.so_luong) FILTER(WHERE d.ma_voucher IS NOT NULL),0)::float voucher_qty
      FROM orders.chi_tiet_don_hang ct JOIN orders.don_hang d USING(ma_don_hang)
      WHERE d.trang_thai_don_hang='HOAN_THANH' AND d.trang_thai_thanh_toan='DA_THANH_TOAN' AND d.ngay_tao >= now()-interval '90 days' GROUP BY ct.ma_san_pham
    ), rating AS (SELECT ma_san_pham,AVG(so_sao)::float avg_rating,COUNT(*)::float total_reviews FROM orders.danh_gia_san_pham WHERE ngay_tao >= now()-interval '90 days' GROUP BY ma_san_pham),
    favorite AS (SELECT ma_san_pham,COUNT(*)::float favorite_count FROM orders.yeu_thich_san_pham WHERE ngay_tao >= now()-interval '90 days' GROUP BY ma_san_pham)
    SELECT p.*,COALESCE(pu.total_qty,0) total_qty,COALESCE(pu.order_count,0) order_count,COALESCE(pu.voucher_qty,0) voucher_qty,
      COALESCE(r.avg_rating,0) avg_rating,COALESCE(r.total_reviews,0) total_reviews,COALESCE(f.favorite_count,0) favorite_count
    FROM menu.san_pham p LEFT JOIN purchase pu USING(ma_san_pham) LEFT JOIN rating r ON r.ma_san_pham=p.ma_san_pham::text LEFT JOIN favorite f ON f.ma_san_pham=p.ma_san_pham::text WHERE p.trang_thai=true`);
    const weights = { ...RANKING_WEIGHTS,...config.weights };
    const items = rows.map(row => ({ ...row, score: rankingScore(row,weights) })).sort((a,b)=>b.score-a.score || Number(a.ma_san_pham)-Number(b.ma_san_pham));
    return { items, top: items.filter(row=>row.score>0).slice(0,5), weights, period_days: 90, updated_at: config.updated_at };
  }

  async tableMenu(branch: string) {
    const code = String(branch || '').trim().toUpperCase();
    const [store] = await this.db.query("SELECT ma_chi_nhanh,ten_chi_nhanh,dia_chi FROM identity.chi_nhanh WHERE ma_chi_nhanh=$1 AND trang_thai='ACTIVE'", [code]);
    if (!store) throw new NotFoundException('Chi nhánh không tồn tại hoặc đã tạm dừng.');
    const items = await this.db.query(`SELECT p.ma_san_pham,p.ten_san_pham,COALESCE((SELECT MIN(f.sale_price) FROM orders.flash_sale f WHERE f.product_id=p.ma_san_pham AND f.enabled AND f.starts_at<=now() AND f.ends_at>now()),p.gia_ban) AS gia_ban,p.mo_ta,p.hinh_anh_url,p.ma_danh_muc,c.ten_danh_muc
      FROM menu.san_pham p LEFT JOIN menu.danh_muc c ON c.ma_danh_muc=p.ma_danh_muc
      LEFT JOIN inventory.ton_kho_san_pham i ON i.ma_san_pham=p.ma_san_pham AND i.co_so_ma=$1
      WHERE p.trang_thai=true AND COALESCE(i.dang_kinh_doanh,true)=true ORDER BY p.ma_danh_muc,p.ten_san_pham`,[code]);
    return { store, items };
  }

  async tableOrder(body: any) {
    const code = String(body.branch_code || '').trim().toUpperCase(), table = String(body.table_id || '');
    const requestId = String(body.request_id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) || !/^([1-9]|1\d|2[0-5])$/.test(table)) throw new BadRequestException('Liên kết bàn hoặc mã yêu cầu không hợp lệ.');
    const tableLimit=code==='HCM_DIEN_BIEN_PHU'?25:code==='Q1'?20:15;
    if(Number(table)>tableLimit) throw new BadRequestException('Bàn không tồn tại tại chi nhánh này.');
    const lines: any[] = body.items;
    if (!Array.isArray(lines) || !lines.length || lines.length>50 || lines.some(i=>!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>50)) throw new BadRequestException('Số lượng món không hợp lệ.');
    const {items} = await this.tableMenu(code);
    let created = false;
    const order = await this.db.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',[requestId]);
      const orders = manager.getRepository(DonHang);
      const existing = await orders.findOne({where:{ma_don_hang:requestId}});
      if (existing) {
        if(existing.co_so_ma!==code || existing.ma_ban!==table) throw new ConflictException('Mã yêu cầu đã được sử dụng.');
        return existing;
      }
      const normalized = lines.map(line => {
        const product = items.find(p=>Number(p.ma_san_pham)===Number(line.product_id));
        if (!product) throw new BadRequestException('Có món đã ngừng bán. Hãy tải lại thực đơn.');
        return {...product,quantity:line.quantity};
      });
      const total = normalized.reduce((sum,p)=>sum+Number(p.gia_ban)*p.quantity,0);
      const now = new Date().toISOString();
      const saved = await orders.save(orders.create({ma_don_hang:requestId,ma_nguoi_dung:null,co_so_ma:code,ma_ban:table,
        ten_khach_hang:String(body.customer_name || 'Khách tại bàn').trim().slice(0,100),ten_thu_ngan:null,tong_tien:total,
        dia_chi_giao_hang:`Tại bàn ${table}`,loai_don_hang:'DUNG_TAI_CHO',ghi_chu:String(body.note||'').trim().slice(0,1000)||null,
        phuong_thuc_thanh_toan:'THANH_TOAN_KHI_NHAN_HANG',trang_thai_thanh_toan:'CHO_THANH_TOAN_KHI_NHAN_HANG',
        trang_thai_don_hang:'MOI_TAO',lich_su_trang_thai:[{loai:'ORDER',trang_thai:'MOI_TAO',thoi_gian:now,ghi_chu:'Đặt món bằng QR tại bàn'}]}));
      const detailRepo=manager.getRepository(ChiTietDonHang);
      await detailRepo.save(normalized.map(p=>detailRepo.create({ma_don_hang:requestId,ma_san_pham:p.ma_san_pham,ten_san_pham:p.ten_san_pham,gia_ban:Number(p.gia_ban),so_luong:p.quantity,hinh_anh_url:p.hinh_anh_url,toppings:[]})));
      const paymentRepo=manager.getRepository(GiaoDichThanhToan);
      await paymentRepo.save(paymentRepo.create({ma_don_hang:requestId,cong_thanh_toan:'THANH_TOAN_KHI_NHAN_HANG',ma_tham_chieu:`TABLE_${requestId}`,so_tien:total,trang_thai:'CHO_THANH_TOAN'}));
      created = true;
      return saved;
    });
    if (created) {
      await Promise.all([this.cache.deleteByPrefix(`orders:staff:${code}:`),this.cache.deleteByPrefix('orders:staff:ALL:')]);
      this.notifications.guiSuKienDonHangTheoChiNhanh(code,{action:'CREATED',orderId:order.ma_don_hang,status:'MOI_TAO',data:order});
    }
    return { success:true, order:{ma_don_hang:order.ma_don_hang,tong_tien:Number(order.tong_tien),ma_ban:table} };
  }
}
