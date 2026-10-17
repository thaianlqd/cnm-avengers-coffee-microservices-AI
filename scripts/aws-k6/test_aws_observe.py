import importlib.util,json,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('observe',Path(__file__).with_name('aws-observe.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Sampling(unittest.TestCase):
    def run_command(self,*args):
        if args[:2]==('top','nodes'):return 'a 50m 3% 100Mi 1%\nb <unknown> <unknown> <unknown> <unknown>\n'
        if 'top' in args:return 'pod 20m 10Mi\n'
        return '{"items":[]}'
    def test_operation_timings_and_explicit_unknown_metrics(self):
        row=m.collect(self.run_command);self.assertEqual(len(row['operation_ms']),7);self.assertEqual(row['unknown_node_metric_rows'],1);self.assertEqual(row['operation_errors'],{});self.assertNotIn('observer_error',row)
    def test_failure_preserves_failed_operation_without_error_details(self):
        def fail(*args):raise RuntimeError('SECRET SQL token password')
        row=m.collect(fail);self.assertIn('observer_error',row);self.assertEqual(row['operation_errors'],{'get_pods':'command_failed'});self.assertNotIn('SECRET',json.dumps(row));self.assertGreaterEqual(row['sampling_duration_ms'],0)
if __name__=='__main__':unittest.main()
