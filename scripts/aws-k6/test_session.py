import importlib.util, pathlib, unittest
from unittest.mock import patch
P=pathlib.Path(__file__).parent/'session.py'
spec=importlib.util.spec_from_file_location('aws_session',P); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Ownership(unittest.TestCase):
    def test_all_tags_and_run_id_required(self):
        tags=[{'Key':k,'Value':v} for k,v in {**m.TAGS,'RunId':'one'}.items()]
        self.assertTrue(m.owned(tags,'one'))
        self.assertFalse(m.owned(tags,'two'))
        for i in range(len(tags)): self.assertFalse(m.owned(tags[:i]+tags[i+1:],'one'))
    def test_empty_success_is_not_api_failure(self):
        import subprocess
        with patch.object(m,'call',return_value=subprocess.CompletedProcess([],0,'')):
            self.assertEqual(m.aws('ec2','delete-security-group'),{})
        with patch.object(m,'call',return_value=subprocess.CompletedProcess([],1,'')):
            self.assertIsNone(m.aws('ec2','delete-security-group',check=False))
    def test_cli_region_profile_fixed(self):
        import subprocess
        with patch.object(m,'call',return_value=subprocess.CompletedProcess([],0,'{}')) as c:
            m.aws('ec2','describe-instances')
            self.assertEqual(c.call_args[0][0][:5],['aws','--profile','avengers-k6','--region','ap-southeast-2'])
    def test_cleanup_does_not_delete_replaced_remote_key(self):
        import tempfile
        calls=[]
        def api(*args,**kwargs):
            calls.append(args)
            return {'describe-instances':{'Reservations':[]},'describe-volumes':{'Volumes':[]},
                'describe-security-groups':{'SecurityGroups':[]},'describe-key-pairs':{'KeyPairs':[{'KeyPairId':'replacement'}]}}[args[1]]
        with tempfile.TemporaryDirectory() as folder,patch.object(m,'aws',side_effect=api):
            with self.assertRaisesRegex(RuntimeError,'identity changed'):
                m.cleanup({'folder':folder,'run_id':'one','key_pair_id':'original'},True)
        self.assertFalse(any(c[1]=='delete-key-pair' for c in calls))
    def test_cleanup_key_lookup_permission_error_is_not_success(self):
        import tempfile
        def api(*args,**kwargs):
            if args[1]=='describe-key-pairs':raise RuntimeError('AccessDenied')
            return {'describe-instances':{'Reservations':[]},'describe-volumes':{'Volumes':[]},'describe-security-groups':{'SecurityGroups':[]}}[args[1]]
        with tempfile.TemporaryDirectory() as folder,patch.object(m,'aws',side_effect=api):
            with self.assertRaisesRegex(RuntimeError,'AccessDenied'):m.cleanup({'folder':folder,'run_id':'one','key_pair_id':'original'},True)
            self.assertFalse((pathlib.Path(folder)/'cleanup.json').exists())
if __name__=='__main__': unittest.main()
