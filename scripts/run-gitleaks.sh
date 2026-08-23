#!/usr/bin/env bash

set -euo pipefail

readonly GITLEAKS_VERSION="8.30.1"
readonly CHECKSUMS_SHA256="061476c21adaf5441516f96f185c1a4706a83cd6329b9b38762271b3d4a52fae"
readonly RELEASE_BASE_URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"

case "$(uname -s)" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *)
    echo "Unsupported Gitleaks platform: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) architecture="arm64" ;;
  x86_64 | amd64) architecture="x64" ;;
  *)
    echo "Unsupported Gitleaks architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

readonly archive="gitleaks_${GITLEAKS_VERSION}_${platform}_${architecture}.tar.gz"
readonly temporary_directory="$(mktemp -d)"
trap 'rm -rf "${temporary_directory}"' EXIT

readonly checksums_path="${temporary_directory}/gitleaks_${GITLEAKS_VERSION}_checksums.txt"
readonly archive_path="${temporary_directory}/${archive}"

curl --fail --location --silent --show-error \
  "${RELEASE_BASE_URL}/gitleaks_${GITLEAKS_VERSION}_checksums.txt" \
  --output "${checksums_path}"
curl --fail --location --silent --show-error \
  "${RELEASE_BASE_URL}/${archive}" \
  --output "${archive_path}"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi

  shasum -a 256 "$1" | awk '{print $1}'
}

if [[ "$(sha256 "${checksums_path}")" != "${CHECKSUMS_SHA256}" ]]; then
  echo "Gitleaks checksum manifest verification failed." >&2
  exit 1
fi

archive_sha256="$(awk -v archive="${archive}" '$2 == archive { print $1 }' "${checksums_path}")"
if [[ ! "${archive_sha256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Gitleaks archive checksum is missing or invalid." >&2
  exit 1
fi

if [[ "$(sha256 "${archive_path}")" != "${archive_sha256}" ]]; then
  echo "Gitleaks archive verification failed." >&2
  exit 1
fi

tar -xzf "${archive_path}" -C "${temporary_directory}" gitleaks
exec "${temporary_directory}/gitleaks" "$@"

