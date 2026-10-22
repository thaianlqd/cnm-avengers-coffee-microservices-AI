"""
Bronze Layer: Raw data ingestion from PostgreSQL → MinIO (Parquet)
Reads raw tables and stores as-is in the Bronze bucket.

VERIFIED SCHEMA:
  orders.don_hang: ma_don_hang, ma_nguoi_dung, co_so_ma, tong_tien,
      dia_chi_giao_hang, phuong_thuc_thanh_toan, trang_thai_don_hang, ngay_tao, ...
  orders.chi_tiet_don_hang: id, ma_don_hang, ma_san_pham(int), ten_san_pham,
      gia_ban, so_luong, kich_co, hinh_anh_url
  orders.shipper_delivery: id, ma_don_hang, shipper_id, status,
      assigned_at, picked_up_at, delivered_at, delivery_fee, ...
"""
import os
import io
import logging
from datetime import datetime, timezone

import pandas as pd
import sqlalchemy
import boto3
from botocore.client import Config

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("bronze")

DB_HOST     = os.getenv("DB_HOST", "postgres-db")
DB_PORT     = os.getenv("DB_PORT", "5432")
DB_USER     = os.getenv("DB_USER", "admin")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME     = os.getenv("DB_NAME", "avengers_coffee")

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
BRONZE_BUCKET    = "avengers-bronze"

RUN_DATE = datetime.now().strftime("%Y/%m/%d")


def get_engine():
    user, password = DB_USER, DB_PASSWORD
    if os.getenv('DATA_PLATFORM_GOVERNED_BATCH', '0') == '1':
        # Dedicated minimal batch login; never falls back to the broad legacy env credential.
        from pipeline_runtime import private_database_profile
        user, password = private_database_profile()
    url = sqlalchemy.engine.URL.create('postgresql+psycopg2', username=user, password=password,
        host=DB_HOST, port=int(DB_PORT), database=DB_NAME, query={'sslmode': os.getenv('DB_SSLMODE', 'disable')})
    return sqlalchemy.create_engine(url, connect_args={'connect_timeout': 3,
        'options': '-c statement_timeout=30000 -c lock_timeout=3000'})


def get_minio():
    return boto3.client('s3', endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY, aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version='s3v4', connect_timeout=2, read_timeout=5,
                      retries={'mode': 'standard', 'total_max_attempts': 3}))


# Correct column names verified from entity files
QUERIES = {
    "orders": """
        SELECT
            ma_don_hang::text, ma_nguoi_dung, co_so_ma, tong_tien,
            loai_don_hang, phuong_thuc_thanh_toan,
            trang_thai_thanh_toan, trang_thai_don_hang,
            ngay_tao, ngay_cap_nhat
        FROM orders.don_hang
    """,
    "order_items": """
        SELECT
            id, ma_don_hang::text, ma_san_pham, ten_san_pham,
            gia_ban, so_luong, kich_co
        FROM orders.chi_tiet_don_hang
    """,
    "shipper_deliveries": """
        SELECT
            id::text, ma_don_hang::text, shipper_id::text,
            status, delivery_fee,
            assigned_at, picked_up_at, delivered_at
        FROM orders.shipper_delivery
    """,
    "wallet_transactions": """
        SELECT
            id::text, customer_id::text, type, amount, status, created_at
        FROM orders.customer_wallet_transaction
    """,
    "delivery_tracking": """
        SELECT
            id::text, ma_don_hang::text, delivery_method, delivery_mode,
            lalamove_status, delivery_fee, estimated_minutes, branch_code, created_at
        FROM orders.delivery_tracking
    """,
}



SOURCES = {'orders': 'orders.don_hang', 'order_items': 'orders.chi_tiet_don_hang',
           'shipper_deliveries': 'orders.shipper_delivery', 'wallet_transactions': 'orders.customer_wallet_transaction',
           'delivery_tracking': 'orders.delivery_tracking'}
CONTRACT = {'version': '3.4.0', 'layer': 'bronze', 'required_outputs': list(QUERIES),
            'queries': QUERIES, 'sources': SOURCES, 'row_limit': 200000, 'frame_byte_limit': 256000000}


def main(run_id=None, as_of=None, input_run=None):
    from batch_runtime import LayerRun, bounded_read_sql, existing_run
    from pipeline_runtime import PipelineContractError, fingerprint
    if input_run is not None:
        raise PipelineContractError('Bronze reads a warehouse snapshot, not another batch run')
    s3 = get_minio()
    old = existing_run(s3, BRONZE_BUCKET, run_id, as_of, CONTRACT)
    if old is not None: return old
    engine = get_engine()
    try:
        with engine.connect().execution_options(isolation_level='REPEATABLE READ') as connection:
            with connection.begin():
                connection.execute(sqlalchemy.text('SET TRANSACTION READ ONLY'))
                start = connection.execute(sqlalchemy.text('SELECT clock_timestamp()')).scalar()
                checkpoints = {}
                for source in SOURCES.values():
                    row = connection.execute(sqlalchemy.text('SELECT generation,source_upper_bound,schema_fingerprint,'
                        'last_success_at,completeness FROM analytics.ingestion_checkpoints WHERE dataset_id=:dataset'),
                        {'dataset': 'replica.'+source}).mappings().first()
                    if row is None or row['generation'] < 1:
                        raise PipelineContractError('Required replica has no governed source checkpoint')
                    checkpoints[source] = {key: value.isoformat() if isinstance(value, datetime) else value
                                           for key,value in row.items()}
                run = LayerRun(s3, BRONZE_BUCKET, 'batch.bronze', run_id, as_of, CONTRACT,
                               {key: fingerprint(value) for key,value in checkpoints.items()})
                run.manifest['source_checkpoints'] = checkpoints
                run.manifest['source_snapshot_started_at'] = start.isoformat()
                for name, query in QUERIES.items():
                    frame = bounded_read_sql(query, connection)
                    frame['_ingested_at'] = run.as_of.isoformat()
                    quality = {'status': 'no_data' if frame.empty else 'passed', 'rows': len(frame),
                               'scope': 'extraction only; business row checks run in Silver',
                               'schema_fingerprint': fingerprint({str(c): str(t) for c,t in frame.dtypes.items()})}
                    run.frame(name, frame, quality)
                run.manifest['source_snapshot_finished_at'] = connection.execute(sqlalchemy.text('SELECT clock_timestamp()')).scalar().isoformat()
        return run.finish()
    finally:
        engine.dispose()


if __name__ == '__main__':
    from batch_runtime import run_arguments
    arguments = run_arguments('Governed batch publication')
    try:
        main(**arguments)
    except Exception as error:
        logging.getLogger(__name__).error('Layer failed: %s', type(error).__name__)
        raise SystemExit(1) from None
