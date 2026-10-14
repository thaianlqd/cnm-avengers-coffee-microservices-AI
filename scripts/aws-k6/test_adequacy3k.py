import datetime as dt,importlib.util,pathlib,unittest
p=pathlib.Path(__file__).parent/'analyze-3k.py';s=importlib.util.spec_from_file_location('adequacy3k',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Coverage(unittest.TestCase):
    def test_full_hold_coverage_and_missing_hold(self):
        start=dt.datetime(2026,10,14,tzinfo=dt.timezone.utc);end=start+dt.timedelta(seconds=120)
        rows=[{'observed_at':(start+dt.timedelta(seconds=n)).isoformat()}for n in range(5,121,5)]
        self.assertTrue(m.hold_coverage(rows,start,end)['sufficient'])
        self.assertFalse(m.hold_coverage([],start,end)['sufficient'])
    def test_enough_samples_cannot_hide_one_long_gap(self):
        start=dt.datetime(2026,10,14,tzinfo=dt.timezone.utc);end=start+dt.timedelta(seconds=120)
        rows=[{'observed_at':(start+dt.timedelta(seconds=n)).isoformat()}for n in range(5,121,5) if n not in [55,60,65]]
        result=m.hold_coverage(rows,start,end)
        self.assertGreaterEqual(result['intervals'],result['expected_intervals']*.8)
        self.assertFalse(result['sufficient'])
if __name__=='__main__':unittest.main()
