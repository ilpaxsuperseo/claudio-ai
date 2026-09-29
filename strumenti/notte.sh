#!/bin/zsh
# Il turno di notte di Nummo: lo lancia il LaunchAgent com.masrepassaro.nummo-notte alle 2:00.
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.local/node22/bin:/opt/homebrew/bin:$PATH"
set -a; . ./.env; set +a
exec node src/notte.mjs
