"""Ephemeral SQLite fixture + separately authored Python measure oracle.

Only generated SELECTs enter SQLite after the production AST guard. PostgreSQL
syntax is translated by the already installed sqlglot. This qualifies algebra
and fixture arithmetic, not PostgreSQL deployment behavior or model semantics.
"""
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta
import json
import math
import sqlglot
from sqlglot import exp

DAY='2026-09-15T10:00:00'
STORES=[dict(ma_chi_nhanh='s1',ten_chi_nhanh='Quán A',thanh_pho='Hồ Chí Minh',loai_diem_ban='STORE'),dict(ma_chi_nhanh='s2',ten_chi_nhanh='Quán B',thanh_pho='Hà Nội',loai_diem_ban='KIOSK')]
PRODUCTS=[dict(ma_san_pham='p1',ten_san_pham='Cà phê A',ma_danh_muc='c1',ten_danh_muc='Cà phê'),dict(ma_san_pham='p2',ten_san_pham='Trà B',ma_danh_muc='c2',ten_danh_muc='Trà')]
ORDERS=[dict(ma_don_hang='o1',ma_nguoi_dung='u1',co_so_ma='s1',tong_tien=100,ma_voucher='v1',so_tien_giam=10,trang_thai_don_hang='HOAN_THANH',loai_don_hang='DUNG_TAI_CHO',ngay_tao='2026-09-01T10:00:00'),dict(ma_don_hang='o2',ma_nguoi_dung='u1',co_so_ma='s1',tong_tien=200,ma_voucher=None,so_tien_giam=0,trang_thai_don_hang='DANG_GIAO',loai_don_hang='GIAO_HANG',ngay_tao='2026-09-15T12:00:00'),dict(ma_don_hang='o3',ma_nguoi_dung='u2',co_so_ma='s2',tong_tien=300,ma_voucher='v1',so_tien_giam=30,trang_thai_don_hang='DA_HUY',loai_don_hang='GIAO_HANG',ngay_tao='2026-09-16T12:00:00'),dict(ma_don_hang='o4',ma_nguoi_dung='u2',co_so_ma='s2',tong_tien=400,ma_voucher='v2',so_tien_giam=40,trang_thai_don_hang='HOAN_THANH',loai_don_hang='MANG_DI',ngay_tao='2026-09-29T18:00:00')]
LINES=[dict(id='l1',ma_don_hang='o1',ma_san_pham='p1',so_luong=2,thanh_tien=100),dict(id='l2',ma_don_hang='o2',ma_san_pham='p2',so_luong=4,thanh_tien=200),dict(id='l3',ma_don_hang='o3',ma_san_pham='p1',so_luong=6,thanh_tien=300),dict(id='l4',ma_don_hang='o4',ma_san_pham='p1',so_luong=8,thanh_tien=400)]
DATA={
 'chi_nhanh':STORES,'san_pham':PRODUCTS,'don_hang':ORDERS,'chi_tiet_don_hang':LINES,
 'danh_muc':[dict(ma_danh_muc='c1',ten_danh_muc='Cà phê'),dict(ma_danh_muc='c2',ten_danh_muc='Trà')],
 'khuyen_mai':[dict(ma_khuyen_mai='v1',ten_khuyen_mai='Ưu đãi A'),dict(ma_khuyen_mai='v2',ten_khuyen_mai='Ưu đãi B')],
 'nguoi_dung':[dict(ma_nguoi_dung='u1',vai_tro='CUSTOMER',tong_chi_tieu=300,ngay_tao=DAY),dict(ma_nguoi_dung='u2',vai_tro='CUSTOMER',tong_chi_tieu=400,ngay_tao=DAY),dict(ma_nguoi_dung='u3',vai_tro='STAFF',tong_chi_tieu=900,ngay_tao=DAY)],
 'giao_dich_thanh_toan':[dict(ma_giao_dich='t1',ma_don_hang='o1',cong_thanh_toan='VNPAY',so_tien=100,trang_thai='THANH_CONG',ngay_tao=DAY),dict(ma_giao_dich='t2',ma_don_hang='o4',cong_thanh_toan='MOMO',so_tien=400,trang_thai='THANH_CONG',ngay_tao=DAY)],
 'shipper':[dict(ma_shipper='d1',tong_chuyen_giao=30,diem_danh_gia=4.5),dict(ma_shipper='d2',tong_chuyen_giao=10,diem_danh_gia=3.5),dict(ma_shipper='d3',tong_chuyen_giao=20,diem_danh_gia=4.0)],
 'ton_kho_san_pham':[dict(id='i1',co_so_ma='s1',ma_san_pham='p1',so_luong_ton=3,muc_canh_bao=5),dict(id='i2',co_so_ma='s2',ma_san_pham='p2',so_luong_ton=20,muc_canh_bao=5)],
 'danh_gia_san_pham':[dict(id='r1',ma_san_pham='p1',ma_nguoi_dung='u1',so_sao=5,ngay_tao=DAY),dict(id='r2',ma_san_pham='p1',ma_nguoi_dung='u2',so_sao=3,ngay_tao=DAY),dict(id='r3',ma_san_pham='p2',ma_nguoi_dung='u1',so_sao=4,ngay_tao=DAY)],
 'danh_gia_chi_nhanh':[dict(id='r1',ma_chi_nhanh='s1',so_sao=5,ngay_tao=DAY),dict(id='r2',ma_chi_nhanh='s2',so_sao=3,ngay_tao=DAY)],
 'ca_lam_viec_nhan_vien':[dict(ma_ca_lam_viec='w1',ten_ca='Sáng',trang_thai_cham_cong='DI_TRE',co_so_ma='s1',ngay_lam_viec='2026-09-15'),dict(ma_ca_lam_viec='w2',ten_ca='Chiều',trang_thai_cham_cong='DUNG_GIO',co_so_ma='s2',ngay_lam_viec='2026-09-15')],
 'ca_doi_soat':[dict(ma_ca='c1',co_so_ma='s1',chenh_lech=-10,tien_mat_he_thong=100,ngay_tao=DAY),dict(ma_ca='c2',co_so_ma='s2',chenh_lech=5,tien_mat_he_thong=400,ngay_tao=DAY)],
 'khao_sat_phan_hoi':[dict(id='f1',co_so_ma='s1',ma_don_hang='o1',ma_nguoi_dung='u1',ngay_tao=DAY),dict(id='f2',co_so_ma='s2',ma_don_hang='o4',ma_nguoi_dung='u2',ngay_tao=DAY)],
 'yeu_thich_san_pham':[dict(id='f1',ma_san_pham='p1',ma_nguoi_dung='u1',ngay_tao=DAY),dict(id='f2',ma_san_pham='p1',ma_nguoi_dung='u2',ngay_tao=DAY),dict(id='f3',ma_san_pham='p2',ma_nguoi_dung='u1',ngay_tao=DAY)]}
DATA['voucher']=DATA['khuyen_mai']


def bucket(unit, value):
    d=datetime.fromisoformat(str(value))
    if unit=='week':d=(d-timedelta(days=d.weekday())).replace(hour=0,minute=0,second=0)
    elif unit=='month':d=d.replace(day=1,hour=0,minute=0,second=0)
    elif unit=='quarter':d=d.replace(month=((d.month-1)//3)*3+1,day=1,hour=0,minute=0,second=0)
    elif unit=='year':d=d.replace(month=1,day=1,hour=0,minute=0,second=0)
    else:d=d.replace(hour=0,minute=0,second=0)
    return d.isoformat()


class FixtureWarehouse:
    def __init__(self, overlay):
        self.connection=sqlite3.connect(':memory:');self.connection.row_factory=sqlite3.Row
        self.connection.execute("ATTACH DATABASE ':memory:' AS silver")
        self.connection.create_function('EVAL_PERIOD',2,bucket)
        for name, table in overlay['silver_tables'].items():
            cols=', '.join('"'+c+'" '+('REAL' if any(t in d.get('type','').lower() for t in ('int','numeric','decimal','double','float')) else 'TEXT') for c,d in table['columns'].items())
            self.connection.execute(f'CREATE TABLE {name} ({cols})')
            for row in DATA.get(name.split('.')[-1],[]):
                names=list(row);self.connection.execute(f"INSERT INTO {name} ({','.join(names)}) VALUES ({','.join('?' for _ in names)})",list(row.values()))
        self.connection.commit();self.connection.execute('PRAGMA query_only=ON');self.call_count=0
    def __call__(self, sql, **kwargs):
        # The pipeline already performs the guard with the grounded plan. The
        # in-memory connection additionally refuses every write at engine level.
        tree=sqlglot.parse_one(sql,read='postgres')
        if not isinstance(tree,exp.Query):raise ValueError('Fixture accepts SELECT only')
        def translate(n):
            if isinstance(n, (exp.DateTrunc, exp.TimestampTrunc)):
                return exp.Anonymous(this='EVAL_PERIOD',expressions=[exp.Literal.string(str(n.args['unit']).strip("'\"").lower()),n.this])
            if isinstance(n, exp.Extract) and str(n.this).upper()=='HOUR':
                return exp.Cast(this=exp.Anonymous(this='STRFTIME',expressions=[exp.Literal.string('%H'),n.expression]),to=exp.DataType.build('INT'))
            return n
        tree=tree.transform(translate)
        query=tree.sql(dialect='sqlite')
        self.call_count+=1;cur=self.connection.execute(query)
        rows=[dict(row) for row in cur.fetchall()]
        return dict(rows=rows,columns=[c[0] for c in cur.description],count=len(rows),truncated=False)
    def close(self):self.connection.close()

# Explicit rules independent of production catalog expressions.
# (source table, value field, reduction, population rule, observation clock)
RULES={
 'revenue':('don_hang','tong_tien','sum','valid','ngay_tao'), 'order_count':('don_hang',None,'count',None,'ngay_tao'),
 'aov':('don_hang','tong_tien','avg','valid','ngay_tao'), 'store_revenue':('don_hang','tong_tien','sum','valid','ngay_tao'),
 'store_order_count':('don_hang',None,'count',None,'ngay_tao'),'store_aov':('don_hang','tong_tien','avg','valid','ngay_tao'),
 'voucher_revenue':('don_hang','tong_tien','sum','voucher_valid','ngay_tao'),'discount_amount':('don_hang','so_tien_giam','sum','voucher_valid','ngay_tao'),
 'voucher_order_count':('don_hang',None,'count','voucher','ngay_tao'),'quantity_sold':('chi_tiet_don_hang','so_luong','sum','valid','order_time'),
 'item_revenue':('chi_tiet_don_hang','thanh_tien','sum','valid','order_time'),'product_revenue':('chi_tiet_don_hang','thanh_tien','sum','valid','order_time'),
 'customer_count':('nguoi_dung','ma_nguoi_dung','distinct','customer','ngay_tao'),'total_spent':('nguoi_dung','tong_chi_tieu','sum','customer',None),
 'payment_count':('giao_dich_thanh_toan',None,'count',None,'ngay_tao'),'payment_revenue':('giao_dich_thanh_toan','so_tien','sum',None,'ngay_tao'),
 'total_deliveries':('shipper','tong_chuyen_giao','sum',None,None),'driver_rating':('shipper','diem_danh_gia','avg',None,None),
 'stock_quantity':('ton_kho_san_pham','so_luong_ton','sum',None,None),'low_stock_count':('ton_kho_san_pham',None,'low',None,None),
 'avg_product_rating':('danh_gia_san_pham','so_sao','avg',None,'ngay_tao'),'review_count':('danh_gia_san_pham',None,'count',None,'ngay_tao'),
 'avg_store_rating':('danh_gia_chi_nhanh','so_sao','avg',None,'ngay_tao'),'store_review_count':('danh_gia_chi_nhanh',None,'count',None,'ngay_tao'),
 'shift_count':('ca_lam_viec_nhan_vien',None,'count',None,'ngay_lam_viec'),'late_count':('ca_lam_viec_nhan_vien',None,'late',None,'ngay_lam_viec'),
 'total_cash_difference':('ca_doi_soat','chenh_lech','sum',None,'ngay_tao'),'system_cash_revenue':('ca_doi_soat','tien_mat_he_thong','sum',None,'ngay_tao'),
 'reconciled_shifts':('ca_doi_soat',None,'count',None,'ngay_tao'),'survey_response_count':('khao_sat_phan_hoi',None,'count',None,'ngay_tao'),
 'favorite_count':('yeu_thich_san_pham',None,'count',None,'ngay_tao'),'hourly_orders':('don_hang',None,'count',None,'ngay_tao'),
 'purchasing_customer_count':('don_hang','ma_nguoi_dung','distinct','valid','ngay_tao')}


def context(row):
    order=next((r for r in ORDERS if r['ma_don_hang']==row.get('ma_don_hang')),row)
    store=next((r for r in STORES if r['ma_chi_nhanh']==row.get('co_so_ma',row.get('ma_chi_nhanh',order.get('co_so_ma')))),{})
    product=next((r for r in PRODUCTS if r['ma_san_pham']==row.get('ma_san_pham')), {})
    promotion=next((r for r in DATA['khuyen_mai'] if r['ma_khuyen_mai']==order.get('ma_voucher')), {})
    return dict(city=store.get('thanh_pho'),store=store.get('ten_chi_nhanh'),store_id=store.get('ma_chi_nhanh'),store_type=store.get('loai_diem_ban'),
        product=product.get('ten_san_pham'),product_id=product.get('ma_san_pham'),category=product.get('ten_danh_muc'),category_id=product.get('ma_danh_muc'),
        promotion=promotion.get('ten_khuyen_mai'),promotion_id=promotion.get('ma_khuyen_mai'),driver_id=row.get('ma_shipper'),
        customer_role=row.get('vai_tro'),order_status=order.get('trang_thai_don_hang'),order_type=order.get('loai_don_hang'),
        payment_gateway=row.get('cong_thanh_toan'),payment_status=row.get('trang_thai'),shift_name=row.get('ten_ca'),hour=int(order.get('ngay_tao',DAY)[11:13]))


def oracle(expected):
    """Recompute expected rows from hand-authored rules and expected semantics."""
    groups=list(expected['group_by']);kind=expected['operation'];metrics=expected['metrics']
    identities={'product':'product_id','store':'store_id'}
    fields=groups+[identities[d] for d in groups if d in identities and identities[d] not in groups]
    if kind=='trend':fields=['period']+fields
    by_group=defaultdict(dict)
    for metric in metrics:
        table,field,reduction,population,clock=RULES[metric];values=defaultdict(list)
        for row in DATA[table]:
            c=context(row)
            if population and 'valid' in population and c['order_status'] not in ('HOAN_THANH','DANG_GIAO'):continue
            if population and 'voucher' in population and not row.get('ma_voucher'):continue
            if population=='customer' and row.get('vai_tro')!='CUSTOMER':continue
            if any(c.get(f['dimension']) not in (f['value'] if isinstance(f['value'],list) else [f['value']]) for f in expected.get('filters',[])):continue
            obs=next(r for r in ORDERS if r['ma_don_hang']==row['ma_don_hang'])['ngay_tao'] if clock=='order_time' else row.get(clock) if clock else None
            period=expected.get('period')
            if period and clock and not period['start'] <= obs[:10] <= period['end']:continue
            if kind=='trend':c['period']=bucket(expected.get('granularity','week'),obs)
            values[tuple(c.get(f) for f in fields)].append(row)
        if not fields and not values:values[()]=[]
        for key,rows in values.items():
            numbers=[r[field] for r in rows if field and r.get(field) is not None]
            v=(len(rows) if reduction=='count' else len(set(numbers)) if reduction=='distinct'
               else sum(r['so_luong_ton']<=r['muc_canh_bao'] for r in rows) if reduction=='low'
               else sum(r['trang_thai_cham_cong']=='DI_TRE' for r in rows) if reduction=='late'
               else round(sum(numbers)/len(numbers),2) if reduction=='avg' and numbers
               else sum(numbers) if numbers else None)
            by_group[key][metric]=v
    rows=[{**dict(zip(fields,key)),**values} for key,values in by_group.items()]
    if kind=='ranking':
        rank=expected.get('ranking') or {'metric':metrics[0],'top_n':10,'direction':'DESC'}
        rows.sort(key=lambda r: ((-1 if rank['direction']=='DESC' else 1)*r[rank['metric']],tuple(str(r.get(f,'')) for f in fields)))
        rows=rows[:rank['top_n']]
    return rows


def result_equal(actual, expected, tolerance=1e-6):
    if len(actual)!=len(expected):return False
    # Identity joins are intentionally present, including duplicated labels.
    def key(r):return tuple((k,str(v)) for k,v in sorted(r.items()) if not isinstance(v,(float,int)))
    left,right=sorted(actual,key=key),sorted(expected,key=key)
    for a,e in zip(left,right):
        if set(a)!=set(e):return False
        for k in e:
            if isinstance(e[k],(float,int)) and isinstance(a[k],(float,int)):
                if not math.isclose(a[k],e[k],rel_tol=tolerance,abs_tol=tolerance):return False
            elif a[k]!=e[k]:return False
    return True
