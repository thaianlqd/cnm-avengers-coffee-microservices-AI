import unittest
from unittest.mock import MagicMock, patch
import sync


class ManualCycleTests(unittest.TestCase):
    def test_manual_reconcile_uses_governed_full_path_once_and_reports_partial_failure(self):
        source,target=MagicMock(),MagicMock()
        target.cursor.return_value.__enter__.return_value.fetchone.return_value=(42,)
        contracts={'identity.chi_nhanh':{'dataset_id':'replica.identity.chi_nhanh'},
                   'orders.don_hang':{'dataset_id':'replica.orders.don_hang'}}
        progress=[]
        with patch.object(sync,'governed_ingestion_enabled',return_value=True), \
             patch.object(sync,'discover_tables',return_value=[]), \
             patch.object(sync,'load_data_contracts',return_value=contracts), \
             patch('pipeline_runtime.extraction_order',return_value=list(contracts)), \
             patch.object(sync,'sync_table_governed',side_effect=[12,TimeoutError()]) as extract, \
             patch.object(sync,'create_warehouse_views',side_effect=AssertionError('No schema evolution')):
            result=sync.run_sync_cycle(source,target,force_reconcile=True,progress=lambda a,b:progress.append((a,b)))
        self.assertEqual(extract.call_count,2)
        self.assertTrue(all(call.kwargs['force_full'] for call in extract.call_args_list))
        self.assertEqual(progress,[(0,2),(1,2)])
        self.assertEqual(result['synced_tables'],1)
        self.assertEqual(result['failed_tables'],1)
        self.assertEqual(result['failures'],[{'source':'orders.don_hang','code':'TimeoutError'}])
        source.rollback.assert_called()
        target.rollback.assert_called()


if __name__=='__main__':unittest.main()
