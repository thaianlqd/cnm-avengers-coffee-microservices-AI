"""Existing Bronze/Silver/Gold entrypoints against real isolated PG + MinIO."""
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
import os
import sys
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import pandas as pd
import sqlalchemy

import integration_sync_pg as pg_fixture
import bronze_ingestion as bronze
import silver_transform as silver
import gold_aggregation as gold
import batch_runtime as batch
import pipeline_runtime as runtime


class BatchPublicationIntegrationTests(TestCase):
    @classmethod
    def setUpClass(cls):
        pg_fixture.GovernedSyncPostgresTests.setUpClass()
        cls.s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:9000',
            aws_access_key_id='v34fixture', aws_secret_access_key='v34-fixture-only-pass',
            config=Config(signature_version='s3v4', connect_timeout=2, read_timeout=5,
                          retries={'total_max_attempts':1}))
        for bucket in ('avengers-bronze','avengers-silver','avengers-gold'):
            try: cls.s3.create_bucket(Bucket=bucket)
            except ClientError as error:
                if error.response['Error']['Code'] not in {'BucketAlreadyOwnedByYou','BucketAlreadyExists'}: raise

    def engine(self):
        if os.getenv('V34_PIPELINE_PG_FIXTURE') != '1': raise RuntimeError('Fixture only')
        return sqlalchemy.create_engine('postgresql+psycopg2://postgres:fixture-only@127.0.0.1:5432/v34_target',
                                        connect_args={'connect_timeout':3})

    def setUp(self):
        self.as_of = datetime(2026,10,18,4,tzinfo=timezone.utc)
        self.connection = pg_fixture.connect('v34_target')
        self.addCleanup(self.connection.close)
        with self.connection.cursor() as cursor:
            cursor.execute('CREATE SCHEMA IF NOT EXISTS orders; '
                "DELETE FROM analytics.pipeline_publications WHERE pipeline='daily_medallion'; "
                "DELETE FROM analytics.gold_dataset_versions WHERE pipeline='daily_medallion'; "
                "DELETE FROM analytics.pipeline_runs WHERE pipeline='daily_medallion';")
        self.connection.commit()
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        for module in (bronze,silver,gold):
            self.stack.enter_context(patch.object(module,'get_minio',return_value=self.s3))
        self.stack.enter_context(patch.object(bronze,'get_engine',side_effect=self.engine))
        self.stack.enter_context(patch.object(gold,'get_engine',side_effect=self.engine))
        self.seed()

    def seed(self, *, empty=False, invalid_money=False):
        stamp = self.as_of
        frames = {
            'orders':pd.DataFrame([{'ma_don_hang':'o'+str(i),'ma_nguoi_dung':'u'+str(i) if i<3 else None,
                'co_so_ma':'branch-A','tong_tien':str(amount) if invalid_money else amount,
                'dia_chi_giao_hang':None,'loai_don_hang':'TAI_CHO','phuong_thuc_thanh_toan':'TIEN_MAT',
                'trang_thai_thanh_toan':'DA_THANH_TOAN','trang_thai_don_hang':status,
                'ghi_chu':None,'ngay_tao':stamp,'ngay_cap_nhat':stamp}
                for i,amount,status in [(1,100,'HOAN_THANH'),(2,200,'DANG_GIAO'),(3,900,'DA_XAC_NHAN')]]),
            'order_items':pd.DataFrame([{'id':i,'ma_don_hang':'o'+str(i),'ma_san_pham':i,'ten_san_pham':'coffee',
                'gia_ban':10*i,'so_luong':1,'kich_co':'M'} for i in (1,2,3)]),
            'shipper_deliveries':pd.DataFrame([{'id':'d1','ma_don_hang':'o1','shipper_id':'s1',
                'status':'DELIVERED','delivery_address':None,'delivery_fee':10,
                'assigned_at':stamp,'picked_up_at':stamp+timedelta(minutes=5),'delivered_at':stamp+timedelta(minutes=30)}]),
            'wallet_transactions':pd.DataFrame([{'id':'w1','customer_id':'u1','type':'TOP_UP','amount':50,
                'status':'SUCCESS','created_at':stamp}]),
            'delivery_tracking':pd.DataFrame([{'id':'t1','ma_don_hang':'o1','delivery_method':'INTERNAL',
                'delivery_mode':'SELF','lalamove_status':None,'delivery_fee':10,'estimated_minutes':20,
                'branch_code':'branch-A','created_at':stamp}])}
        if invalid_money: frames['orders'].loc[0,'tong_tien']='invalid-money'
        engine = self.engine()
        try:
            with engine.begin() as connection:
                for name, frame in frames.items():
                    schema, table = bronze.SOURCES[name].split('.')
                    (frame.iloc[:0] if empty else frame).to_sql(table, connection, schema=schema, if_exists='replace',index=False)
        finally: engine.dispose()
        for source in bronze.SOURCES.values():
            with self.connection.cursor() as cursor:
                cursor.execute('INSERT INTO analytics.ingestion_checkpoints '
                    '(dataset_id,generation,source_upper_bound,last_success_at,schema_fingerprint) '
                    'VALUES (%s,1,%s,%s,%s) ON CONFLICT(dataset_id) DO UPDATE SET generation=1,'
                    'source_upper_bound=EXCLUDED.source_upper_bound,last_success_at=EXCLUDED.last_success_at',
                    ('replica.'+source,self.as_of,self.as_of,'a'*64))
        self.connection.commit()

    def run_layers(self, *, identity=None, as_of=None):
        identity, as_of = identity or 'batch_'+uuid4().hex, as_of or self.as_of
        b = bronze.main(identity,as_of)
        s = silver.main(identity,as_of,input_run=b['run_id'])
        g = gold.main(identity,as_of,input_run=s['run_id'])
        return b,s,g

    def pointer(self):
        self.connection.rollback()
        with self.connection.cursor() as cursor:
            cursor.execute("SELECT run_id,manifest_fingerprint FROM analytics.pipeline_publications WHERE pipeline='daily_medallion'")
            return cursor.fetchone()

    def test_all_layers_publish_exact_input_lineage_and_database_matches_object_generation(self):
        b,s,g = self.run_layers()
        self.assertEqual(s['source_runs']['bronze'],b['manifest_fingerprint'])
        self.assertEqual(g['source_runs']['silver'],s['manifest_fingerprint'])
        self.assertEqual(g['publication_quality'],'passed')
        self.assertEqual(g['error_classes'],[])
        self.assertEqual(self.pointer(),(g['run_id'],g['manifest_fingerprint']))
        kpi = __import__('json').loads(runtime.read_verified_artifact(self.s3,'avengers-gold',g,'kpi'))
        self.assertEqual(kpi['revenue_all_time'],300)
        self.assertEqual(kpi['total_orders_all_time'],3)
        health = batch.verify_publication(self.s3,'avengers-gold',g['run_id'],g['manifest_fingerprint'],gold.CONTRACT,self.connection)
        self.assertEqual(health['source_completeness'],'unknown')

    def test_invalid_money_is_a_measured_quality_failure_and_preserves_previous_generation(self):
        _,_,old = self.run_layers()
        self.seed(invalid_money=True)
        identity = 'batch_'+uuid4().hex
        bronze.main(identity,self.as_of)
        with self.assertRaises(batch.DataQualityFailure) as caught:
            silver.main(identity,self.as_of,input_run=identity)
        self.assertEqual(caught.exception.checks['invalid_numeric.tong_tien'],1)
        self.assertEqual(self.pointer()[0],old['run_id'])
        with self.assertRaises(ClientError): runtime.read_manifest(self.s3,'avengers-silver',identity)
        with self.assertRaises(ClientError): gold.main(identity,self.as_of,input_run=identity)

    def test_db_failure_mid_publication_keeps_old_pointer_and_object_run_retries_atomically(self):
        _,_,old = self.run_layers()
        identity = 'batch_'+uuid4().hex
        as_of = self.as_of+timedelta(seconds=1)
        bronze.main(identity,as_of)
        silver.main(identity,as_of,input_run=identity)
        with self.connection.cursor() as cursor:
            cursor.execute("CREATE OR REPLACE FUNCTION analytics.fixture_reject_gold() RETURNS trigger LANGUAGE plpgsql AS $$ "
                "BEGIN IF NEW.dataset_id='top_products' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$; "
                "CREATE TRIGGER fixture_reject_gold BEFORE INSERT ON analytics.gold_dataset_versions "
                "FOR EACH ROW EXECUTE FUNCTION analytics.fixture_reject_gold();")
        self.connection.commit()
        try:
            with self.assertRaises(Exception): gold.main(identity,as_of,input_run=identity)
            self.assertEqual(self.pointer()[0],old['run_id'])
            with self.connection.cursor() as cursor:
                cursor.execute('SELECT count(*) FROM analytics.gold_dataset_versions WHERE run_id=%s',(identity,))
                self.assertEqual(cursor.fetchone()[0],0)
            runtime.read_manifest(self.s3,'avengers-gold',identity)
        finally:
            self.connection.rollback()
            with self.connection.cursor() as cursor: cursor.execute('DROP TRIGGER fixture_reject_gold ON analytics.gold_dataset_versions')
            self.connection.commit()
        final = gold.main(identity,as_of,input_run=identity)
        self.assertEqual(self.pointer(),(identity,final['manifest_fingerprint']))

    def test_full_retry_is_idempotent_and_health_rejects_old_hash_or_different_inputs(self):
        identity = 'batch_'+uuid4().hex
        first = self.run_layers(identity=identity)
        second = self.run_layers(identity=identity)
        self.assertEqual([m['manifest_fingerprint'] for m in first],[m['manifest_fingerprint'] for m in second])
        with self.assertRaises(runtime.PipelineContractError):
            batch.verify_publication(self.s3,'avengers-gold',identity,'0'*64,gold.CONTRACT,self.connection)
        with self.assertRaises(runtime.PipelineContractError): silver.main(identity,self.as_of,input_run='other-run')

    def test_measured_empty_source_has_required_empty_outputs_and_no_sql_fallback(self):
        self.seed(empty=True)
        _,_,g = self.run_layers()
        self.assertEqual(g['outputs']['revenue_daily']['quality_status'],'no_data')
        self.assertEqual(g['outputs']['top_products']['rows'],0)
        self.assertEqual(g['outputs']['customer_segments']['rows'],0)
        self.assertEqual(self.pointer()[0],g['run_id'])
