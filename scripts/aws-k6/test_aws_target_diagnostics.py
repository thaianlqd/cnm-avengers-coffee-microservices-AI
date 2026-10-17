import importlib.util
import os
import subprocess
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('diag',Path(__file__).with_name('aws-target-diagnostics.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Counters(unittest.TestCase):
    def test_namespace_snmp_keeps_numeric_transport_fields_without_addresses(self):
        text='Udp: InDatagrams InErrors RcvbufErrors SndbufErrors Unknown\nUdp: 22 3 4 5 private-token\nTcp: RetransSegs OutRsts\nTcp: 7 8\n'
        self.assertEqual(m.snmp_counters(text),{'Udp/InDatagrams':22,'Udp/InErrors':3,'Udp/RcvbufErrors':4,'Udp/SndbufErrors':5,'Tcp/RetransSegs':7,'Tcp/OutRsts':8})
    def test_socket_state_summary_drops_address_details(self):
        text='sl local_address rem_address st rest\n0: SECRET:1234 PRIVATE:5678 01 other\n1: SECRET:1234 PRIVATE:5678 06 other\n2: SECRET:1234 PRIVATE:5678 06 other\n'
        self.assertEqual(m.socket_states(text),{'ESTABLISHED':1,'TIME_WAIT':2})
    def test_conntrack_aggregates_cpu_hex_counters_only(self):
        text='entries insert_failed drop early_drop secret\n00000020 0000000a 00000001 00000000 PRIVATE\n00000020 00000002 00000003 00000001 PRIVATE\n'
        self.assertEqual(m.conntrack_counters(text),{'insert_failed':12,'drop':4,'early_drop':1})
    def test_optional_missing_metrics_remain_unknown(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(m.conntrack_usage(Path(d)),{'count':None,'max':None})
            self.assertEqual(m.network_namespace(Path(d)),{'snmp':None,'tcp_ext':None,'tcp_states':None})
    def test_interface_totals_are_numbers_without_packet_details(self):
        text='head\nhead\n eth0: 100 2 3 4 0 0 0 0 200 5 6 7 0 0 0 0\n'
        self.assertEqual(m.interface_counters(text)['eth0'],{'rx_bytes':100,'rx_packets':2,'rx_errors':3,'rx_drops':4,'tx_bytes':200,'tx_packets':5,'tx_errors':6,'tx_drops':7})
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
    def test_conntrack_netlink_decimal_counters_are_allowlisted(self):
        text='cpu=0 found=1 invalid=2 insert_failed=3 drop=4 early_drop=5 error=6 search_restart=7 clash_resolve=8 chaintoolong=9 secret=999\ncpu=1 invalid=10 drop=20\nSECRET drop=500\n'
        result=m.conntrack_netlink_counters(text)
        self.assertEqual(result['drop'],24);self.assertEqual(result['invalid'],12);self.assertNotIn('secret',result)
        self.assertIsNone(m.conntrack_netlink_counters('secret=123'))

if __name__=='__main__':unittest.main()
