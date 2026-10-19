"""Stage Data Platform source/evidence for a network-disabled secret scanner.

Never opens deployment secrets, credential stores, symlinks, caches or runtime
state. Includes tracked and nonignored untracked files; outputs only hashes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',required=True)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[3]
    out=Path(args.out).resolve()
    if out.exists():raise SystemExit('Scan stage must be a new directory')
    out.mkdir(parents=True,mode=0o700)
    inventory=[]
    names=subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z'],cwd=root).decode().split('\0')
    for name in sorted(set(names)-{''}):
        path=Path(name)
        if not (name.startswith('data-platform/') or name.startswith('.claude/scripts/dp-')
                or name in {'docker-compose.data.yml','.github/workflows/data-platform-ci.yml',
                            '.github/gitleaks-data-platform.toml'}):continue
        if (any(p in {'.runtime','node_modules','dist','test-results','__pycache__','.pytest_cache',
                       '.venv','venv','.aws','.codex','.agents'} for p in path.parts)
                or path.name.startswith('.env') and path.name!='.env.example'
                or path.suffix.lower() in {'.pem','.key','.keystore','.pyc'}
                or path.name in {'db_credentials.json','deployment.json'}):continue
        source=root/path
        if not source.is_file():continue
        if any(p.is_symlink() for p in [source,*source.parents] if p!=root):
            raise SystemExit('Symlink in release scan inventory')
        content=source.read_bytes()
        target=out/path;target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(content);target.chmod(0o600)
        inventory.append({'path':name,'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content)})
    if not inventory:raise SystemExit('Empty release scan inventory')
    (out/'scan-manifest.json').write_text(json.dumps({'scope':'Data Platform current source and nonignored evidence',
        'excluded':'Deployment secrets, credential files, runtime state, caches and build outputs',
        'files':inventory},indent=2)+'\n')
    print(json.dumps({'files':len(inventory),'bytes':sum(f['bytes'] for f in inventory)}))


if __name__=='__main__':main()
