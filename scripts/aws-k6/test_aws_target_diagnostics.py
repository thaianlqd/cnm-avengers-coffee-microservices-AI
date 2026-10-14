import importlib.util
import os
import subprocess
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('diag',Path(__file__).with_name('aws-target-diagnostics.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Counters(unittest.TestCase):
    def test_named_kernel_counters_only(self):
        text='TcpExt: SyncookiesSent ListenOverflows ListenDrops TCPTimeouts\nTcpExt: 99 3 4 5\nIpExt: InNoRoutes\nIpExt: 1\n'
        self.assertEqual(m.tcp_counters(text),{'ListenOverflows':3,'ListenDrops':4,'TCPTimeouts':5})
    def test_pod_helper_can_load_pg_via_node_stdin_before_safe_guard(self):
        root=Path(__file__).resolve().parents[2]
        service=root/'avengers-coffee-system/services/menu-service'
        if not (service/'node_modules/pg').exists():self.skipTest('pg dependency unavailable locally')
        script=(Path(__file__).with_name('aws-pod-diagnostics.cjs')).read_bytes()
        env=dict(os.environ,K8S_DEMO_READ_ONLY='true',K8S_DB_MODE='existing')
        result=subprocess.run(['node','-','0','invalid'],input=script,cwd=service,env=env,capture_output=True,timeout=10)
        self.assertEqual(result.returncode,1)
        self.assertEqual(result.stderr,b'')
        self.assertEqual(result.stdout,b'')
    def test_malformed_values_not_emitted(self):
        self.assertEqual(m.tcp_counters('TcpExt: ListenDrops\nTcpExt: token-value\n'),{})
if __name__=='__main__':unittest.main()
