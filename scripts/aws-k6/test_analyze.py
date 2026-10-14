import importlib.util, pathlib, unittest
P=pathlib.Path(__file__).parent/'analyze.py';s=importlib.util.spec_from_file_location('analyze',P);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class GeneratorEvidence(unittest.TestCase):
    def test_cpu_uses_delta_not_lifetime_and_excludes_guest_duplicate(self):
        def sample(t,ticks,user,rx):
            return {'observed_at':f'2026-10-14T00:00:{t:02}+00:00','cpu_ticks':ticks,
                'memory_KiB':{'MemAvailable':100},'processes':[{'name':'k6','pid':4,'user_ticks':user,'system_ticks':0,'rss_bytes':200,'fds':30}],
                'network_bytes':{'ens5':{'rx':rx,'tx':0},'lo':{'rx':99999999,'tx':0}}}
        a=sample(0,[1000,0,0,1000,0,0,0,0,1000,0],10000,100)
        b=sample(5,[1500,0,0,1500,0,0,0,0,1500,0],10500,5100)
        o=m.generator([a,b]);self.assertEqual(o['cpu_busy_peak_percent'],50)
        self.assertEqual(o['k6_cpu_peak_core_percent'],100);self.assertEqual(o['network_rx_peak_bytes_s'],1000)
        self.assertEqual(o['k6_fds_peak'],30)
    def test_percentile_interpolates_and_empty_is_not_zero_latency(self):
        self.assertEqual(m.percentile([10,20],.95),19.5);self.assertIsNone(m.percentile([]))
if __name__=='__main__':unittest.main()
