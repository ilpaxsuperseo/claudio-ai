#!/bin/zsh
# Simulazione: N giorni con il cervello finto, in una cartella separata.
# Uso: strumenti/simula.sh 12   → simulazione/sito/index.html
cd "$(dirname "$0")/.." || exit 1
GIORNI=${1:-12}
rm -rf simulazione && mkdir -p simulazione
export NUMMO_DATI=simulazione/dati NUMMO_PAGINE=simulazione/pagine NUMMO_USCITA=simulazione/uscita NUMMO_SITO=simulazione/sito NUMMO_CERVELLO=finto NUMMO_DOMINIO=no
for g in $(seq 1 $GIORNI); do
  d=$(date -j -v+$((g-1))d -f "%Y-%m-%d" 2026-10-01 +%Y-%m-%d)
  [ -n "$SPESA" ] && NUMMO_ADESSO="${d}T04:00:00Z" node strumenti/spesa-finta.mjs $SPESA
  NUMMO_ADESSO="${d}T05:23:00Z" node src/ciclo.mjs mattina || exit 1
  NUMMO_ADESSO="${d}T17:23:00Z" node src/ciclo.mjs sera >/dev/null || exit 1
done
NUMMO_ADESSO="${d}T17:30:00Z" node src/sito.mjs
