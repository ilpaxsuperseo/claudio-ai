#!/bin/zsh
# Collaudo della casa di Nummo: come utente «nummo», gli si chiede di provare a uscire e deve essere bloccato.
# Riporta solo «riuscito» o «negato», mai contenuti. Costa pochi centesimi (Haiku, tetto 0,20 $), fuori dal libro dei conti.
# Uso: strumenti/prova-casa.sh
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.local/node22/bin:$PATH"
set -a; . ./.env; set +a
exec node src/notte.mjs --collaudo
