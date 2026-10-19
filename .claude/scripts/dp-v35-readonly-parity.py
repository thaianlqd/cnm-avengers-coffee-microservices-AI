"""Four critical full-population comparisons. No DB writes/cert publication."""
from datetime import datetime, timezone
import hashlib
import json
import time
import sync
from pipeline_runtime import read_checkpoint, snapshot_certificate, fingerprint

contracts=sync.load_data_contracts()
source=sync.get_source_conn()
target=sync.get_target_conn()
target.set_session(readonly=True, isolation_level='REPEATABLE READ')
started=datetime.now(timezone.utc)
results={}
try:
    with source.cursor() as cursor:
        cursor.execute("SELECT clock_timestamp(), current_setting('TimeZone')")
        upper, zone=cursor.fetchone()
    with target.cursor() as cursor:
        cursor.execute("SET LOCAL statement_timeout='30s'")
    # One target MVCC snapshot pins all four checkpoint generations and rows.
    for name in ['orders.don_hang','orders.chi_tiet_don_hang','identity.chi_nhanh','menu.san_pham']:
        contract=contracts[name]
        checkpoint=read_checkpoint(target,contract['dataset_id'])
        before=time.monotonic()
        left=sync._measure_projection(source,contract,upper=upper,source_timezone=zone,deadline=time.monotonic()+120,source=True)
        right=sync._measure_projection(target,contract,upper=upper,source_timezone=zone,deadline=time.monotonic()+120)
        certificate=snapshot_certificate(contract,left,right,generation=checkpoint['generation'],schema_fingerprint=checkpoint['schema_fingerprint'],source_upper_bound=upper,snapshot_started_at=started)
        # Keep only aggregate evidence/hashes, not source business rows.
        results[name]={'status':'matched','generation':checkpoint['generation'],'schema_fingerprint':checkpoint['schema_fingerprint'],
            'projection':left,'source_projection_sha256':fingerprint(left),'replica_projection_sha256':fingerprint(right),
            'snapshot_certificate_sha256':certificate['certificate_sha256'],'elapsed_seconds':round(time.monotonic()-before,3)}
    print(json.dumps({'version':'3.5.0','status':'passed','observed_at':started.isoformat(),'mode':'read_only_acceptance_measurement',
        'database_writes':0,'source_transaction':'REPEATABLE READ READ ONLY','replica_transaction':'REPEATABLE READ READ ONLY',
        'sources':results,'limitations':['Independent acceptance comparison; not persisted as a worker certificate',
        'No business-period closure inferred','Source and replica have independent MVCC snapshots; mismatches fail instead of being hidden']},default=str))
finally:
    source.rollback();target.rollback();source.close();target.close()
