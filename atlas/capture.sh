#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
# The capture uses no private files, including from ATLAS_ENV_DIR.
exec node tests/atlas/run.mjs "$@"
