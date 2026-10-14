import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('diag',Path(__file__).with_name('aws-target-diagnostics.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Counters(unittest.TestCase):
    def test_named_kernel_counters_only(self):
        text='TcpExt: SyncookiesSent ListenOverflows ListenDrops TCPTimeouts\nTcpExt: 99 3 4 5\nIpExt: InNoRoutes\nIpExt: 1\n'
        self.assertEqual(m.tcp_counters(text),{'ListenOverflows':3,'ListenDrops':4,'TCPTimeouts':5})
    def test_malformed_values_not_emitted(self):
        self.assertEqual(m.tcp_counters('TcpExt: ListenDrops\nTcpExt: token-value\n'),{})
if __name__=='__main__':unittest.main()
