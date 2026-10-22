"""Explicit stream grants and private credentials on isolated PostgreSQL only."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

import psycopg2
from psycopg2 import sql
import db
from integration_sync_pg import connect
from tools import deploy_v34_streaming as deployment


class StreamingRolloutPostgresTests(TestCase):
    def test_exact_grants_allow_stream_projection_but_no_private_read_truncate_or_ddl(self):
        if os.getenv('V34_PIPELINE_PG_FIXTURE')!='1':raise RuntimeError('Isolated fixture required')
        admin=connect('postgres',autocommit=True)
        with admin.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_database WHERE datname='v34_target'")
            if cursor.fetchone() is None:cursor.execute('CREATE DATABASE v34_target')
            cursor.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='avengers_pipeline_writer') THEN CREATE ROLE avengers_pipeline_writer NOLOGIN; END IF; END $$")
            cursor.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='v34_stream_pipeline') THEN CREATE ROLE v34_stream_pipeline LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE IN ROLE avengers_pipeline_writer; END IF; END $$")
        admin.close()
        value=deployment.plan(Path('/workspace'))
        connection=connect('v34_target')
        with connection.cursor() as cursor:
            cursor.execute('CREATE SCHEMA IF NOT EXISTS orders')
            for name,fields in value['source_projections'].items():
                schema,table=name.split('.')
                columns=[sql.SQL('{} text').format(sql.Identifier(field)) for field in fields]
                cursor.execute(sql.SQL('CREATE TABLE IF NOT EXISTS {} ({})').format(
                    sql.Identifier(schema,table),sql.SQL(',').join(columns)))
                for field in fields:
                    cursor.execute(sql.SQL('ALTER TABLE {} ADD COLUMN IF NOT EXISTS {} text').format(
                        sql.Identifier(schema,table),sql.Identifier(field)))
                cursor.execute(sql.SQL('ALTER TABLE {} ADD COLUMN IF NOT EXISTS private_fixture_note text').format(sql.Identifier(schema,table)))
            cursor.execute('CREATE TABLE IF NOT EXISTS public.realtime_events (id bigserial PRIMARY KEY,topic text NOT NULL,event_key text,event_type text,payload jsonb NOT NULL,received_at timestamptz DEFAULT now(),kafka_partition integer,kafka_offset bigint,event_id varchar(64))')
        connection.commit();connection.close()
        with TemporaryDirectory() as directory, \
            patch.object(db,'connection_credentials',return_value=('v34_stream_pipeline','inactive-fixture-only')), \
            patch.object(db,'DB_HOST','127.0.0.1'),patch.object(db,'DB_PORT',5432), \
            patch.object(db,'DB_NAME','v34_target'),patch.object(db,'DB_USER','postgres'),patch.object(db,'DB_PASSWORD',''):
            profile=Path(directory)/'warehouse-pipeline.json'
            with self.assertRaises(RuntimeError):deployment.apply(value,profile_path=profile)
            self.assertFalse(profile.exists())
            applied=deployment.apply(value,approved=True,profile_path=profile)
            self.assertTrue(applied['applied']);self.assertEqual(profile.stat().st_mode&0o777,0o600)
            from pipeline_runtime import private_database_profile
            with patch.dict(os.environ,{'DATA_PLATFORM_WAREHOUSE_PROFILE_PATH':str(profile)}):
                self.assertEqual(private_database_profile()[0],'v34_stream_pipeline')
            pipeline=psycopg2.connect(host='127.0.0.1',port=5432,user='v34_stream_pipeline',dbname='v34_target')
            try:
                with pipeline.cursor() as cursor:
                    for name,fields in value['source_projections'].items():
                        cursor.execute(sql.SQL('SELECT {} FROM {} LIMIT 0').format(
                            sql.SQL(',').join(map(sql.Identifier,fields)),sql.Identifier(*name.split('.'))))
                    cursor.execute("INSERT INTO public.realtime_events(topic,payload) VALUES ('fixture-rollout','{}'::jsonb)")
                pipeline.rollback()
                for statement in ('SELECT private_fixture_note FROM orders.don_hang',
                                  'TRUNCATE orders.don_hang','CREATE TABLE orders.forbidden_fixture(id integer)'):
                    with self.subTest(statement=statement),self.assertRaises(psycopg2.errors.InsufficientPrivilege):
                        with pipeline.cursor() as cursor:cursor.execute(statement)
                    pipeline.rollback()
            finally:pipeline.close()
