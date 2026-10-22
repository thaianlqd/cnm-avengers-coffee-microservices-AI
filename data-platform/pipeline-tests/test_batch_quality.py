"""Typed quality and bounded materialization; runs in the pinned pipeline image."""
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
from unittest import TestCase
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'pipeline-common'))
import pandas as pd
import batch_runtime as batch
import pipeline_runtime as runtime


class BatchQualityTests(TestCase):
    def frame(self, values):
        return pd.DataFrame({'id':range(len(values)),'money':values})

    def test_invalid_null_negative_and_nonfinite_money_never_become_zero(self):
        for value in ('invalid',None,-1,float('inf'),float('nan')):
            with self.subTest(value=value),self.assertRaises(batch.DataQualityFailure) as caught:
                batch.checked_frame(self.frame([10,value]),'orders',keys=['id'],numeric={'money':0})
            self.assertEqual(caught.exception.checks['invalid_numeric.money'],1)

    def test_actual_zero_and_measured_empty_data_are_distinct_from_failed_checks(self):
        frame,quality=batch.checked_frame(self.frame([0,1]),'orders',numeric={'money':0})
        self.assertEqual(quality['status'],'passed')
        self.assertEqual(frame['money'].tolist(),[0,1])
        _,quality=batch.checked_frame(self.frame([]),'orders',numeric={'money':0})
        self.assertEqual(quality['status'],'no_data')
        self.assertEqual(quality['rejects'],0)

    def test_duplicate_null_keys_and_orphan_references_block_join_fanout(self):
        for frame,kwargs,check in [
            (pd.DataFrame({'id':[1,1]}),{'keys':['id']},'duplicate_keys'),
            (pd.DataFrame({'id':[1,None]}),{'keys':['id']},'null_key.id'),
            (pd.DataFrame({'id':[1,2]}),{'reference':('id',{1})},'orphan_reference.id')]:
            with self.subTest(check=check),self.assertRaises(batch.DataQualityFailure) as caught:
                batch.checked_frame(frame,'fixture',**kwargs)
            self.assertGreater(caught.exception.checks[check],0)

    def test_invalid_required_date_and_missing_column_are_not_silently_dropped(self):
        for frame in (pd.DataFrame({'id':[1]}),pd.DataFrame({'id':[1],'date':['not-a-date']})):
            with self.assertRaises(batch.DataQualityFailure):batch.checked_frame(frame,'orders',dates=['date'])

    def test_combined_chunks_are_bounded_before_full_concatenation(self):
        with patch.object(batch,'MAX_ROWS',3),patch.object(pd,'read_sql',return_value=iter([self.frame([1,2]),self.frame([3,4])])):
            with self.assertRaises(runtime.PipelineContractError):batch.bounded_read_sql('SELECT fixture',object())

    def test_signed_wallet_values_remain_signed_when_contract_has_no_nonnegative_rule(self):
        frame,_=batch.checked_frame(self.frame([-10,20]),'wallet',numeric={'money':None})
        self.assertEqual(frame['money'].tolist(),[-10,20])

    def test_run_identity_requires_timezone_and_never_assumes_host_local_time(self):
        for value in (None,'2026-10-18','2026-10-18T01:00:00'):
            with self.assertRaises((runtime.PipelineContractError,ValueError)):batch.parse_as_of(value)
        self.assertEqual(batch.parse_as_of('2026-10-18T07:00:00+07:00'),datetime(2026,10,18,tzinfo=timezone.utc))
