#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
need curl
need python3
[[ "$(uname -sm)" == 'Darwin arm64' ]] || fail 'Pinned local helper supports macOS arm64 only.'
destination="$K8S_ROOT/.tools/k6/0.57.0/k6"
if [[ -f "$destination" ]] && python3 - "$destination" <<'PY'
import hashlib,sys
from pathlib import Path
sys.exit(hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest() != 'e234ca660a9c73b8dafd7d0cbbf4f7edeb4eebcc5ab55a60b6483db2b4658fe7')
PY
then
  printf 'Verified cached native k6 0.57.0: %s\n' "$destination"
  exit 0
fi
archive="$(mktemp -t avengers-k6.XXXXXX)"
# Vendor release, version pinned; hash from the same release checksums.
curl --fail --location --silent --show-error https://github.com/grafana/k6/releases/download/v0.57.0/k6-v0.57.0-macos-arm64.zip -o "$archive"
python3 - "$archive" "$destination" <<'PY'
import hashlib,sys,zipfile
from pathlib import Path
archive,destination = map(Path,sys.argv[1:])
if hashlib.sha256(archive.read_bytes()).hexdigest() != '9fc81fe44d399254931d0e674a187860794d2b9c8d75588d1bc95cca2b13928b':
    raise SystemExit('Official k6 archive SHA256 mismatch; refusing execution')
with zipfile.ZipFile(archive) as source:
    binary = source.read('k6-v0.57.0-macos-arm64/k6')
if hashlib.sha256(binary).hexdigest() != 'e234ca660a9c73b8dafd7d0cbbf4f7edeb4eebcc5ab55a60b6483db2b4658fe7':
    raise SystemExit('k6 binary SHA256 mismatch')
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_bytes(binary)
destination.chmod(0o755)
archive.unlink()
print('Verified native k6 installed only in gitignored .tools/k6/0.57.0')
PY
