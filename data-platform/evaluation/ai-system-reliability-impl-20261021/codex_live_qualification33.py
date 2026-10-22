"""One bounded frozen12 replay; independent before/after SQL, never paid retries."""
import subprocess,json,hashlib,sys
from pathlib import Path
E=Path(__file__).resolve().parent;A=E.parent/'ai-system-audit-20261021'
STEM='codex-qualification-policy33-live-20261022'

def main():
    frozen=json.loads((E/(STEM+'-manifest.json')).read_text())
    if hashlib.sha256((A/'audit_runtime.py').read_bytes()).hexdigest()!=frozen['audit_runtime_sha256']:
        raise SystemExit('Audit runtime changed after campaign freeze')
    if not json.loads((E/'codex-offline-policy33-final/result.json').read_text())['passed']:
        raise SystemExit('Offline qualification must pass first')
    effective=json.loads((E/'codex-regression-policy33-final/effective-final.json').read_text())
    if not effective['passed']:raise SystemExit('Regression must pass before paid campaign')
    out=E/(STEM+'-cases');out.mkdir(exist_ok=False)
    ledger=[];spent=0
    oracle_source=(E/'codex_warehouse_oracles.py').read_bytes()
    def oracle(identity,stage):
        done=subprocess.run(['docker','exec','-i','avengers_analytics_api','python','-'],
            input=oracle_source,capture_output=True,check=True,timeout=60)
        result=json.loads(done.stdout);(out/(identity+'-oracle-'+stage+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2))
        return result
    for entry in frozen['frozen_cases']:
        identity=entry['id']
        if spent+3>frozen['max_physical_sends']:raise SystemExit('Frozen ceiling has no three-send allowance left')
        oracle(identity,'before')
        receipt=STEM+'-'+identity
        done=subprocess.run([sys.executable,str(A/'audit_runtime.py'),'live','--allow-provider','--refresh',
            '--semantic-evidence','--case',identity,'--receipt-name',receipt,
            '--physical-spent',str(spent),'--physical-limit',str(frozen['max_physical_sends'])],
            stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=180)
        (out/(identity+'.log')).write_text(done.stdout)
        path=A/(receipt+'.json')
        if not path.exists():raise SystemExit('Case produced no durable receipt: '+identity)
        rows=json.loads(path.read_text())
        if len(rows)!=1 or rows[0]['payload']!=entry['payload']:
            raise SystemExit('Frozen payload mismatch: '+identity)
        row=rows[0];ledger.append(row)
        physical=row.get('job',{}).get('physical_http')
        if physical is None and row.get('job',{}).get('provider_call_count'):
            raise SystemExit('Physical send accounting unavailable')
        spent+=physical or 0
        (A/(STEM+'.json')).write_text(json.dumps(ledger,ensure_ascii=False,indent=2))
        (out/'accounting.json').write_text(json.dumps(dict(measured_physical_sends=spent,
            frozen_ceiling=frozen['max_physical_sends'],prior_known_measured_sends=frozen['prior_measured_sends'],
            total_known_measured_sends=spent+frozen['prior_measured_sends'],completed_fixed_cases=len(ledger)),indent=2))
        oracle(identity,'after')
        print(json.dumps(dict(id=identity,state=row.get('job',{}).get('state'),
            physical_sends=physical,campaign_spent=spent,runner_returncode=done.returncode)),flush=True)
        if done.returncode:raise SystemExit('Audit runner stopped; retain attempt and inspect before any more sends')
    print('Fixed12campaign completed, measured sends '+str(spent),flush=True)

if __name__=='__main__':main()
