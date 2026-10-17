"""Six-generator support must preserve approval, teardown and validity gates."""
import gzip
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

session=load('extended_session','aws-private-session.py')
merger=load('extended_merge','merge-aws-generators.py')
analyzer=load('extended_analyzer','analyze-aws-capacity.py')
merge_fixture=load('merge_fixture','test_aws_merge.py')
analysis_fixture=load('analysis_fixture','test_aws_analysis.py')
private_fixture=load('private_fixture','test_aws_private.py')


def approved(root):
    plan={'max_projected_usd':3.0,'compute_usd_hour':.1197,'max_compute_usd':1.97505,
          'ebs_reserve_usd':.15,'ipv4_reserve_usd':.10,'transfer_contingency_usd':.65,
          'hard_max_instances':9,'maximum_generators':6,'guest_termination_minutes':110,
          'free_plan_only':True,'instance_type':'m7i-flex.large'}
    approval={'user_approved':True,'approved_additional_credit_usd':3.0,'targets':3,
              'maximum_generators':6,'runtime_minutes':110,'free_plan_only':True,
              'no_plan_or_iam_changes':True,'instance_type':'m7i-flex.large'}
    (root/'projected-cost.json').write_text(json.dumps(plan))
    (root/'authorization.json').write_text(json.dumps(approval))
    return plan,approval


class ExtendedFleet(unittest.TestCase):
    def test_matching_approval_and_cost_bounds(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);plan,_=approved(root)
            session.validate_extended_topology(root,plan,6,110)
            (root/'authorization.json').unlink()
            with self.assertRaisesRegex(ValueError,'approval'):
                session.validate_extended_topology(root,plan,6,110)
            # The legacy topology remains available without a new approval file.
            session.validate_extended_topology(root,{},3,110)

    def test_unapproved_or_changed_scope_blocks_before_any_inventory_or_launch(self):
        for field,value in [('user_approved',False),('maximum_generators',3),
                            ('approved_additional_credit_usd',2),('runtime_minutes',100),
                            ('free_plan_only',False),('targets',4),('instance_type','m7i-flex.xlarge')]:
            with self.subTest(field=field),tempfile.TemporaryDirectory() as d:
                root=Path(d);_,approval=approved(root);approval[field]=value
                (root/'authorization.json').write_text(json.dumps(approval))
                with patch.object(session.subprocess,'check_output',return_value='features_k8s\n'),patch.object(session.a,'require_clean_benchmark_inventory') as inventory,patch.object(session,'launch_instance') as launch:
                    with self.assertRaisesRegex(ValueError,'approval'):
                        session.start(root/'private',private_fixture.RUN,root,6,110)
                    inventory.assert_not_called();launch.assert_not_called()
                    self.assertFalse((root/'private').exists())

    def test_underbudgeted_or_nonfinite_cost_rejected(self):
        for field,value in [('max_compute_usd',1),('ebs_reserve_usd',float('nan')),
                            ('transfer_contingency_usd',2),('hard_max_instances',6),
                            ('compute_usd_hour',True),('free_plan_only',False)]:
            with self.subTest(field=field),tempfile.TemporaryDirectory() as d:
                root=Path(d);plan,_=approved(root);plan[field]=value
                with self.assertRaisesRegex(ValueError,'bounds'):
                    session.validate_extended_topology(root,plan,6,110)

    def test_fourth_and_sixth_additions_still_require_measured_inadequacy(self):
        fixture=private_fixture.GeneratorAdditionTests()
        for count in (3,5):
            with self.subTest(count=count),tempfile.TemporaryDirectory() as d:
                folder,evidence,proof,resources=fixture.prepare(d,limit=6,count=count)
                with patch.object(session.subprocess,'check_output',return_value='features_k8s\n'),patch.object(session.a,'inventory',return_value=resources),patch.object(session,'launch_instance',return_value={'id':'i-new'}),patch.object(session,'verify_recipient'):
                    session.add_generator(folder,evidence,proof)
                self.assertIn('generator'+str(count+1),json.loads((folder/'state.json').read_text())['roles'])
        with tempfile.TemporaryDirectory() as d:
            folder,evidence,proof,_=fixture.prepare(d,limit=6,count=6)
            with patch.object(session.subprocess,'check_output',return_value='features_k8s\n'),patch.object(session,'launch_instance') as launch:
                with self.assertRaisesRegex(ValueError,'limit'):session.add_generator(folder,evidence,proof)
                launch.assert_not_called()

    def test_sixth_generator_private_jobs_removed_after_verified_cleanup(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);approved(root);folder=root/'private'
            def create_key(*args,**kwargs):
                (folder/'controller.key').write_text('synthetic key')
                role=folder/'generator6';role.mkdir()
                for suffix in ('json','stdout','stderr','cms'):
                    (role/('0123456789abcdef.'+suffix)).write_text('synthetic job')
                raise SystemExit(143)
            with patch.object(session.subprocess,'check_output',return_value='features_k8s\n'),patch.object(session.a,'require_clean_benchmark_inventory',return_value={}),patch.object(session,'openssl',side_effect=create_key),patch.object(session.a,'cleanup',return_value={'pass':True}):
                with self.assertRaises(SystemExit):session.start(folder,private_fixture.RUN,root,6,110)
            self.assertTrue((folder/'CLOSED').exists())
            self.assertEqual(list((folder/'generator6').iterdir()),[])
            self.assertFalse((folder/'controller.key').exists())


class SixShardEvidence(unittest.TestCase):
    def test_exact_combined_quantiles_for_six_shards(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);folders=[]
            for i,count in enumerate((167,167,167,167,166,166),1):
                p=root/('generator'+str(i));merge_fixture.shard(p,[i*10]*i)
                meta=json.loads((p/'metadata.json').read_text());meta['vus']=count
                (p/'metadata.json').write_text(json.dumps(meta));folders.append(p)
            summary,meta=merger.merge(folders)
            self.assertEqual(meta['vus'],1000);self.assertEqual(meta['generator_count'],6)
            self.assertEqual(summary['metrics']['http_reqs']['values']['count'],21)
            self.assertEqual(summary['metrics']['http_req_duration']['values']['p(50)'],50)
            self.assertEqual(summary['metrics']['http_req_duration{phase:hold}']['values']['p(95)'],60)
            with self.assertRaisesRegex(ValueError,'duplicate'):merger.merge([folders[0],folders[0]])
            with self.assertRaisesRegex(ValueError,'six'):merger.merge([*folders,folders[0]])

    def prepare(self,root):
        analysis_fixture.fixture(root)
        for i,count in enumerate((167,167,167,167,166,166),1):
            folder=root/('generator'+str(i));folder.mkdir();analysis_fixture.fixture(folder)
            meta=json.loads((folder/'metadata.json').read_text());meta['vus']=count
            (folder/'metadata.json').write_text(json.dumps(meta))
            with gzip.open(folder/'stage-vus.jsonl.gz','rt') as stream:rows=[json.loads(line) for line in stream]
            with gzip.open(folder/'stage-vus.jsonl.gz','wt') as stream:
                for row in rows:row['value']=count;stream.write(json.dumps(row)+'\n')
        meta=json.loads((root/'metadata.json').read_text());meta.update(vus=1000,generator_count=6,start_skew_seconds=0)
        (root/'metadata.json').write_text(json.dumps(meta))

    def test_sixth_generator_cannot_be_hidden(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.prepare(root)
            self.assertEqual(analyzer.analyze(root)['status'],'STABLE PASS')
            rows=[json.loads(line) for line in (root/'generator6/generator.jsonl').read_text().splitlines()]
            for i,row in enumerate(rows):row['cpu_ticks']=[i*1000,0,0,100,0,0,0,0]
            (root/'generator6/generator.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in rows))
            result=analyzer.analyze(root)
            self.assertEqual(result['status'],'INVALID GENERATOR')
            self.assertTrue(any('generator6: generator CPU' in r for r in result['generator_reasons']))
            (root/'generator6').rename(root/'missing')
            with self.assertRaisesRegex(ValueError,'missing generator'):analyzer.analyze(root)

    def test_requested_total_must_equal_all_partitions(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.prepare(root)
            meta=json.loads((root/'metadata.json').read_text());meta['vus']=1001
            (root/'metadata.json').write_text(json.dumps(meta))
            with self.assertRaisesRegex(ValueError,'VUs do not match'):analyzer.analyze(root)

if __name__=='__main__':unittest.main()
