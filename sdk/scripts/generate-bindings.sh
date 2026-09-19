#!/usr/bin/env bash
# Regenerates the contract bindings from the compiled wasm.
#
# The output is committed, so a consumer of the SDK never needs the Stellar CLI.
# Nothing here post processes what the generator produces: running this twice on
# the same wasm has to leave the tree unchanged, or the bindings stop being a
# faithful picture of the contract and start being something we maintain.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
wasm="$root/contracts/target/wasm32v1-none/release"

if [[ ! -f "$wasm/hackathon_core.wasm" ]]; then
  echo "No wasm found. Run 'stellar contract build' in contracts/ first." >&2
  exit 1
fi

stellar contract bindings typescript \
  --wasm "$wasm/hackathon_core.wasm" \
  --output-dir "$root/sdk/bindings/hackathon-core" \
  --overwrite

stellar contract bindings typescript \
  --wasm "$wasm/prize_vault.wasm" \
  --output-dir "$root/sdk/bindings/prize-vault" \
  --overwrite
