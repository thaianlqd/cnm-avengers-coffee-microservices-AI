"""Validate one committed Bronze run, transform, publish one immutable Silver run."""
import logging
import pandas as pd

from bronze_ingestion import get_minio, CONTRACT as BRONZE_CONTRACT
from batch_runtime import LayerRun, checked_frame, existing_run, read_frame, run_arguments
from pipeline_runtime import read_manifest, PipelineContractError, fingerprint

logger = logging.getLogger('silver')
BRONZE_BUCKET = 'avengers-bronze'
SILVER_BUCKET = 'avengers-silver'
INPUTS = ['orders','order_items','shipper_deliveries','wallet_transactions','delivery_tracking']
REQUIRED = ['orders_clean','items_clean','orders_enriched','deliveries_clean',
            'wallet_transactions_clean','delivery_tracking_clean']
CONTRACT = {'version':'3.4.0', 'layer':'silver', 'required_outputs':REQUIRED,
            'input_outputs':INPUTS, 'numeric_policy':'reject invalid/null/negative; never coerce to zero',
            'join_policy':'many-to-one order FK; unique keys', 'transform_version':'3.4.0'}


def transform_frames(frames, as_of):
    outputs, quality = {}, {}
    def check(name, frame, **kwargs):
        result, checks = checked_frame(frame, name, **kwargs)
        outputs[name], quality[name] = result, checks
        return result
    if sum(int(frame.memory_usage(index=True, deep=True).sum()) for frame in frames.values()) > 256000000:
        raise PipelineContractError('Combined source frames exceed bounded batch capacity')
    orders = check('orders_clean', frames['orders'], keys=['ma_don_hang'],
                   numeric={'tong_tien':0}, dates=['ngay_tao'])
    for required in ('ma_nguoi_dung','co_so_ma','trang_thai_don_hang','phuong_thuc_thanh_toan'):
        if required not in orders.columns: raise PipelineContractError('Required order business field missing')
    if orders['trang_thai_don_hang'].isna().any():
        raise PipelineContractError('Null order status cannot authorize revenue publication')
    orders['date'] = orders['ngay_tao'].dt.date
    orders['hour'] = orders['ngay_tao'].dt.hour
    orders['month'] = orders['ngay_tao'].dt.strftime('%Y-%m')
    orders['_processed_at'] = as_of.isoformat()
    items = check('items_clean', frames['order_items'], keys=['id'], numeric={'so_luong':1,'gia_ban':0},
                  reference=('ma_don_hang', set(orders['ma_don_hang'])))
    items['line_total'] = items['so_luong']*items['gia_ban']
    items['kich_co'] = items['kich_co'].fillna('Standard') if 'kich_co' in items else 'Standard'
    items['_processed_at'] = as_of.isoformat()
    summary = items.groupby('ma_don_hang').agg(total_items=('so_luong','sum'), line_total=('line_total','sum')).reset_index()
    enriched = orders.merge(summary, on='ma_don_hang', how='left', validate='one_to_one')
    check('orders_enriched', enriched, keys=['ma_don_hang'])
    deliveries = check('deliveries_clean', frames['shipper_deliveries'], keys=['id'],
                       numeric={'delivery_fee':0}, dates=['assigned_at'],
                       reference=('ma_don_hang', set(orders['ma_don_hang'])))
    for column in ('picked_up_at','delivered_at'):
        if column in deliveries:
            raw = deliveries[column]
            values = pd.to_datetime(raw, errors='coerce', utc=True)
            if (raw.notna() & values.isna()).any(): raise PipelineContractError('Invalid optional delivery timestamp')
            deliveries[column] = values
    if 'delivered_at' in deliveries:
        deliveries['delivery_duration_min'] = (deliveries['delivered_at']-deliveries['assigned_at']).dt.total_seconds()/60
        if (deliveries['delivery_duration_min'].dropna()<0).any(): raise PipelineContractError('Negative delivery duration')
    check('wallet_transactions_clean', frames['wallet_transactions'], keys=['id'], numeric={'amount':None}, dates=['created_at'])
    tracking = check('delivery_tracking_clean', frames['delivery_tracking'], keys=['id'], dates=['created_at'],
                     reference=('ma_don_hang', set(orders['ma_don_hang'])))
    # Nullable fee/estimate means not measured. Validate supplied values without
    # filling absent observations with fabricated zeros.
    for column in ('delivery_fee','estimated_minutes'):
        if column in tracking:
            values = pd.to_numeric(tracking[column], errors='coerce')
            invalid = tracking[column].notna() & (values.isna() | (values<0) | ~values.map(lambda x: __import__('math').isfinite(x)))
            if invalid.any(): raise PipelineContractError('Invalid optional logistics value')
            tracking[column] = values
    from pipeline_runtime import fingerprint
    for name, frame in outputs.items():
        frame['_processed_at'] = as_of.isoformat()
        quality[name]['schema_fingerprint'] = fingerprint({str(c):str(t) for c,t in frame.dtypes.items()})
    return outputs, quality


def main(run_id=None, as_of=None, input_run=None):
    s3 = get_minio()
    old = existing_run(s3, SILVER_BUCKET, run_id, as_of, CONTRACT)
    if old is not None:
        if old.get('input_run_id') != input_run: raise PipelineContractError('Existing Silver run has different inputs')
        return old
    if not input_run: raise PipelineContractError('Explicit committed Bronze input run required')
    upstream = read_manifest(s3, BRONZE_BUCKET, input_run, fingerprint(BRONZE_CONTRACT))
    if set(INPUTS)-set(upstream['outputs']): raise PipelineContractError('Required Bronze inputs absent')
    run = LayerRun(s3, SILVER_BUCKET, 'batch.silver', run_id, as_of, CONTRACT,
                   {'bronze': upstream['manifest_fingerprint']})
    run.manifest['input_run_id'] = input_run
    frames = {name: read_frame(s3, BRONZE_BUCKET, upstream, name) for name in INPUTS}
    outputs, quality = transform_frames(frames, run.as_of)
    for name, frame in outputs.items(): run.frame(name, frame, quality[name])
    return run.finish()


if __name__ == '__main__':
    arguments = run_arguments('Governed batch publication')
    try:
        main(**arguments)
    except Exception as error:
        logging.getLogger(__name__).error('Layer failed: %s', type(error).__name__)
        raise SystemExit(1) from None
