"""Real broker restart/offset boundary with real Bronze and replayable DB."""
import importlib.util
import json
import logging
from pathlib import Path
import time
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

import boto3
from botocore.config import Config
from kafka import KafkaConsumer, KafkaProducer, TopicPartition
from kafka.admin import KafkaAdminClient, NewTopic

import integration_sync_pg as fixture
import stream_runtime as stream

logging.getLogger('kafka').setLevel(logging.WARNING)
_spec = importlib.util.spec_from_file_location('stream_consumer', Path(__file__).resolve().parents[1] / 'kafka-consumer/consumer.py')
consumer_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(consumer_module)


class RealKafkaDeliveryTests(TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.GovernedSyncPostgresTests.setUpClass()
        cls.s3 = boto3.client('s3',endpoint_url='http://127.0.0.1:9000',
            aws_access_key_id='v34fixture',aws_secret_access_key='v34-fixture-only-pass',
            config=Config(signature_version='s3v4',connect_timeout=2,read_timeout=5))
        cls.s3.head_bucket(Bucket='avengers-bronze')

    def setUp(self):
        self.topic='fixture-'+uuid4().hex
        self.group='fixture-group-'+uuid4().hex
        admin=KafkaAdminClient(bootstrap_servers='127.0.0.1:19092',api_version=(2,6,0),request_timeout_ms=10000)
        try: admin.create_topics([NewTopic(self.topic,num_partitions=1,replication_factor=1)])
        finally: admin.close()
        self.producer=KafkaProducer(bootstrap_servers='127.0.0.1:19092',api_version=(2,6,0),acks='all',retries=1,max_block_ms=3000)
        self.addCleanup(self.producer.close,timeout=5)
        self.connection=fixture.connect('v34_target')
        self.addCleanup(self.connection.close)

    def client(self):
        client=KafkaConsumer(bootstrap_servers='127.0.0.1:19092',group_id=self.group,
            api_version=(2,6,0),enable_auto_commit=False,auto_offset_reset='earliest',request_timeout_ms=15000,
            session_timeout_ms=10000)
        client.assign([TopicPartition(self.topic,0)])
        return client

    def records(self, client, expected):
        records=[]
        deadline=time.monotonic()+15
        while len(records)<expected and time.monotonic()<deadline:
            for messages in client.poll(timeout_ms=300,max_records=10).values():
                records.extend(stream.broker_record(m.topic,m.partition,m.offset,m.value,m.key) for m in messages)
        self.assertEqual(len(records),expected)
        return records

    def test_lost_offset_ack_then_client_restart_replays_one_logical_event(self):
        metadata=self.producer.send(self.topic,key=b'fixture-key',value=b'{"event_type":"fixture"}').get(timeout=10)
        first=self.client()
        try:
            records=self.records(first,1)
            with patch.object(first,'commit',side_effect=RuntimeError('fixture crash before broker ack')):
                with self.assertRaises(RuntimeError):
                    consumer_module.flush_batch(records,self.connection,self.s3,first)
            self.assertIsNone(first.committed(TopicPartition(self.topic,0)))
        finally: first.close(autocommit=False)
        restarted=self.client()
        try:
            replay=self.records(restarted,1)
            self.assertEqual(replay,records)
            result=consumer_module.flush_batch(replay,self.connection,self.s3,restarted)
            self.assertEqual(result['projection'],'completed')
            self.assertEqual(restarted.committed(TopicPartition(self.topic,0)),metadata.offset+1)
        finally: restarted.close(autocommit=False)
        self.connection.rollback()
        with self.connection.cursor() as cursor:
            cursor.execute('SELECT count(*) FROM public.realtime_events WHERE topic=%s',(self.topic,))
            self.assertEqual(cursor.fetchone()[0],1)

    def test_required_bronze_failure_leaves_actual_broker_offset_uncommitted(self):
        self.producer.send(self.topic,value=b'{"event_type":"fixture"}').get(timeout=10)
        client=self.client()
        try:
            records=self.records(client,1)
            with patch.object(self.s3,'put_object',side_effect=TimeoutError('fixture sink outage')):
                with self.assertRaises(TimeoutError): consumer_module.flush_batch(records,self.connection,self.s3,client)
            self.assertIsNone(client.committed(TopicPartition(self.topic,0)))
        finally: client.close(autocommit=False)

    def test_projection_down_and_malformed_event_still_have_durable_trace_before_offset_commit(self):
        self.producer.send(self.topic,value=b'not-json').get(timeout=10)
        self.producer.send(self.topic,value=b'{"event_type":"fixture"}').get(timeout=10)
        client=self.client()
        try:
            records=self.records(client,2)
            result=consumer_module.flush_batch(records,None,self.s3,client)
            self.assertEqual(result['projection'],'failed_replay_required')
            self.assertEqual(result['quarantined'],1)
            self.assertEqual(client.committed(TopicPartition(self.topic,0)),2)
            for record in records:
                body=self.s3.get_object(Bucket='avengers-bronze',Key=stream.bronze_key(record))['Body'].read()
                self.assertEqual(json.loads(body),record)
            recovered=[stream.read_bronze_record(self.s3,'avengers-bronze',self.topic,0,r['offset'],
                       quarantined=r['status']=='quarantined') for r in records]
            stream.project_records(self.connection,recovered)
            with self.connection.cursor() as cursor:
                cursor.execute('SELECT count(*) FROM public.realtime_events WHERE topic=%s',(self.topic,))
                self.assertEqual(cursor.fetchone()[0],1)
        finally: client.close(autocommit=False)

    def test_stable_producer_event_id_deduplicates_different_broker_offsets(self):
        import hashlib
        event_id=hashlib.sha256(self.topic.encode()).hexdigest()
        raw=json.dumps({'producer_version':'3.4.0','event_id':event_id,'event_type':'fixture'}).encode()
        for _ in range(2): self.producer.send(self.topic,value=raw).get(timeout=10)
        client=self.client()
        try:
            records=self.records(client,2)
            self.assertEqual({r['event_id'] for r in records},{event_id})
            consumer_module.flush_batch(records,self.connection,self.s3,client)
            with self.connection.cursor() as cursor:
                cursor.execute('SELECT count(*) FROM public.realtime_events WHERE topic=%s',(self.topic,))
                self.assertEqual(cursor.fetchone()[0],1)
        finally: client.close(autocommit=False)

    def test_actual_consumer_factory_disables_background_offset_commit(self):
        with patch.dict('os.environ',{'KAFKA_BOOTSTRAP_SERVERS':'127.0.0.1:19092','KAFKA_GROUP_ID':self.group}), \
             patch.object(consumer_module,'TOPICS',[self.topic]):
            client=consumer_module.create_consumer()
        try:
            self.assertFalse(client.config['enable_auto_commit'])
            self.assertLessEqual(client.config['max_poll_records'],100)
            self.assertIsNone(client.config['value_deserializer'])
        finally: client.close(autocommit=False)
