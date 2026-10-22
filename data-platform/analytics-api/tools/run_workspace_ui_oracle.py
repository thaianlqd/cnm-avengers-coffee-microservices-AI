"""Run the real JS race oracle and bind its receipt to implementation + tests."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',required=True)
    args=parser.parse_args()
    web=Path(__file__).resolve().parents[2]/'web-ui'
    result=subprocess.run(['node','--test','src/utils/workspaceInteraction.test.mjs'],cwd=web,capture_output=True,text=True)
    files=['src/utils/workspaceInteraction.mjs','src/utils/workspaceInteraction.test.mjs']
    passed=next((int(l.split()[-1]) for l in result.stdout.splitlines() if l.startswith('# pass ')),0)
    out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(dict(case_id='E25',exit_code=result.returncode,passed=passed,
        command='node --test src/utils/workspaceInteraction.test.mjs',
        source_files={n:hashlib.sha256((web/n).read_bytes()).hexdigest() for n in files},
        output_sha256=hashlib.sha256(result.stdout.encode()).hexdigest()),indent=2)+'\n')
    print(result.stdout)
    return result.returncode


if __name__=='__main__':raise SystemExit(main())
