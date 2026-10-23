import hashlib,importlib.util,json,os,subprocess,tempfile,unittest
from unittest.mock import MagicMock,patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('private_session',Path(__file__).with_name('aws-private-session.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
RUN='3k-aws-20261016T070000Z-abcdef'
class LifecycleTests(unittest.TestCase):
    def prepare(self,root,budget=1):
        root=Path(root);evidence=root/'evidence';evidence.mkdir()
        (evidence/'projected-cost.json').write_text(json.dumps({'max_projected_usd':budget}))
        return root/'session',evidence

    def test_existing_fleet_blocks_before_local_control_or_launch(self):
        with tempfile.TemporaryDirectory() as root:
            folder,evidence=self.prepare(root)
            with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory',side_effect=ValueError('existing fleet')),patch.object(m.subprocess,'Popen') as popen,patch.object(m.a,'aws') as aws:
                with self.assertRaisesRegex(ValueError,'existing fleet'):m.start(folder,RUN,evidence)
                self.assertFalse(folder.exists());popen.assert_not_called();aws.assert_not_called()

    def test_invalid_budget_and_run_id_rejected_before_inventory(self):
        for budget in (True,0,-1,5.01,float('nan'),float('inf'),'1'):
            with self.subTest(budget=budget),tempfile.TemporaryDirectory() as root:
                folder,evidence=self.prepare(root,budget)
                with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory') as inventory:
                    with self.assertRaisesRegex(ValueError,'budget'):m.start(folder,RUN,evidence)
                    inventory.assert_not_called();self.assertFalse(folder.exists())
        with tempfile.TemporaryDirectory() as root:
            folder,evidence=self.prepare(root)
            with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory') as inventory:
                with self.assertRaisesRegex(ValueError,'RunId'):m.start(folder,'wrong',evidence)
                inventory.assert_not_called()

    def test_runtime_bound_rejected_before_inventory(self):
        for minutes in (True,29,176):
            with self.subTest(minutes=minutes),tempfile.TemporaryDirectory() as root:
                folder,evidence=self.prepare(root)
                with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory') as inventory:
                    with self.assertRaisesRegex(ValueError,'runtime'):m.start(folder,RUN,evidence,runtime_minutes=minutes)
                    inventory.assert_not_called()

    def test_partial_control_start_and_cleanup_failure_never_mark_closed(self):
        for outcome in ('pass','false','exception'):
            with self.subTest(outcome=outcome),tempfile.TemporaryDirectory() as root:
                folder,evidence=self.prepare(root)
                process=MagicMock();process.poll.return_value=0
                def cert(*args,**kwargs):
                    (folder/'controller.key').write_text('synthetic private key')
                    role=folder/'target1';role.mkdir()
                    (role/'0123456789abcdef.stdout').write_text('synthetic join token')
                cleanup=MagicMock(return_value={'pass':outcome=='pass'})
                if outcome=='exception':cleanup.side_effect=RuntimeError('synthetic cleanup failure')
                with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory',return_value={}),patch.object(m,'openssl',side_effect=cert),patch.object(m.subprocess,'Popen',side_effect=[process,OSError('synthetic tunnel failure')]),patch.object(m.a,'cleanup',cleanup):
                    with self.assertRaises(SystemExit if outcome=='pass' else RuntimeError):m.start(folder,RUN,evidence)
                cleanup.assert_called_once_with(RUN);process.terminate.assert_called_once()
                self.assertEqual((folder/'CLOSED').exists(),outcome=='pass')
                self.assertEqual((evidence/'cleanup-failure.json').exists(),outcome!='pass')
                local=json.loads((evidence/'local-control-cleanup.json').read_text())
                self.assertTrue(local['processes_stopped'])
                self.assertEqual(local['aws_cleanup_verified'],outcome=='pass')
                if outcome=='pass':
                    self.assertFalse((folder/'controller.key').exists());self.assertFalse((folder/'token').exists())
                    self.assertFalse((folder/'target1/0123456789abcdef.stdout').exists())

    def test_sigterm_during_setup_runs_finally_cleanup(self):
        with tempfile.TemporaryDirectory() as root:
            folder,evidence=self.prepare(root)
            with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory',return_value={}),patch.object(m,'openssl',side_effect=SystemExit(143)),patch.object(m.a,'cleanup',return_value={'pass':True}) as cleanup:
                with self.assertRaises(SystemExit) as error:m.start(folder,RUN,evidence)
                self.assertEqual(error.exception.code,143);cleanup.assert_called_once_with(RUN)
                self.assertTrue((folder/'CLOSED').exists())
        with self.assertRaises(SystemExit) as error:m.interrupted(15,None)
        self.assertEqual(error.exception.code,143)

class GeneratorAdditionTests(unittest.TestCase):
    def prepare(self,root,limit=3,count=1,adequate=False):
        root=Path(root);folder=root/'session';folder.mkdir();evidence=root/'evidence';evidence.mkdir()
        roles={r:{'id':'i-'+r} for r in ('target1','target2','target3',*('generator'+str(i+1) for i in range(count)))}
        state={'run_id':RUN,'roles':roles,'max_generators':limit,'groups':{},'started_at':m.datetime.datetime.now(m.datetime.timezone.utc).isoformat()}
        (folder/'state.json').write_text(json.dumps(state));(folder/'READY').touch();(folder/'tunnel.log').write_text('https://synthetic.trycloudflare.com')
        proof=root/'analysis.json';proof.write_text(json.dumps({'generator_adequate':adequate,'generator_reasons':[] if adequate else ['generator CPU >=90% for three consecutive intervals']}))
        resources={'instances':[{'InstanceId':v['id'],'State':{'Name':'running'},'Tags':m.a.tags(RUN)} for v in roles.values()]}
        return folder,evidence,proof,resources

    def test_no_addition_without_approval_or_inadequacy(self):
        for limit,count,adequate in [(1,1,False),(3,3,False),(3,1,True)]:
            with self.subTest(limit=limit,count=count,adequate=adequate),tempfile.TemporaryDirectory() as root:
                folder,evidence,proof,resources=self.prepare(root,limit,count,adequate)
                with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m,'launch_instance') as launch:
                    with self.assertRaises(ValueError):m.add_generator(folder,evidence,proof)
                    launch.assert_not_called()

    def test_valid_addition_and_failure_requests_cleanup(self):
        for failed in (False,True):
            with self.subTest(failed=failed),tempfile.TemporaryDirectory() as root:
                folder,evidence,proof,resources=self.prepare(root)
                with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'inventory',return_value=resources),patch.object(m,'launch_instance',return_value={'id':'i-new'}),patch.object(m,'verify_recipient',side_effect=ValueError('bad cert') if failed else None):
                    if failed:
                        with self.assertRaisesRegex(ValueError,'bad cert'):m.add_generator(folder,evidence,proof)
                    else:m.add_generator(folder,evidence,proof)
                self.assertEqual((folder/'FINISH').exists(),failed)
                self.assertIn('generator2',json.loads((folder/'state.json').read_text())['roles'])
                self.assertTrue((evidence/'generator2-inadequacy.json').exists())

    def test_foreign_or_untracked_fleet_cannot_be_extended(self):
        with tempfile.TemporaryDirectory() as root:
            folder,evidence,proof,resources=self.prepare(root)
            resources['instances'].pop()
            with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'inventory',return_value=resources),patch.object(m,'launch_instance') as launch:
                with self.assertRaisesRegex(ValueError,'reconciliation'):m.add_generator(folder,evidence,proof)
                launch.assert_not_called()

class BootstrapTests(unittest.TestCase):
    def test_unicode_console_and_mismatched_certificate(self):
        cert=b'public certificate';console='Ubuntu — boot\nAVENGERS_CERT_SHA256='+hashlib.sha256(cert).hexdigest()+'\n'
        self.assertTrue(m.console_matches_certificate(console,cert))
        self.assertFalse(m.console_matches_certificate(console,b'relay substitute'))
        self.assertFalse(m.console_matches_certificate('',cert))
    def test_encryption_signature_and_tamper(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d)
            for role in ('controller','recipient'):
                m.openssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(d/(role+'.key')),'-out',str(d/(role+'.pem')),'-days','1','-subj','/CN='+role])
            plain=b'private test secret payload'
            encrypted=m.openssl(['cms','-encrypt','-binary','-outform','DER','-aes-256-cbc',str(d/'recipient.pem')],plain)
            self.assertNotIn(plain,encrypted)
            signature=m.openssl(['dgst','-sha256','-sign',str(d/'controller.key')],encrypted)
            (d/'signature').write_bytes(signature)
            (d/'controller.pub').write_bytes(m.openssl(['x509','-pubkey','-noout','-in',str(d/'controller.pem')]))
            args=['dgst','-sha256','-verify',str(d/'controller.pub'),'-signature',str(d/'signature')]
            m.openssl(args,encrypted)
            with self.assertRaises(ValueError):m.openssl(args,encrypted+b'tampered')
            self.assertEqual(plain,m.openssl(['cms','-decrypt','-binary','-inform','DER','-recip',str(d/'recipient.pem'),'-inkey',str(d/'recipient.key')],encrypted))
            with self.assertRaises(ValueError):m.openssl(['cms','-decrypt','-binary','-inform','DER','-recip',str(d/'controller.pem'),'-inkey',str(d/'controller.key')],encrypted)
class WorkloadTests(unittest.TestCase):
    def test_private_target_guard_native_k6(self):
        binary=Path('/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI/.tools/k6/0.57.0/k6')
        if not binary.is_file():self.skipTest('native k6 not available')
        for url,allowed in [('http://172.31.4.18:30300',True),('http://10.0.0.2:30300',True),('http://127.0.0.1:30300',False),('http://8.8.8.8:30300',False),('https://abc.trycloudflare.com',False),('http://172.32.1.1:30300',False),('http://172.31.1.1:3000',False),('http://10.999.1.1:30300',False)]:
            result=subprocess.run([str(binary),'inspect','-e','AWS_PRIVATE_CAPACITY=true','-e','BASE_URL='+url,str(m.ROOT/'load-tests/k6/customer-browse-3k.js')],capture_output=True)
            self.assertEqual(result.returncode==0,allowed,url)
if __name__=='__main__':unittest.main()
