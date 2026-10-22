"""Bounded, read-only province -> store exploration of an owned approved report.

Sales use the existing catalog compiler and result contracts. Network counts are
current store-directory counts, explicitly separate from historical sales.
No model, schema changes, writes, browser SQL, addresses or inferred GPS.
"""
from contextlib import nullcontext
from datetime import date, datetime, timezone
from copy import copy, deepcopy
import json
from fastapi import HTTPException
from sqlglot import exp
from services.analysis_catalog import AnalysisError, AnalysisCatalog
from services.analysis_contract import AnalysisSpec
from services.analysis_query import build_plans, compile_sql, validate_plan, validate_sql, validate_results
from services.analysis_presentation import safe_rows
from services.session_service import get_session
from services.sql_service import execute_read_only
from services.time_resolution_service import resolve_time

NETWORK_LIMIT = 5000
GEO_FILTERS = {'city', 'store', 'store_id', 'store_type', 'reporting_region'}
SALES = ['store_revenue', 'store_aov', 'valid_order_count']


def approved_context(session, owner, revision, catalog):
    if not session or session.owner_id != owner or not session.approved:
        raise HTTPException(404, 'Phiên phân tích đã hết hạn hoặc không thuộc tài khoản này.')
    if revision != session.revision:
        raise HTTPException(409, 'Báo cáo đã thay đổi. Hãy mở bản đồ của phiên hiện tại.')
    if session.schema_fingerprint != catalog.fingerprint:
        raise HTTPException(409, 'Danh mục đã thay đổi. Hãy cập nhật dashboard trước khi khám phá bản đồ.')
    ops = [op for op in session.resolved_operations if op.get('role', 'requested') == 'requested']
    if not ops:
        raise HTTPException(409, 'Báo cáo chưa có phạm vi phân tích đã duyệt.')
    filters = ops[0].get('filters', [])
    if any(f.get('dimension') not in GEO_FILTERS or f.get('operator', 'eq') not in {'eq','in'} for f in filters):
        raise HTTPException(409, 'Bản đồ cửa hàng hỗ trợ phạm vi tỉnh, cửa hàng và loại điểm bán; hãy mở bài toán Bản đồ doanh thu & đơn hàng.')
    key = lambda fs: sorted(json.dumps(f, sort_keys=True, ensure_ascii=False) for f in fs)
    if any(key(op.get('filters', [])) != key(filters) for op in ops):
        raise HTTPException(409, 'Các phần báo cáo có phạm vi khác nhau. Hãy mở một phạm vi chung trước khi khám phá cửa hàng.')
    reference = date.fromisoformat(session.agent_reference_date)
    selected = (session.ui_constraints.get('dashboard_template') or {}).get('selected_period') or session.ui_constraints.get('required_period')
    if selected is not None:
        time = {'kind':'range', **{k:selected[k] for k in ('start','end')}} if selected.get('start') else {'kind':'relative','mode':'all_time'}
    else:
        periods = [resolve_time(op.get('time', {'kind':'relative','mode':'all_time'}), reference, catalog.registry['timezone'])[2] for op in ops]
        if any(p != periods[0] for p in periods):
            raise HTTPException(409, 'Báo cáo có nhiều kỳ. Hãy chọn một kỳ chung cho bản đồ cửa hàng.')
        time = ops[0].get('time', {'kind':'relative','mode':'all_time'})
    scope, _, period = resolve_time(time, reference, catalog.registry['timezone'])
    return filters, reference, scope, period


def _literal(value):
    return exp.Literal.string(str(value)).sql(dialect='postgres')


def inventory_sql(catalog, filters, city=None, store=None, *, directory=False):
    predicates=[]
    for f in filters:
        d=catalog.registry['dimensions'][f['dimension']]
        expression=d.get('expression') or d['table']+'.'+d['column']
        values=f['value'] if f.get('operator') == 'in' else [f['value']]
        if not values:
            predicates.append('FALSE');continue
        predicates.append('('+expression+') IN ('+', '.join(_literal(v) for v in values)+')')
    if city is not None: predicates.append('silver.chi_nhanh.thanh_pho = '+_literal(city))
    if store is not None: predicates.append('silver.chi_nhanh.ma_chi_nhanh = '+_literal(store))
    where=' AND '.join(predicates) or 'TRUE'
    if city is None and not directory:
        return """SELECT thanh_pho AS city, COUNT(*) AS store_count,
            COUNT(*) FILTER (WHERE trang_thai IN ('ACTIVE','HOAT_DONG')) AS active_stores
            FROM silver.chi_nhanh WHERE """+where+' GROUP BY thanh_pho ORDER BY thanh_pho LIMIT 5001'
    from services.store_location_service import coordinate_projection
    coordinates,_=coordinate_projection(catalog)
    return """SELECT ma_chi_nhanh AS store_id, ten_chi_nhanh AS store, thanh_pho AS city,
        loai_diem_ban AS store_type, trang_thai AS status, """+coordinates+"""
        FROM silver.chi_nhanh WHERE """+where+' ORDER BY ma_chi_nhanh LIMIT 5001'


def _compile(catalog, reference, scope, filters, metrics, dimensions=(), kind='aggregate', subject='stores', ranking=None):
    spec=AnalysisSpec(analysis_kind=kind, subject=subject, metrics=metrics, dimensions=list(dimensions), filters=filters,
        time_range=scope, granularity='week', ranking=ranking)
    grounded=catalog.ground(spec,reference)
    plan=build_plans(grounded,catalog)[0]
    verdict=validate_plan(plan,grounded,catalog)
    if not verdict.valid: raise AnalysisError(verdict.category,'Geographic plan rejected')
    sql=compile_sql(plan,grounded,catalog)
    verdict=validate_sql(sql,plan,grounded,catalog)
    if not verdict.valid: raise AnalysisError(verdict.category,'Geographic SQL contract rejected')
    return sql,plan,grounded


def _read(executor, sql, limit=NETWORK_LIMIT):
    result=executor(sql,row_limit=limit)
    if result.get('truncated') or len(result['rows']) > limit:
        raise HTTPException(422,'Phạm vi vượt dung lượng bản đồ; hãy thu hẹp tỉnh hoặc cửa hàng. Kết quả chưa bị cắt bớt.')
    return result


def _summary(rows):
    revenue=sum(float(r.get('revenue') or 0) for r in rows)
    valid=sum(int(r.get('valid_orders') or 0) for r in rows)
    return {'revenue':revenue,'orders':sum(int(r.get('orders') or 0) for r in rows),
        'aov':revenue/valid if valid else None, 'valid_orders':valid,
        'store_count':sum(int(r.get('store_count',1)) for r in rows),
        'active_stores':sum(int(r.get('active_stores',r.get('status') in {'ACTIVE','HOAT_DONG'})) for r in rows)}


def explore(session_id, owner, revision, city=None, store=None, *, catalog=None, executor=execute_read_only):
    from services.metadata_service import get_local_metadata
    from services.query_execution_batch import report_snapshot, data_epoch
    # Job workers and HTTP workers have independent caches. The lightweight
    # preflight may still hold the overlay-only catalog after a cold start;
    # execution must use the same physical metadata loader as AnalysisPipeline.
    catalog=catalog or AnalysisCatalog(get_local_metadata())
    session=get_session(session_id)
    filters,reference,scope,period=approved_context(session,owner,revision,catalog)
    if store and city is None: raise HTTPException(400,'Chọn tỉnh trước khi chọn cửa hàng.')
    for dimension,value in [('city',city),('store_id',store)]:
        if value is None:continue
        for f in filters:
            if f['dimension']==dimension and value not in (f['value'] if f.get('operator')=='in' else [f['value']]):
                raise HTTPException(404,'Tỉnh hoặc cửa hàng không nằm trong phạm vi báo cáo đã duyệt.')
    narrow=[*filters, *([{'dimension':'city','operator':'eq','value':city}] if city is not None else []),
        *([{'dimension':'store_id','operator':'eq','value':store}] if store else [])]
    group=['store']
    # Fixed dependencies of the directory + catalog-owned store/product views.
    tables={'silver.chi_nhanh','silver.don_hang'}
    if store:tables.update(catalog.registry['subjects']['products']['tables'])
    context=report_snapshot(tables) if executor is execute_read_only else nullcontext()
    with context:
        network=safe_rows(_read(executor,inventory_sql(catalog,filters,city,store,directory=True))['rows'])
        if store and not network: raise HTTPException(404,'Cửa hàng không nằm trong tỉnh hoặc phạm vi đã duyệt.')
        bound=catalog
        if city is not None and network:
            # City reference enums cover fewer names than the real directory.
            # Bind ONLY a value proved by an authorized directory SELECT in this
            # very snapshot; never change the shared catalog or guess an alias.
            bound=copy(catalog);bound.registry=deepcopy(catalog.registry);bound.tables=deepcopy(catalog.tables)
            d=bound.registry['dimensions']['city'];d['enum']=list(dict.fromkeys([*d.get('enum',[]),city]))
            for column in bound.tables[d['table']]['columns']:
                if column['name']==d['column'] and column.get('enum_values'):
                    column['enum_values']=list(dict.fromkeys([*column['enum_values'],city]))
        plans={}
        if city is None or network:
            plans={'sales':_compile(bound,reference,scope,narrow,SALES,group),
                'orders':_compile(bound,reference,scope,narrow,['store_order_count'],group)}
            if store:
                plans['trend']=_compile(bound,reference,scope,narrow,['store_revenue'],kind='trend')
                plans['products']=_compile(bound,reference,scope,narrow,['product_revenue','quantity_sold'],['product'],
                    kind='ranking',subject='products',ranking={'metric':'product_revenue','direction':'DESC','top_n':8})
        results={'sales':[],'orders':[]}
        for key,(sql,plan,grounded) in plans.items():
            result=_read(executor,sql)
            verdict=validate_results(result,plan,grounded,bound)
            if not verdict.valid: raise AnalysisError('result_contract','Geographic result contract rejected')
            results[key]=safe_rows(result['rows'])
        epoch=data_epoch.get()
    identity='store_id'
    sales={r[identity]:r for r in results['sales']};orders={r[identity]:r for r in results['orders']}
    rows=[]
    for item in network:
        key=item[identity];money=sales.get(key,{});count=orders.get(key,{})
        from services.store_location_service import store_location
        rows.append({**item,**store_location(item),'label':item['store'],
            'revenue':float(money.get('store_revenue') or 0),'orders':int(count.get('store_order_count') or 0),
            'valid_orders':int(money.get('valid_order_count') or 0),'aov':money.get('store_aov'),
            'has_sales':bool(count.get('store_order_count'))})
    # Directory rows without orders remain present and are never confused with missing stores.
    rows.sort(key=lambda r:(-r['revenue'],str(r[identity])))
    latest=get_session(session_id)
    if not latest or latest.revision != revision or latest.owner_id != owner or not latest.approved:
        raise HTTPException(409,'Báo cáo đã thay đổi khi tải bản đồ.')
    provinces=[]
    if city is None:
        groups={}
        for row in rows:groups.setdefault(row.get('city'),[]).append(row)
        provinces=[{'city':name,'label':name or 'Chưa xác định',**_summary(group)} for name,group in groups.items()]
        provinces.sort(key=lambda row:(-row['revenue'],str(row['city'])))
    return {'session_id':session_id,'revision':revision,'city':city,'store_id':store,'period':period,
        'summary':_summary(rows),'provinces':provinces,'stores':rows,
        'trend':results.get('trend',[]),'products':results.get('products',[]),'provider_calls':0,
        'observed_at':datetime.now(timezone.utc).isoformat(),'data_epoch':epoch,
        'definitions':{'revenue':'Tổng tiền đơn HOAN_THANH và DANG_GIAO trong kỳ.',
            'orders':'Tất cả đơn trong kỳ; AOV chỉ dùng cùng tập đơn với doanh thu.',
            'network':'Số điểm bán hiện có trong danh mục, gồm cả điểm bán không có đơn trong kỳ.',
            'location':'Điểm cửa hàng theo cặp vi_do/kinh_do được ghi trong CSDL; vị trí chưa có hoặc sai tọa độ vẫn nằm trong số liệu và danh sách.'}}
