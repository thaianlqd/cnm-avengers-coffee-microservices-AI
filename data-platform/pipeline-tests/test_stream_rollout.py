"""A fresh worker image must not activate governed writes before rollout."""
import importlib.util
import os
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch,MagicMock


class StreamRolloutTests(TestCase):
    def test_governed_full_cycle_never_attempts_view_ddl_under_replica_role(self):
        root=Path(__file__).resolve().parents[1]
        spec=importlib.util.spec_from_file_location('replica_cycle_test',root/'data-sync/sync.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        source,target=MagicMock(),MagicMock()
        target.cursor.return_value.__enter__.return_value.fetchone.return_value=(1,)
        with patch.dict(os.environ,{'DATA_PLATFORM_GOVERNED_INGESTION':'1','DATA_ANALYST_ENV':'development'}), \
                patch.object(module,'discover_tables',return_value=[]), \
                patch.object(module,'sync_table_governed',return_value=0) as extract, \
                patch.object(module,'create_warehouse_views',side_effect=AssertionError('Governed sync must never issue view DDL')) as ddl:
            module.run_sync_cycle(source,target)
            self.assertEqual(extract.call_count,49)  # 23 v34 + 26 business-coverage sources
            ddl.assert_not_called()

    def test_governed_replica_never_uses_broad_target_credentials_or_connects_without_profile(self):
        root=Path(__file__).resolve().parents[1]
        spec=importlib.util.spec_from_file_location('replica_profile_test',root/'data-sync/sync.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with TemporaryDirectory() as directory,patch.dict(os.environ,{
                'DATA_PLATFORM_GOVERNED_INGESTION':'1','DATA_ANALYST_ENV':'development','DATA_PLATFORM_WAREHOUSE_PROFILE_PATH':directory+'/profile.json'}), \
                patch.object(module.psycopg2,'connect') as connect,patch.object(module,'get_source_conn') as source:
            from pipeline_runtime import PipelineContractError
            with self.assertRaises(PipelineContractError):module.main()
            connect.assert_not_called();source.assert_not_called()
            path=Path(directory)/'profile.json'
            path.write_text(json.dumps({'user':'fixture-replica','password':'inactive-fixture-only'}));path.chmod(0o600)
            module.get_target_conn()
            self.assertEqual(connect.call_args.kwargs['user'],'fixture-replica')
            self.assertEqual(connect.call_args.kwargs['password'],'inactive-fixture-only')

    def test_standby_and_invalid_flag_open_no_clients_and_stop_cleanly(self):
        root=Path(__file__).resolve().parents[1]
        for name in ('producer','consumer'):
            spec=importlib.util.spec_from_file_location('rollout_'+name,root/('kafka-'+name)/(name+'.py'))
            module=importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            clients=('create_producer','get_db_conn') if name=='producer' else ('get_minio','create_consumer','get_db_conn')
            for flag in ('0','invalid'):
                with self.subTest(worker=name,flag=flag),patch.dict(os.environ,{'DATA_PLATFORM_GOVERNED_STREAMING':flag}), \
                     patch.object(module.signal,'signal'),patch.object(module,'running',True), \
                     patch.object(module.time,'sleep',side_effect=lambda _:setattr(module,'running',False)):
                    mocks=[self.enterContext(patch.object(module,key,side_effect=AssertionError('standby must not connect'))) for key in clients]
                    module.main()
                    self.assertTrue(all(m.call_count==0 for m in mocks))

    def test_private_profile_rejects_shared_permissions_symlinks_and_extra_credentials(self):
        from pipeline_runtime import private_database_profile,PipelineContractError
        with TemporaryDirectory() as directory:
            path=Path(directory)/'profile.json'
            with patch.dict(os.environ,{'DATA_PLATFORM_WAREHOUSE_PROFILE_PATH':str(path)}):
                with self.assertRaises(PipelineContractError):private_database_profile()
                path.write_text(json.dumps({'user':'fixture-pipeline','password':'inactive-fixture-only'}));path.chmod(0o600)
                self.assertEqual(private_database_profile()[0],'fixture-pipeline')
                path.chmod(0o644)
                with self.assertRaises(PipelineContractError):private_database_profile()
                path.chmod(0o600);link=Path(directory)/'link';link.symlink_to(path)
                with patch.dict(os.environ,{'DATA_PLATFORM_WAREHOUSE_PROFILE_PATH':str(link)}):
                    with self.assertRaises(PipelineContractError):private_database_profile()
                path.write_text(json.dumps({'user':'fixture','password':'inactive','reader_password':'must-not-mount'}))
                with self.assertRaises(PipelineContractError):private_database_profile()

    def test_enabled_workers_without_private_profile_fail_before_any_network_client(self):
        from pipeline_runtime import PipelineContractError
        root=Path(__file__).resolve().parents[1]
        for name in ('producer','consumer'):
            spec=importlib.util.spec_from_file_location('enabled_'+name,root/('kafka-'+name)/(name+'.py'))
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            client='create_producer' if name=='producer' else 'get_minio'
            with TemporaryDirectory() as directory,patch.dict(os.environ,{'DATA_PLATFORM_GOVERNED_STREAMING':'1',
                'DATA_PLATFORM_WAREHOUSE_PROFILE_PATH':str(Path(directory)/'missing')}), \
                patch.object(module.signal,'signal'),patch.object(module,client) as factory:
                with self.assertRaises(PipelineContractError):module.main()
                factory.assert_not_called()


    def test_producer_survives_transient_source_lock_but_not_other_errors(self):
        root=Path(__file__).resolve().parents[1]
        spec=importlib.util.spec_from_file_location('lock_producer',root/'kafka-producer/producer.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        class Pg(Exception):
            def __init__(self,code):self.pgcode=code
        calls=[]
        def fake(*_):
            calls.append(1)
            if len(calls)==1:raise Pg('55P03')
            module.running=False
            return [dict(published=0,has_more=False)]
        def run(error=None):
            clock = [0.0]
            def advance(seconds): clock[0] += seconds
            with patch.dict(os.environ,{'DATA_PLATFORM_GOVERNED_STREAMING':'1'}),patch.object(module.signal,'signal'), \
                 patch('pipeline_runtime.private_database_profile'),patch.object(module,'create_producer'), \
                 patch.object(module,'get_db_conn',return_value=MagicMock()), \
                 patch.object(module.time,'monotonic',side_effect=lambda:clock[0]), \
                 patch.object(module.time,'sleep',side_effect=advance), \
                 patch.object(module,'fetch_and_publish',side_effect=error or fake):
                module.running=True;module.main()
        run()
        self.assertEqual(len(calls),2)
        with self.assertRaises(Pg):run(Pg('42P01'))
        with self.assertRaises(Pg):run(Pg('XX000'))
        with self.assertRaises(Pg):run(Pg('55P03'))  # persistent lock gives up after the bound
