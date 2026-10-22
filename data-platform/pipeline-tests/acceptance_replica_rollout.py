"""Reviewed replica privileges and atomic snapshot under a separate fixture login."""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

import psycopg2
from psycopg2 import sql
import db
from integration_sync_pg import connect,sync
from tools import deploy_v34_replica as deployment
from pipeline_runtime import valid_load_evidence

ROOT=Path('/workspace')
DATABASE='v34_replica_rollout'
SOURCE='v34_replica_rollout_source'


def fixture_connection(database):
    if os.getenv('V34_PIPELINE_PG_FIXTURE')!='1' or database not in {DATABASE,SOURCE}:
        raise RuntimeError('Isolated replica rollout fixture required')
    return psycopg2.connect(host='127.0.0.1',port=5432,user='postgres',dbname=database)


class ReplicaRolloutPostgresTests(TestCase):
    def test_separate_role_runs_atomic_canary_but_cannot_write_stream_or_create_schema(self):
        admin=connect('postgres',autocommit=True)
        with admin.cursor() as q:
            for name in (DATABASE,SOURCE):
                q.execute('SELECT 1 FROM pg_database WHERE datname=%s',(name,))
                if q.fetchone() is None:q.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        admin.close()
        contracts=json.loads((ROOT/'metadata/runtime_data_contracts.json').read_text())['datasets']
        target=fixture_connection(DATABASE);self.addCleanup(target.close)
        with target.cursor() as q:
            q.execute('CREATE SCHEMA IF NOT EXISTS analytics; CREATE SCHEMA IF NOT EXISTS silver; '
                'CREATE TABLE IF NOT EXISTS analytics.saved_reports(id text PRIMARY KEY,updated_at timestamptz DEFAULT now()); '
                'CREATE TABLE IF NOT EXISTS public.sync_metadata(schema_name text,table_name text,last_synced_at timestamptz,rows_synced bigint,sync_duration_ms bigint,sync_type text,error_message text,PRIMARY KEY(schema_name,table_name)); '
                'CREATE TABLE IF NOT EXISTS public.sync_history(id serial PRIMARY KEY,status text);')
            q.execute((ROOT/'analytics-api/migrations/026_analysis_modules.sql').read_text())
            q.execute((ROOT/'analytics-api/migrations/027_platform_governance.sql').read_text())
            for c in contracts.values():
                schema,table=c['target_table'].split('.')
                q.execute(sql.SQL('CREATE SCHEMA IF NOT EXISTS {}').format(sql.Identifier(schema)))
                columns=[sql.SQL('{} {}').format(sql.Identifier(n),sql.SQL(sync.map_postgres_type(d['data_type'],d['udt_name']))) for n,d in c['columns'].items()]
                if c['primary_key']:columns.append(sql.SQL('PRIMARY KEY ({})').format(sql.SQL(',').join(map(sql.Identifier,c['primary_key']))))
                q.execute(sql.SQL('CREATE TABLE IF NOT EXISTS {} ({})').format(sql.Identifier(schema,table),sql.SQL(',').join(columns)))
            q.execute("TRUNCATE menu.danh_muc; INSERT INTO menu.danh_muc(ma_danh_muc,ten_danh_muc,cap_bac) VALUES(999,'old fixture generation',1)")
        target.commit()
        with target.cursor() as q:
            for name,kind in (('started_at','timestamptz'),('finished_at','timestamptz'),
                    ('total_tables','integer'),('total_rows','bigint'),('error_message','text')):
                q.execute(sql.SQL('ALTER TABLE public.sync_history ADD COLUMN IF NOT EXISTS {} {}').format(
                    sql.Identifier(name),sql.SQL(kind)))
        target.commit()
        suffix=uuid4().hex[:10]
        with TemporaryDirectory() as directory,patch.object(deployment,'GROUP','replica_fixture_'+suffix), \
                patch.object(deployment,'LOGIN','replica_login_'+suffix),patch.object(db,'DB_HOST','127.0.0.1'), \
                patch.object(db,'DB_PORT',5432),patch.object(db,'DB_USER','postgres'), \
                patch.object(db,'DB_PASSWORD',''),patch.object(db,'DB_NAME',DATABASE):
            value=deployment.plan(ROOT);profile=Path(directory)/'profile.json'
            with self.assertRaises(RuntimeError):deployment.apply(value,profile_path=profile)
            self.assertFalse(profile.exists())
            applied=deployment.apply(value,approved=True,profile_path=profile)
            self.assertTrue(applied['applied']);self.assertFalse(applied['worker_activation'])
            self.assertEqual(profile.stat().st_mode&0o777,0o600)
            with target.cursor() as q:
                q.execute('SELECT ma_danh_muc FROM menu.danh_muc');self.assertEqual(q.fetchall(),[(999,)])
            target.rollback()
            replica=psycopg2.connect(host='127.0.0.1',port=5432,user=deployment.LOGIN,dbname=DATABASE)
            self.addCleanup(replica.close)
            # Fresh deployment must match the approved MVCC worker privilege
            # set, without retaining the obsolete exclusive-lock write path.
            with replica.cursor() as q:
                q.execute("SELECT has_table_privilege(current_user, table_name, 'DELETE'), "
                          "has_table_privilege(current_user, table_name, 'TRUNCATE') "
                          "FROM unnest(%s::text[]) AS table_name", (value['target_tables'],))
                privileges = q.fetchall()
                self.assertEqual(len(privileges), len(contracts))
                self.assertTrue(all(can_delete and not can_truncate for can_delete, can_truncate in privileges))
            replica.rollback()
            for statement in ('INSERT INTO analytics.stream_checkpoints VALUES (\'forbidden\',1,\'x\',\'{}\',now())',
                              'CREATE TABLE menu.forbidden(id integer)',
                              "INSERT INTO public.realtime_events(topic,payload) VALUES('forbidden','{}')"):
                with self.subTest(statement=statement),self.assertRaises(psycopg2.errors.InsufficientPrivilege):
                    with replica.cursor() as q:q.execute(statement)
                replica.rollback()
            source_admin=fixture_connection(SOURCE);self.addCleanup(source_admin.close)
            c=contracts['menu.danh_muc']
            with source_admin.cursor() as q:
                q.execute('CREATE SCHEMA IF NOT EXISTS menu')
                columns=[sql.SQL('{} {} {}').format(sql.Identifier(n),sql.SQL(d['data_type']),sql.SQL('' if d['nullable'] else 'NOT NULL')) for n,d in c['columns'].items()]
                columns.append(sql.SQL('PRIMARY KEY(ma_danh_muc)'))
                q.execute(sql.SQL('CREATE TABLE IF NOT EXISTS menu.danh_muc ({})').format(sql.SQL(',').join(columns)))
                q.execute("TRUNCATE menu.danh_muc; INSERT INTO menu.danh_muc(ma_danh_muc,ten_danh_muc,cap_bac) VALUES(1,'new fixture generation',1)")
            source_admin.commit();source_admin.set_session(readonly=True,isolation_level='REPEATABLE READ')
            for _ in range(2):self.assertEqual(sync.sync_table_governed(source_admin,replica,c),1)
            with target.cursor() as q:
                q.execute('SELECT ma_danh_muc FROM menu.danh_muc');self.assertEqual(q.fetchall(),[(1,)])
                q.execute('SELECT generation,schema_fingerprint,completeness,certificate FROM analytics.ingestion_checkpoints WHERE dataset_id=%s',(c['dataset_id'],))
                generation,schema,completeness,proof=q.fetchone()
                self.assertGreaterEqual(generation,2)
                self.assertTrue(valid_load_evidence(proof,c,generation=generation,schema_fingerprint=schema))
                self.assertEqual(proof['snapshot']['kind'],'snapshot_parity')
                self.assertEqual(proof['snapshot']['target']['rows'],1)
                self.assertEqual(completeness,'complete')  # Full measured snapshot, not a closed business period.
                self.assertEqual(proof['closed_periods'],[])
            target.rollback();source_admin.rollback()
            # Run the actual 23-source lifecycle, with only synthetic fixture
            # data (one category, other sources empty). This is not production
            # volume or source completeness evidence.
            source_setup=fixture_connection(SOURCE);self.addCleanup(source_setup.close)
            with source_setup.cursor() as q:
                for contract in contracts.values():
                    schema,table=contract['source_table'].split('.')
                    q.execute(sql.SQL('CREATE SCHEMA IF NOT EXISTS {}').format(sql.Identifier(schema)))
                    for n,d in contract['columns'].items():  # source enums stay enums (USER-DEFINED), like production
                        if d['data_type']=='USER-DEFINED':
                            q.execute(sql.SQL("DO $$ BEGIN CREATE TYPE {} AS ENUM ('FIXTURE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$").format(
                                sql.Identifier(schema,table+'_'+n+'_enum')))
                    fields=[sql.SQL('{} {} {}').format(sql.Identifier(n),sql.Identifier(schema,table+'_'+n+'_enum') if d['data_type']=='USER-DEFINED' else sql.SQL(d['data_type']),
                        sql.SQL('' if d['nullable'] else 'NOT NULL')) for n,d in contract['columns'].items()]
                    if contract['primary_key']:fields.append(sql.SQL('PRIMARY KEY({})').format(
                        sql.SQL(',').join(map(sql.Identifier,contract['primary_key']))))
                    q.execute(sql.SQL('CREATE TABLE IF NOT EXISTS {} ({})').format(sql.Identifier(schema,table),sql.SQL(',').join(fields)))
                    for n,d in contract['columns'].items():  # the fixture source persists between runs
                        if d['data_type']=='USER-DEFINED':
                            enum=sql.Identifier(schema,table+'_'+n+'_enum')
                            q.execute(sql.SQL('ALTER TABLE {} ALTER COLUMN {} TYPE {} USING {}::text::{}').format(
                                sql.Identifier(schema,table),sql.Identifier(n),enum,sql.Identifier(n),enum))
            source_setup.commit()
            with patch.dict(os.environ,{'DATA_ANALYST_ENV':'test','DATA_PLATFORM_GOVERNED_INGESTION':'1'}), \
                    patch.object(sync,'create_warehouse_views',side_effect=AssertionError('No governed view DDL')):
                sync.run_sync_cycle(source_admin,replica)
            with target.cursor() as q:
                q.execute('SELECT total_tables,total_rows,status FROM public.sync_history ORDER BY id DESC LIMIT 1')
                self.assertEqual(q.fetchone(),(len(contracts),1,'success'))
                q.execute('SELECT dataset_id,generation,schema_fingerprint,completeness,certificate FROM analytics.ingestion_checkpoints')
                checkpoints=q.fetchall()
                self.assertEqual({row[0] for row in checkpoints},{contract['dataset_id'] for contract in contracts.values()})
                by_id={contract['dataset_id']:contract for contract in contracts.values()}
                for identity,generation,schema,completeness,proof in checkpoints:
                    self.assertTrue(valid_load_evidence(proof,by_id[identity],generation=generation,schema_fingerprint=schema))
                    self.assertEqual(completeness,proof['completeness'])
                    self.assertEqual(proof['snapshot']['kind'],'snapshot_parity')
