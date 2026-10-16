import importlib.util, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('aws_capacity',Path(__file__).with_name('aws-capacity.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
RUN='3k-aws-20261014T070000Z-abcdef'
class OwnershipTests(unittest.TestCase):
    def test_prelaunch_checks_all_phases_and_stopped_instances(self):
        def respond(service,action,*args):
            phase=next(x for x in args if x.startswith('Name=tag:Phase,'))
            if action=='describe-instances':
                states=['terminated','stopped'] if '5k-qualification' in phase else ['terminated']
                return {'Reservations':[{'Instances':[{'State':{'Name':s}} for s in states]}]}
            return { {'describe-security-groups':'SecurityGroups','describe-volumes':'Volumes','describe-key-pairs':'KeyPairs'}[action]:[] }
        with patch.object(m,'aws',side_effect=respond) as aws:
            counts=m.benchmark_inventory()
            self.assertEqual(counts['5k-qualification']['instances'],1)
            self.assertEqual(counts['3k-aws']['instances'],0)
            self.assertEqual(aws.call_count,12)
            with self.assertRaisesRegex(ValueError,'reconciliation'):m.require_clean_benchmark_inventory()

    def test_prelaunch_rejects_orphans_and_does_not_mutate_aws(self):
        for resource in ('instances','security_groups','volumes','key_pairs'):
            with patch.object(m,'benchmark_inventory',return_value={'3k-aws':{resource:1}}),patch.object(m,'aws') as aws:
                with self.assertRaises(ValueError):m.require_clean_benchmark_inventory()
                aws.assert_not_called()
        with patch.object(m,'benchmark_inventory',return_value={'3k-aws':{'instances':0}}):
            self.assertEqual(m.require_clean_benchmark_inventory(),{'3k-aws':{'instances':0}})

    def test_all_tags_required(self):
        self.assertTrue(m.owned({'Tags':m.tags(RUN)},RUN))
        for i in range(5):
            t=m.tags(RUN);t.pop(i);self.assertFalse(m.owned({'Tags':t},RUN))
        self.assertFalse(m.owned({'Tags':m.tags(RUN)},RUN[:-6]+'aaaaaa'))
    def test_nodeport_only_generator_no_public_or_all_protocol_ingress(self):
        rules=m.target_ingress('sg-target','sg-generator')
        self.assertEqual([x['UserIdGroupPairs'][0]['GroupId'] for x in rules if x['FromPort']==30300],['sg-generator'])
        self.assertTrue(all(x['IpProtocol'] in ('tcp','udp') and not x.get('IpRanges') for x in rules))
        self.assertNotIn(22,[x['FromPort'] for x in rules])

    def test_run_id_injection_rejected(self):
        for r in ('',RUN+'/',RUN+';echo hello','other-phase'):
            with self.assertRaises(ValueError):m.tags(r)
    def test_cleanup_rejects_foreign_inventory(self):
        with patch.object(m,'inventory',return_value={'instances':[{'Tags':[]}]}),patch.object(m,'aws') as aws:
            with self.assertRaises(ValueError):m.cleanup(RUN)
            aws.assert_not_called()
    def test_cleanup_ignores_terminated_history(self):
        resources={'instances':[{'Tags':m.tags(RUN),'State':{'Name':'terminated'}}],'security_groups':[],'volumes':[],'key_pairs':[]}
        with patch.object(m,'inventory',return_value=resources),patch.object(m,'aws') as aws:
            self.assertTrue(m.cleanup(RUN)['pass']);aws.assert_not_called()
if __name__=='__main__':unittest.main()
