#!/bin/sh

set -eu

case "${PAPERBOY_PROCESS_TYPE:-web}" in
  web)
    exec bun --no-install --bun next start
    ;;
  jobs)
    bun run db:migrate
    exec bun run jobs
    ;;
  *)
    printf '%s\n' "PAPERBOY_PROCESS_TYPE must be either web or jobs." >&2
    exit 64
    ;;
esac
