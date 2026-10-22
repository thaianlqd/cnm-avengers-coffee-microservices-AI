"""Writes the V3.3 evidence manifest under evaluation/v33/ (no secrets, no env values).

Run from the REPO ROOT on the host (git is not available in the container):
  python3 data-platform/analytics-api/tools/build_v33_evidence.py [--eval /tmp/dp_eval.json] [--note "..."]
The manifest binds every result to the exact code that produced it: HEAD SHA + a digest of the working-tree diff + a
digest of every untracked source/test/catalog file, so uncommitted work is still pinned."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "data-platform/evaluation/v33"


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def digest(data: bytes):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--eval", default="/tmp/dp_eval.json")
    parser.add_argument("--note", default="")
    parser.add_argument('--out-dir',default=str(OUT),help='separate run directory; preserve prior release evidence')
    args = parser.parse_args()
    out_dir=pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Hash the exact bytes: text-mode universal newlines would normalize CRLF
    # additions in the lockfile and disagree with `git diff | shasum -a 256`.
    diff = subprocess.run(["git", "diff", "HEAD", "--", "data-platform", ".claude"],
                          cwd=ROOT, capture_output=True, check=True).stdout
    untracked = [p for p in git("ls-files", "--others", "--exclude-standard", "--", "data-platform", ".claude").splitlines()
                 if not p.startswith(("data-platform/web-ui/test-results","data-platform/evaluation/"))
                 and "node_modules" not in p and "/dist/" not in p and '/__pycache__/' not in p
                 and not pathlib.Path(p).name.startswith('.env')]
    files = {}
    for name in untracked:
        path = ROOT / name
        if path.is_file() and path.stat().st_size < 5_000_000:
            files[name] = digest(path.read_bytes())
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "head": git("rev-parse", "HEAD").strip(), "branch": git("rev-parse", "--abbrev-ref", "HEAD").strip(),
        "working_tree_diff_sha256": digest(diff), "working_tree_diff_files": git("diff", "HEAD", "--name-only", "--", "data-platform", ".claude").split(),
        "untracked_sha256": files, "python": sys.version.split()[0], "note": args.note,
    }
    sources = pathlib.Path(args.eval)
    if sources.exists():
        data = json.loads(sources.read_text())
        manifest["eval_offline"] = {k: data.get(k) for k in ("case_count", "registry_fingerprint", "retrieval_domain", "retrieval_metric",
                                                            "compile_level2", "preflight_expectations", "unsupported_preflight",
                                                            "forecast_capability_rejections", "v33_cases")}
        manifest["eval_failures"] = [f["id"] for f in data.get("failures", [])]
        (out_dir / "offline_cases.json").write_text(json.dumps({"v33_rows": data.get("v33_rows", []), "by_version": data.get("by_version")},
                                                          ensure_ascii=False, indent=2) + "\n")
    catalog=ROOT/'data-platform/analytics-api/metadata/semantic_catalog.json'
    manifest['catalog_file_sha256']=digest(catalog.read_bytes())
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: manifest[k] for k in ("head", "working_tree_diff_sha256")}, indent=1))


if __name__ == "__main__":
    main()
