import importlib.util, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('aws_capacity',Path(__file__).with_name('aws-capacity.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
RUN='3k-aws-20261014T070000Z-abcdef'
class OwnershipTests(unittest.TestCase):
    def test_all_tags_required(self):
        self.assertTrue(m.owned({'Tags':m.tags(RUN)},RUN))
        for i in range(5):
            t=m.tags(RUN);t.pop(i);self.assertFalse(m.owned({'Tags':t},RUN))
        self.assertFalse(m.owned({'Tags':m.tags(RUN)},RUN[:-6]+'aaaaaa'))
    def test_run_id_injection_rejected(self):
        for r in ('',RUN+'/',RUN+';echo hello','other-phase'):
            with self.assertRaises(ValueError):m.tags(r)
    def test_cleanup_rejects_foreign_inventory(self):
        with patch.object(m,'inventory',return_value={'instances':[{'Tags':[]}]}),patch.object(m,'aws') as aws:
            with self.assertRaises(ValueError):m.cleanup(RUN)
            aws.assert_not_called()
    def test_cleanup_ignores_terminated_history(self):
        resources={'instances':[{'Tags':m.tags(RUN),'State':{'Name':'terminated'}}],'security_groups':[],'volumes':[],'key_pairs':[]}
        with patch.object(m,'inventory',return_value=resources),patch.object(m,'aws') as aws:
            self.assertTrue(m.cleanup(RUN)['pass']);aws.assert_not_called()
if __name__=='__main__':unittest.main()
