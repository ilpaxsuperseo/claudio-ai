#!/bin/zsh
# Il bot di Nummo in ascolto: lo lancia e lo tiene acceso il LaunchAgent com.masrepassaro.nummo-telegram.
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.local/node22/bin:$PATH"
set -a; . ./.env; set +a
exec node src/ascolta.mjs
