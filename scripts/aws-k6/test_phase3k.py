"""Cross-phase ownership and fixed data-plane safety checks."""
import importlib.util, pathlib, subprocess, sys, unittest
sys.path.insert(0,str(pathlib.Path(__file__).parent))
path=pathlib.Path(__file__).parent/'phase-3k.py'
spec=importlib.util.spec_from_file_location('phase3k',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class PhaseSafety(unittest.TestCase):
    def test_previous_phase_resources_not_owned(self):
        tags=[{'Key':k,'Value':v} for k,v in {'Project':'avengers-coffee','Purpose':'k6-capacity','ManagedBy':'codex-local','Phase':'5k-qualification','RunId':'one'}.items()]
        self.assertFalse(m.shared.owned(tags,'one'))
    def test_ssh_forwards_loopback_and_uses_fresh_key(self):
        args=m.ssh_args({'folder':'/tmp/synthetic','public_ip':'192.0.2.1'})
        self.assertIn('127.0.0.1:13300:127.0.0.1:18080',args)
        self.assertIn('/tmp/synthetic/temporary-key.pem',args)
        self.assertIn('ExitOnForwardFailure=yes',args)
        self.assertNotIn('ControlMaster=auto',args)
    def test_wrong_session_cannot_cleanup(self):
        with self.assertRaisesRegex(RuntimeError,'ownership'):m.ownership({'run_id':'5k-old'})
    def test_unstable_or_missing_egress_refused_before_launch(self):
        with self.assertRaisesRegex(RuntimeError,'observations'):m.stable_tcp_source({})
        with self.assertRaisesRegex(RuntimeError,'changes'):m.stable_tcp_source({'tcp443_stun_0':'192.0.2.1','tcp443_stun_1':'192.0.2.2','tcp443_stun_2':'192.0.2.1'})
        self.assertEqual(m.stable_tcp_source({'tcp443_stun_'+str(i):'192.0.2.1'for i in range(3)}),'192.0.2.1')
    def test_profile_accepts_forward_and_rejects_other_data_paths(self):
        binary=m.ROOT/'.tools/k6/0.57.0/k6'
        if not binary.exists():self.skipTest('native k6 installer required for profile validation')
        for url,expected in [('http://127.0.0.1:13300',0),('https://synthetic.trycloudflare.com',107),('http://127.0.0.1:3000',107)]:
            p=subprocess.run([str(binary),'inspect','-e','BASE_URL='+url,str(m.ROOT/'load-tests/k6/customer-browse-3k.js')],capture_output=True,text=True)
            self.assertEqual(p.returncode,expected)

if __name__=='__main__':unittest.main()
