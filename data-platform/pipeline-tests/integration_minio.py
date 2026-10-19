"""Real conditional writes against task-owned, network-none MinIO only."""
from copy import deepcopy
import os
from unittest import TestCase

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import pipeline_runtime as runtime
import stream_runtime as stream


class MinioPublicationTests(TestCase):
    @classmethod
    def setUpClass(cls):
        if os.getenv('V34_PIPELINE_PG_FIXTURE') != '1':
            raise RuntimeError('Explicit network-none pipeline fixture required')
        cls.s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:9000',
            aws_access_key_id='v34fixture', aws_secret_access_key='v34-fixture-only-pass',
            config=Config(signature_version='s3v4', connect_timeout=2, read_timeout=5,
                          retries={'total_max_attempts': 1}))
        cls.bucket = 'v34-fixture-publication'
        try: cls.s3.create_bucket(Bucket=cls.bucket)
        except ClientError as error:
            if error.response['Error']['Code'] not in {'BucketAlreadyOwnedByYou', 'BucketAlreadyExists'}: raise

    def setUp(self):
        self.run = runtime.start_run('silver.fixture', 'a'*64, {'replica.fixture': 'generation-1'})

    def test_sdk_and_actual_minio_enforce_put_if_absent(self):
        key = 'condition/'+self.run['run_id']
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=b'first', IfNoneMatch='*')
        with self.assertRaises(ClientError) as caught:
            self.s3.put_object(Bucket=self.bucket, Key=key, Body=b'overwritten', IfNoneMatch='*')
        self.assertEqual(caught.exception.response['ResponseMetadata']['HTTPStatusCode'], 412)
        self.assertEqual(self.s3.get_object(Bucket=self.bucket, Key=key)['Body'].read(), b'first')

    def test_committed_run_and_artifact_readback_and_identical_retry(self):
        output = runtime.put_verified_artifact(self.s3, self.bucket, self.run, 'orders', b'fixture-data', rows=3)
        self.assertEqual(output, runtime.put_verified_artifact(self.s3, self.bucket, self.run, 'orders', b'fixture-data', rows=3))
        committed = runtime.finalize_run(self.run, {'orders': output}, ['orders'])
        key = runtime.publish_manifest(self.s3, self.bucket, committed)
        self.assertEqual(key, runtime.publish_manifest(self.s3, self.bucket, committed))
        manifest = runtime.read_manifest(self.s3, self.bucket, self.run['run_id'], 'a'*64)
        self.assertEqual(runtime.read_verified_artifact(self.s3, self.bucket, manifest, 'orders'), b'fixture-data')

    def test_retry_cannot_overwrite_other_bytes_or_other_manifest(self):
        output = runtime.put_verified_artifact(self.s3, self.bucket, self.run, 'orders', b'original', rows=1)
        with self.assertRaises(runtime.PipelineContractError):
            runtime.put_verified_artifact(self.s3, self.bucket, self.run, 'orders', b'modified', rows=1)
        committed = runtime.finalize_run(self.run, {'orders': output}, ['orders'])
        runtime.publish_manifest(self.s3, self.bucket, committed)
        changed = deepcopy(committed)
        changed['outputs']['orders']['rows'] = 2
        changed.pop('manifest_fingerprint')
        changed['manifest_fingerprint'] = runtime.fingerprint(changed)
        with self.assertRaises(runtime.PipelineContractError): runtime.publish_manifest(self.s3, self.bucket, changed)

    def test_staged_partial_outputs_cannot_be_read_as_committed(self):
        runtime.put_verified_artifact(self.s3, self.bucket, self.run, 'orders', b'data', rows=1)
        with self.assertRaises(ClientError) as caught:
            runtime.read_manifest(self.s3, self.bucket, self.run['run_id'])
        self.assertEqual(caught.exception.response['ResponseMetadata']['HTTPStatusCode'], 404)
        with self.assertRaises(runtime.PipelineContractError): runtime.finalize_run(self.run, {}, ['orders', 'items'])

    def test_bronze_position_retry_and_durable_quarantine(self):
        topic = 'fixture-'+self.run['run_id']
        for offset, raw in ((0, b'{"event_type":"fixture"}'), (1, b'broken-json')):
            record = stream.broker_record(topic, 0, offset, raw)
            key = stream.persist_bronze(self.s3, self.bucket, record)
            self.assertEqual(key, stream.persist_bronze(self.s3, self.bucket, stream.broker_record(topic, 0, offset, raw)))
            changed = stream.broker_record(topic, 0, offset, b'{"event_type":"different"}')
            # Changed valid bytes may map quarantine -> accepted under another
            # prefix; a Kafka broker position itself is immutable. Accepted
            # same-position conflicts must always fail readback.
            if record['status'] == 'accepted':
                with self.assertRaises(runtime.PipelineContractError): stream.persist_bronze(self.s3, self.bucket, changed)
