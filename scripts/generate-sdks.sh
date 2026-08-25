#!/usr/bin/env bash
# Generate TypeScript and PHP clients from openapi.yaml using a pinned
# OpenAPI Generator release. Used by humans and .github/workflows/sdk.yml.

set -euo pipefail

readonly GENERATOR_VERSION="7.24.0"
readonly GENERATOR_SHA256="4b83ccc6fd43056c8c631cd0195e5100bd0550912502527bab09ac76152dab0c"
readonly GENERATOR_URL="https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${GENERATOR_VERSION}/openapi-generator-cli-${GENERATOR_VERSION}.jar"
readonly GLOBAL_PROPERTIES="apiDocs=false,modelDocs=false,apiTests=false,modelTests=false"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT
readonly SPEC="${ROOT}/openapi.yaml"
readonly CACHE_DIRECTORY="${PAPERBOY_SDK_CACHE:-${HOME}/.cache/paperboy}"
readonly JAR="${CACHE_DIRECTORY}/openapi-generator-cli-${GENERATOR_VERSION}.jar"

check=0
if [ "${1:-}" = "--check" ]; then
  check=1
elif [ "${1:-}" != "" ]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

if [ ! -f "${SPEC}" ]; then
  echo "Missing OpenAPI spec: ${SPEC}" >&2
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "Java 17+ is required to generate SDKs." >&2
  exit 1
fi

mkdir -p "${CACHE_DIRECTORY}"
if [ ! -f "${JAR}" ]; then
  curl --fail --location --silent --show-error "${GENERATOR_URL}" --output "${JAR}"
fi

actual_sha256="$(shasum -a 256 "${JAR}" | awk '{print $1}')"
if [ "${actual_sha256}" != "${GENERATOR_SHA256}" ]; then
  echo "OpenAPI Generator checksum mismatch for ${JAR}" >&2
  echo "expected ${GENERATOR_SHA256}" >&2
  echo "actual   ${actual_sha256}" >&2
  exit 1
fi

generate() {
  local generator="$1"
  local output="$2"
  local ignore="$3"
  local properties="$4"

  rm -rf "${output}"
  mkdir -p "${output}"
  java -jar "${JAR}" generate \
    -i "${SPEC}" \
    -g "${generator}" \
    -o "${output}" \
    --ignore-file-override "${ignore}" \
    --global-property "${GLOBAL_PROPERTIES}" \
    --additional-properties "${properties}"
}

generate typescript-fetch \
  "${ROOT}/sdks/typescript" \
  "${ROOT}/sdk-generator/typescript.ignore" \
  "npmName=@paperboy/openapi,supportsES6=true,typescriptThreePlus=true,enumPropertyNaming=original,modelPropertyNaming=original,withoutRuntimeChecks=true,useSingleRequestParameter=true,hideGenerationTimestamp=true"

generate php \
  "${ROOT}/sdks/php" \
  "${ROOT}/sdk-generator/php.ignore" \
  "invokerPackage=PaperBoy\\OpenApi,packageName=paperboy/openapi,composerVendorName=paperboy,composerProjectName=openapi,srcBasePath=src,variableNamingConvention=snake_case,hideGenerationTimestamp=true"

# The PHP generator still emits these even when listed in the ignore file.
rm -f \
  "${ROOT}/sdks/php/git_push.sh" \
  "${ROOT}/sdks/php/.travis.yml" \
  "${ROOT}/sdks/typescript/git_push.sh" \
  "${ROOT}/sdks/typescript/.travis.yml"

if [ "${check}" -eq 1 ]; then
  git -C "${ROOT}" diff --exit-code -- sdks/typescript sdks/php
fi
