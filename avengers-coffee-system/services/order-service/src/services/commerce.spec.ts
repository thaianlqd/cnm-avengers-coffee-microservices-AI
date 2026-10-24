import { CommerceService, rankingScore, RANKING_WEIGHTS, validateSale } from './commerce.service';
import { SurveyService } from './survey.service';
import { surveyScope } from '../controllers/survey.controller';
import { DonHang } from '../modules/thanh-toan/entities/don-hang.entity';

describe('commerce management contracts',()=>{
  it('preserves the purchase/voucher/review/favorite scoring formula',()=>{
    expect(rankingScore({total_qty:10,order_count:4,avg_rating:4.5,total_reviews:2,favorite_count:3,voucher_qty:5})).toBe(34.3);
    expect(rankingScore({total_qty:10},{...RANKING_WEIGHTS,purchases:0})).toBe(0);
  });
  it('rejects invalid prices, inverted dates and invalid enabled states',()=>{
    const body={title:'Ưu đãi sáng',sale_price:30000,starts_at:'2026-10-25T07:00:00+07:00',ends_at:'2026-10-25T10:00:00+07:00',enabled:true};
    expect(validateSale(body,45000).price).toBe(30000);
    expect(()=>validateSale({...body,sale_price:45000},45000)).toThrow();
    expect(()=>validateSale({...body,ends_at:body.starts_at},45000)).toThrow();
    expect(()=>validateSale({...body,enabled:'false'},45000)).toThrow();
  });
  it('derives manager survey scope exclusively from the authenticated branch',()=>{
    expect(surveyScope({role:'ADMIN'} as any)).toBeNull();
    expect(surveyScope({role:'MANAGER',branchCode:'hc-01'} as any)).toBe('HC-01');
    expect(()=>surveyScope({role:'MANAGER'} as any)).toThrow();
    expect(()=>surveyScope({role:'STAFF',branchCode:'HC-01'} as any)).toThrow();
  });
  it('does not activate another branch survey and only deactivates forms in its own scope',async()=>{
    const formRepo={findOne:jest.fn().mockResolvedValue(null),update:jest.fn(),save:jest.fn()};
    const service=new SurveyService(formRepo as any,{} as any,{} as any);
    await expect(service.kickHoatBieuMau(7,'HC-01')).rejects.toThrow();
    expect(formRepo.findOne).toHaveBeenLastCalledWith({where:{id:7,co_so_ma:'HC-01'}});
    expect(formRepo.update).not.toHaveBeenCalled();
    formRepo.findOne.mockResolvedValue({id:8,co_so_ma:'HC-01'} as any);
    await service.kickHoatBieuMau(8,'HC-01');
    expect(formRepo.update).toHaveBeenCalledWith({trang_thai:true,co_so_ma:'HC-01'},{trang_thai:false});
  });
  it('assigns a public branch response to its form branch and enforces required answers',async()=>{
    const form={id:3,co_so_ma:'HC-01',trang_thai:true,cau_hoi:[{id:'q1',tieu_de:'Hương vị',loai:'rating',bat_buoc:true}]};
    const responseRepo={save:jest.fn(async r=>r)};
    const service=new SurveyService({findOne:jest.fn().mockResolvedValue(form)} as any,responseRepo as any,{} as any);
    await expect(service.guiPhanHoi({ma_bieu_mau:3,tra_loi:[]})).rejects.toThrow();
    await service.guiPhanHoi({ma_bieu_mau:3,tra_loi:[{cau_hoi_id:'q1',cau_tra_loi:5}]});
    expect(responseRepo.save.mock.calls[0][0].co_so_ma).toBe('HC-01');
  });
  it('rejects an invalid table/order request before any database writes',async()=>{
    const db={transaction:jest.fn()};
    const service=new CommerceService(db as any,{} as any,{} as any);
    await expect(service.tableOrder({table_id:'0',branch_code:'HC-01',request_id:'bad',items:[]})).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});


describe('table ordering persistence', () => {
  it('uses server menu prices and returns the same order on request replay', async () => {
    let saved: any = null;
    const orderRepo = { findOne: jest.fn(async () => saved), create: (r: any) => r, save: jest.fn(async r => (saved = r)) };
    const linesRepo = { create: (r: any) => r, save: jest.fn(async r => r) };
    const manager = { query: jest.fn(), getRepository: (entity: any) => entity === DonHang ? orderRepo : linesRepo };
    const db = { transaction: async (run: any) => run(manager) };
    const cache = { deleteByPrefix: jest.fn() }, notifications = { guiSuKienDonHangTheoChiNhanh: jest.fn() };
    const service = new CommerceService(db as any, notifications as any, cache as any);
    jest.spyOn(service, 'tableMenu').mockResolvedValue({ store: {} as any, items: [{ ma_san_pham: 1, ten_san_pham: 'Cà phê', gia_ban: 45000 }] });
    const body = { request_id: '3402a79e-1f8f-4571-84e3-2650822317f0', branch_code: 'HC-01', table_id: '2', items: [{ product_id: 1, quantity: 2, gia_ban: 1 }] };
    const first = await service.tableOrder(body);
    expect(first.order.tong_tien).toBe(90000);
    expect(saved.ten_thu_ngan).toBeNull();
    expect(await service.tableOrder(body)).toEqual(first);
    expect(orderRepo.save).toHaveBeenCalledTimes(1);
    expect(notifications.guiSuKienDonHangTheoChiNhanh).toHaveBeenCalledTimes(1);
    await expect(service.tableOrder({ ...body, table_id: '3' })).rejects.toThrow();
  });
});


describe('multi-product flash sale campaign',()=>{
  const body={title:'Giờ vàng',starts_at:'2026-11-01T07:00:00+07:00',ends_at:'2026-11-01T10:00:00+07:00',enabled:true,products:[{product_id:1,sale_price:30000},{product_id:2,sale_price:35000}]};
  function fixture(overlap=false){
    const manager={query:jest.fn(async(sql:string,params:any[])=>{
      if(sql.includes('FROM menu.san_pham'))return[{ma_san_pham:1,ten_san_pham:'Phin sữa',gia_ban:'45000.00'},{ma_san_pham:2,ten_san_pham:'Trà sen',gia_ban:'50000.00'}];
      if(sql.includes('SELECT product_id FROM orders.flash_sale'))return overlap?[{product_id:2}]:[];
      if(sql.includes('INSERT INTO orders.flash_sale_campaign'))return[{id:9}];
      if(sql.includes('SELECT id FROM orders.flash_sale_campaign'))return[{id:9}];
      if(sql.includes('UPDATE orders.flash_sale_campaign'))return[[{id:9}],1];
      return[];
    })};
    const db={transaction:async(run:any)=>run(manager)};
    return{service:new CommerceService(db as any,{} as any,{} as any),manager};
  }
  it('saves one schedule with independently validated product prices',async()=>{
    const {service,manager}=fixture();expect((await service.saveCampaign(body)).item.id).toBe(9);
    const writes=manager.query.mock.calls.filter(([sql])=>sql.includes('INSERT INTO orders.flash_sale('));
    expect(writes.map(([,params])=>params.slice(0,4))).toEqual([[9,1,'Giờ vàng',30000],[9,2,'Giờ vàng',35000]]);
  });
  it('validates all prices and overlaps before replacing existing products',async()=>{
    const {service,manager}=fixture();await expect(service.saveCampaign({...body,products:[...body.products.slice(0,1),{product_id:2,sale_price:70000}]},9)).rejects.toThrow('“Trà sen”: Giá flash sale phải thấp hơn giá bán thường 50.000 đ.');
    expect(manager.query.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);
    const second=fixture(true);await expect(second.service.saveCampaign(body,9)).rejects.toThrow('trùng thời gian');
    expect(second.manager.query.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);
  });
  it('can keep existing decimal-valued prices when editing the campaign title',async()=>{
    const {service,manager}=fixture();
    await service.saveCampaign({...body,title:'Trung thu ấm áp',products:[{product_id:1,sale_price:'30000.00'},{product_id:2,sale_price:'35000.00'}]},9);
    const writes=manager.query.mock.calls.filter(([sql])=>sql.includes('INSERT INTO orders.flash_sale('));
    expect(writes.map(([,params])=>params.slice(0,4))).toEqual([[9,1,'Trung thu ấm áp',30000],[9,2,'Trung thu ấm áp',35000]]);
  });
  it('rejects duplicated products and empty programs',async()=>{
    const {service}=fixture();await expect(service.saveCampaign({...body,products:[]})).rejects.toThrow();
    await expect(service.saveCampaign({...body,products:[body.products[0],body.products[0]]})).rejects.toThrow();
  });
});
