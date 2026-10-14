import importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('baseline',Path(__file__).with_name('aws-network-baseline.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class NetworkSafety(unittest.TestCase):
    def test_private_only(self):
        for u in ('http://10.1.1.1:30300','http://172.31.13.1:30300','http://192.168.1.1:30300'):self.assertTrue(m.private_target(u),u)
        for u in ('http://127.0.0.1:30300','http://8.8.8.8:30300','http://10.1.1.1:3000','https://abc.trycloudflare.com','http://user:pass@10.1.1.1:30300','http://10.1.1.1:30300/path'):self.assertFalse(m.private_target(u),u)
    def test_full_array_no_truncation(self):
        route=m.ROUTES[2];item={'ma_chi_nhanh':'x','ten_chi_nhanh':'y'}
        self.assertTrue(m.contract(route,{'items':[item],'total':1}))
        self.assertFalse(m.contract(route,{'items':[item],'total':2}))
        self.assertFalse(m.contract(route,{'items':[item,{}],'total':2}))
        self.assertFalse(m.contract(route,{'items':[],'total':0}))
if __name__=='__main__':unittest.main()
