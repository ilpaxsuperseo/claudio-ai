#!/bin/zsh
# Il turno dei lavori di Nummo: lo lancia il LaunchAgent com.masrepassaro.nummo-notte ogni ora al minuto 40.
# Se non ci sono lavori in coda si chiude subito. Alle 2 di notte legge anche i suoi numeri da Metricool.
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.local/node22/bin:/opt/homebrew/bin:$PATH"
set -a; . ./.env; set +a
node src/notte.mjs
[ "$(date +%H)" = "02" ] && zsh strumenti/numeri.sh
exit 0
