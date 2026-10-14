#!/usr/bin/env bash
set -euo pipefail
case "$(uname -m)" in aarch64) architecture=arm64 ;; x86_64) architecture=amd64 ;; *) exit 1 ;; esac
K6_INSTALL_DIR="${K6_INSTALL_DIR:-${HOME:-/root}/avengers-k6}"
mkdir -p "$K6_INSTALL_DIR"
cd "$K6_INSTALL_DIR"
# Fixed stable release, revalidated at phase start. No AWS credentials on EC2.
version=2.3.0
archive="k6-v${version}-linux-${architecture}.tar.gz"
curl --fail --location --silent --show-error --max-time 120 "https://github.com/grafana/k6/releases/download/v${version}/${archive}" -o "$archive"
curl --fail --location --silent --show-error --max-time 30 "https://github.com/grafana/k6/releases/download/v${version}/k6-v${version}-checksums.txt" -o checksums.txt
awk -v name="$archive" '$2 == name || $2 == "*"name {print}' checksums.txt > selected-checksum.txt
[[ -s selected-checksum.txt ]]
sha256sum --check selected-checksum.txt
tar -xzf "$archive"
mv "k6-v${version}-linux-${architecture}/k6" ./k6
chmod 755 k6
rm -r "k6-v${version}-linux-${architecture}" "$archive"
./k6 version
sha256sum k6
uname -a
nproc
getconf CLK_TCK
free -h
ulimit -Sn
ulimit -Hn
# EC2 is configured to TERMINATE on guest shutdown; fail-safe if the Mac dies.
sudo shutdown -h +230 >/dev/null
