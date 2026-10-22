#!/usr/bin/env python3
"""Read-only local demo evidence. No source rows, passwords or provider calls.
Run: python3 data-platform/tools/verify_demo_stack.py --output /tmp/dp-demo-stack.json
"""
import argparse,json,subprocess,urllib.request
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[2]
COMPOSE=['docker','compose','-f',str(ROOT/'docker-compose.data.yml')]
def run(args,input=None):
 p=subprocess.run(args,input=input,text=True,capture_output=True,cwd=ROOT,timeout=60)
 if p.returncode: raise RuntimeError('Command failed: '+str(args[:5])+' (output withheld)')
 return p.stdout
def execute(service,code):return json.loads(run(COMPOSE+['exec','-T',service,'python','-'],code))
def sql(query):return json.loads(run(COMPOSE+['exec','-T','postgres-analytics','psql','-U','analytics','-d','analytics','-At','-c',query]))
def http(url):
 try:
  with urllib.request.urlopen(url,timeout=5) as response:return {'status':response.status}
 except Exception as error:return {'error':type(error).__name__}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
 result={'checked_at':datetime.now(timezone.utc).isoformat(),'mode':'read_only; existing records; no synthetic business data; no provider calls'}
 result['services']=run(COMPOSE+['--profile','tools','ps','--all','--format','{{.Service}} | {{.State}} | {{.Health}} | {{.Ports}}','postgres-analytics','redis-analytics','data-sync','zookeeper','kafka','kafka-ui','minio','kafka-producer','kafka-consumer','spark-jobs','airflow','analytics-api','web-ui']).splitlines()
 result['http']={name:http(url) for name,url in {'web':'http://127.0.0.1:8501','api':'http://127.0.0.1:8502/health','kafka_ui':'http://127.0.0.1:8082','airflow':'http://127.0.0.1:8083/health','minio_api':'http://127.0.0.1:9000/minio/health/live','minio_console':'http://127.0.0.1:9001'}.items()}
 # Read committed positions without joining/rebalancing the consumer group.
 stream_code='''import json,os,hashlib
from datetime import datetime,timezone
from kafka import KafkaConsumer,TopicPartition
from consumer import get_minio
from stream_runtime import read_bronze_record
k=KafkaConsumer(bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS','kafka:9092'),group_id='avengers-bronze-consumer',enable_auto_commit=False,api_version_auto_timeout_ms=3000)
tps=[TopicPartition(t,p) for t in ['orders-events','order-items-events','shipper-events'] for p in sorted(k.partitions_for_topic(t))]
ends=k.end_offsets(tps);positions=[dict(topic=t.topic,partition=t.partition,committed=k.committed(t),end=ends[t]) for t in tps]
for p in positions:p['lag']=None if p['committed'] is None else p['end']-p['committed']
p=next(p for p in positions if p['topic']=='orders-events' and p['committed'] and p['committed']>0);offset=p['committed']-1
tp=TopicPartition(p['topic'],p['partition']);k.assign([tp]);k.seek(tp,offset)
s3=get_minio();record=read_bronze_record(s3,'avengers-bronze',p['topic'],p['partition'],offset)
match=False
for messages in k.poll(timeout_ms=5000,max_records=1).values():
 for m in messages:
  if m.offset==offset:match=hashlib.sha256(m.value).hexdigest()==record['source_hash']
k.close()
assert match
print(json.dumps(dict(checked_at=datetime.now(timezone.utc).isoformat(),positions=positions,lag_total=sum(p['lag'] or 0 for p in positions),sample=dict(topic=p['topic'],partition=p['partition'],offset=offset,event_id=record['event_id'],source_hash=record['source_hash'],broker_bronze_sha256_matches=match,bronze_key=f"streaming/{p['topic']}/{p['partition']}/{offset}-{offset}.json"),buckets=[b['Name'] for b in s3.list_buckets()['Buckets']])))
'''
 result['stream']=execute('kafka-consumer',stream_code)
 eid=result['stream']['sample']['event_id'];assert len(eid)==64 and all(c in '0123456789abcdef' for c in eid)
 result['stream']['projection']=sql("SELECT row_to_json(e) FROM (SELECT count(*) AS matching_events,min(received_at) AS first_received_at FROM public.realtime_events WHERE event_id='"+eid+"') e")
 result['redis']=run(COMPOSE+['exec','-T','redis-analytics','redis-cli','PING']).strip()
 result['sync']=sql("SELECT row_to_json(e) FROM (SELECT started_at,finished_at,total_tables,total_rows,status FROM public.sync_history WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1) e")
 result['batch']=execute('airflow','''import sys,json,importlib.util
sys.path.insert(0,'/opt/airflow/spark-jobs')
import gold_aggregation as gold
from batch_runtime import verify_publication
from pipeline_runtime import read_manifest
engine=gold.get_engine();c=engine.raw_connection();c.set_session(readonly=True)
with c.cursor() as cur:
 cur.execute("SELECT run_id,manifest_fingerprint,requested_as_of,published_at FROM analytics.pipeline_publications WHERE pipeline='daily_medallion'")
 run_id,digest,asof,published=cur.fetchone()
s3=gold.get_minio();verified=verify_publication(s3,'avengers-gold',run_id,digest,gold.CONTRACT,c)
layers={}
for layer in ['bronze','silver','gold']:
 m=read_manifest(s3,'avengers-'+layer,run_id)
 layers[layer]=dict(run_id=m['run_id'],manifest_fingerprint=m['manifest_fingerprint'],quality=m.get('publication_quality'),snapshot_semantics=m.get('snapshot_semantics'),outputs={name:{k:v.get(k) for k in ['rows','sha256','key','quality_status']} for name,v in m['outputs'].items()})
c.rollback();c.close();engine.dispose()
print(json.dumps(dict(engine='Python/Pandas; not Apache Spark',pyspark_installed=importlib.util.find_spec('pyspark') is not None,requested_as_of=asof.isoformat(),published_at=published.isoformat(),verification=verified,layers=layers)))
''')
 for key,command in [('dag_runs',['dags','list-runs','--dag-id','avengers_daily_pipeline','--output','json']),('dag_tasks',['tasks','states-for-dag-run','avengers_daily_pipeline','demo_verify_20261021_0945','--output','json']),('dag_import_errors',['dags','list-import-errors','--output','json'])]:
  raw=run(COMPOSE+['exec','-T','airflow','airflow']+command)
  # Airflow sometimes precedes JSON with an ANSI log line.
  result[key]=json.loads(raw[raw.rfind('\n[')+1:] if '\n[' in raw else raw)
 Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'output':args.output,'http':result['http'],'lag_total':result['stream']['lag_total'],'batch_run':result['batch']['verification']['run_id'],'batch_status':result['batch']['verification']['status'],'all_demo_tasks_success':all(t['state']=='success' for t in result['dag_tasks'])},ensure_ascii=False))
if __name__=='__main__':main()
