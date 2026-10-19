"""Production cannot select legacy writes, including direct cycle/legacy calls."""
import importlib.util
import os
from pathlib import Path
from unittest import TestCase
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('mode_sync', Path(__file__).resolve().parents[1] / 'data-sync/sync.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class GovernedModeTests(TestCase):
    def test_production_off_missing_and_invalid_refuse_before_any_io(self):
        configs = [ {}, {'DATA_ANALYST_ENV':'production'},
            {'DATA_ANALYST_ENV':'production','DATA_PLATFORM_GOVERNED_INGESTION':'0'},
            {'DATA_ANALYST_ENV':'production','DATA_PLATFORM_GOVERNED_INGESTION':'false'},
            {'DATA_ANALYST_ENV':'invalid','DATA_PLATFORM_GOVERNED_INGESTION':'1'},
            {'DATA_ANALYST_ENV':'development','NODE_ENV':'production','DATA_PLATFORM_GOVERNED_INGESTION':'0'},
            {'DATA_ANALYST_ENV':'test','APP_ENV':'prod','DATA_PLATFORM_GOVERNED_INGESTION':'0'},
            {'DATA_ANALYST_ENV':'staging','DATA_PLATFORM_GOVERNED_INGESTION':'0'}]
        for config in configs:
            with self.subTest(config=config), patch.dict(os.environ,config,clear=True), \
                 patch.object(sync,'wait_for_target_db',side_effect=RuntimeError('unexpected I/O')) as target, patch.object(sync,'wait_for_source_db') as source, \
                 patch.object(sync,'get_target_conn') as connect_target, patch.object(sync,'get_source_conn') as connect_source:
                with self.assertRaisesRegex(ValueError,'ingestion configuration'):sync.main()
                for mock in [target,source,connect_target,connect_source]:mock.assert_not_called()

    def test_production_governed_starts_only_after_profile_validation(self):
        with patch.dict(os.environ,{'DATA_ANALYST_ENV':'production','DATA_PLATFORM_GOVERNED_INGESTION':'1'},clear=True), \
             patch('pipeline_runtime.private_database_profile',return_value=('fixture','inactive')) as profile, \
             patch.object(sync,'wait_for_target_db',side_effect=RuntimeError('startup reached')) as target:
            with self.assertRaisesRegex(RuntimeError,'startup reached'):sync.main()
            profile.assert_called_once();target.assert_called_once()

    def test_explicit_development_legacy_is_allowed(self):
        with patch.dict(os.environ,{'DATA_ANALYST_ENV':'development','DATA_PLATFORM_GOVERNED_INGESTION':'0'},clear=True):
            self.assertFalse(sync.governed_ingestion_enabled())

    def test_direct_cycle_cannot_publish_history_before_configuration_check(self):
        source,target=MagicMock(),MagicMock()
        with patch.dict(os.environ,{'DATA_ANALYST_ENV':'production','DATA_PLATFORM_GOVERNED_INGESTION':'0'},clear=True):
            with self.assertRaises(ValueError):sync.run_sync_cycle(source,target)
            source.cursor.assert_not_called();target.cursor.assert_not_called();target.commit.assert_not_called()
            with patch.object(sync.psycopg2, 'connect') as connect:
                for factory in (sync.get_source_conn, sync.get_target_conn):
                    with self.assertRaises(ValueError):factory()
                connect.assert_not_called()

    def test_direct_legacy_entry_points_refuse_in_production(self):
        for name,args in [('sync_table_full',('orders','demo')),('sync_table_incremental',('orders','demo','updated_at',None))]:
            with self.subTest(name=name),patch.dict(os.environ,{'DATA_ANALYST_ENV':'production','DATA_PLATFORM_GOVERNED_INGESTION':'1'},clear=True):
                source,target=MagicMock(),MagicMock()
                with self.assertRaises(ValueError):getattr(sync,name)(source,target,*args)
                source.cursor.assert_not_called();target.cursor.assert_not_called()
