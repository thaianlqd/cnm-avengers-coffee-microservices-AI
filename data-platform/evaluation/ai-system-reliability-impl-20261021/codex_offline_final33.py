"""Replay external finite acceptance harnesses after the full regression is idle."""
import subprocess,json,sys,time,hashlib
from pathlib import Path
E=Path(__file__).resolve().parent
C='avengers_reliability_policy33_final_codex'
OUT=E/'codex-offline-policy33-final'

def main():
    if not (E/'codex-regression-policy33-final/source-drift.json').exists():
        raise SystemExit('Full regression must finish before these checks')
    OUT.mkdir(exist_ok=False)
    env=['env','-u','DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN','-u','DATA_ANALYST_ENABLE_CONTRACT_REPAIR',
        '-u','DATA_ANALYST_GEMINI_SECONDARY_KEY','AI_OFFLINE=1','DATA_ANALYST_ENV=development',
        'DATA_ANALYST_ALLOW_BROWSER_OWNER=1','DATA_ANALYST_SESSION_STORE=memory','DATA_ANALYST_ARTIFACT_STORE=memory']
    records=[]
    harnesses=['codex_acceptance_properties','codex_holdout_cohorts','codex_remaining_holdouts',
        'codex_identity_holdouts','codex_risk_equivalence','codex_family_matrix','codex_city_inventory_check',
        'codex_advertised_roundtrip']
    (OUT/'manifest.json').write_text(json.dumps(dict(harnesses=harnesses,
        hashes={n:hashlib.sha256((E/(n+'.py')).read_bytes()).hexdigest() for n in harnesses}),indent=2))
    for name in harnesses:
        start=time.monotonic()
        with (OUT/(name+'.log')).open('w') as log:
            done=subprocess.run(['docker','exec','-i',C,*env,'python','-'],input=(E/(name+'.py')).read_bytes(),
                stdout=log,stderr=subprocess.STDOUT,timeout=900)
        content=(OUT/(name+'.log')).read_text()
        for prefix,filename in [('FAMILY_MATRIX ','family-matrix.json'),('CITY_INVENTORY ','city-inventory.json'),
                                ('ADVERTISED_RESULT ','advertised-roundtrip.json')]:
            for line in content.splitlines():
                if line.startswith(prefix):(OUT/filename).write_text(json.dumps(json.loads(line[len(prefix):]),ensure_ascii=False,indent=2))
        record=dict(harness=name,returncode=done.returncode,seconds=round(time.monotonic()-start,2))
        records.append(record);(OUT/'harnesses.json').write_text(json.dumps(records,indent=2));print(json.dumps(record),flush=True)
    for module,filename,args in [
        ('semantic_eval_v30','semantic146.json',['--mode','offline']),
        ('semantic_reference_eval_v34','authored-reference120.json',[]),
        ('semantic_eval_v34','contracts120.json',[])]:
        path='/tmp/codex-final-'+filename
        with (OUT/(module+'.log')).open('w') as log:
            done=subprocess.run(['docker','exec',C,*env,'python','-m','evals.'+module,*args,'--out',path],
                stdout=log,stderr=subprocess.STDOUT,timeout=900)
        if done.returncode==0:
            output=subprocess.run(['docker','exec',C,'cat',path],capture_output=True,check=True)
            (OUT/filename).write_bytes(output.stdout)
            data=json.loads(output.stdout)
            valid=(not data.get('failures') and not data.get('dataset_errors') and
                   data.get('v33_cases',{}).get('rate')==1 and data.get('v34_cases',{}).get('rate')==1) if module=='semantic_eval_v30' else data.get('failed')==0
        else:valid=False
        record=dict(harness=module,returncode=done.returncode or int(not valid),assertions_passed=valid);records.append(record)
        (OUT/'harnesses.json').write_text(json.dumps(records,indent=2));print(json.dumps(record),flush=True)
    domain=subprocess.run([sys.executable,str(E/'codex_domain_matrix.py'),'--host',
        '--container',C,'--out','codex-domain-matrix33'],timeout=1200)
    records.append(dict(harness='domain-matrix234',returncode=domain.returncode))
    result=dict(passed=all(r['returncode']==0 for r in records),harnesses=records)
    (OUT/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
    raise SystemExit(not result['passed'])

if __name__=='__main__':main()
