#!/bin/zsh
# Il turno di notte di Nummo: lo lancia il LaunchAgent com.masrepassaro.nummo-notte alle 2:00.
# Prima i lavori che si è ordinato, poi i suoi numeri da Metricool (anche se i lavori non ci sono o falliscono).
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.local/node22/bin:/opt/homebrew/bin:$PATH"
set -a; . ./.env; set +a
node src/notte.mjs
zsh strumenti/numeri.sh
