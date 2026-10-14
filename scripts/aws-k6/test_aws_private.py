import hashlib,importlib.util,json,os,subprocess,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('private_session',Path(__file__).with_name('aws-private-session.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
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
