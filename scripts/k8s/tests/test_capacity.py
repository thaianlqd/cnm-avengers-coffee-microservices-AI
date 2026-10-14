import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('capacity', Path(__file__).resolve().parents[1] / 'capacity.py')
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


class CapacityStabilityTests(unittest.TestCase):
    def setUp(self):
        self.before = {'events': [], 'nodes': [{'conditions': [{'type': 'Ready', 'status': 'True'}]}],
                       'hpa': [{'name': name, 'conditions': [{'type': 'ScalingActive', 'status': 'True'}],
                                'currentMetrics': [{'resource': {'name': 'cpu', 'current': {'averageUtilization': 5}}}]} for name in capacity.HPA],
                       'pods': [{'name': 'gateway-old', 'uid': 'a', 'containers': [
                           {'name': 'api-gateway', 'restartCount': 2, 'state': {},
                            'lastState': {'terminated': {'reason': 'Error', 'exitCode': 137}}}]}]}

    def test_historical_137_is_not_new_oom(self):
        self.assertEqual(capacity.violations(self.before, [self.before]), [])

    def test_restarts_detected_even_when_other_scaled_pods_disappear(self):
        row = copy.deepcopy(self.before)
        row['pods'][0]['containers'][0]['restartCount'] = 3
        self.assertIn('new application container restart', capacity.violations(self.before, [row]))

    def test_new_pod_restart_and_oom_detected(self):
        row = copy.deepcopy(self.before)
        row['pods'][0]['uid'] = 'new'
        row['pods'][0]['containers'][0]['lastState']['terminated']['reason'] = 'OOMKilled'
        self.assertIn('new OOMKilled', capacity.violations(self.before, [row]))

    def test_normal_scale_down_kill_is_not_liveness_restart(self):
        row = copy.deepcopy(self.before)
        row['events'] = [{'uid': 'e', 'reason': 'Killing', 'count': 1, 'message': 'Stopping container api-gateway'}]
        self.assertEqual(capacity.violations(self.before, [row]), [])
        row['events'][0]['message'] = 'Container failed liveness probe, will be restarted'
        self.assertIn('new Killing event', capacity.violations(self.before, [row]))

    def test_missing_metrics_and_node_pressure_reject(self):
        row = copy.deepcopy(self.before)
        row['hpa'][0]['currentMetrics'] = []
        row['nodes'][0]['conditions'].append({'type': 'MemoryPressure', 'status': 'True'})
        self.assertEqual(capacity.violations(self.before, [row]), ['HPA metrics invalid', 'node pressure'])

    def test_stale_metric_with_scaling_inactive_rejects(self):
        row = copy.deepcopy(self.before)
        row['hpa'][0]['conditions'][0]['status'] = 'False'
        self.assertIn('HPA metrics invalid', capacity.violations(self.before, [row]))

    def test_duplicate_compose_application_rejects(self):
        row = copy.deepcopy(self.before)
        row['compose_application_overlap'] = ['ai-service']
        self.assertIn('duplicate Compose application detected', capacity.violations(self.before, [row]))


if __name__ == '__main__':
    unittest.main()
