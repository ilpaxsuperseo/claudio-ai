#!/bin/zsh
# Simulazione: N giorni con il cervello finto, in una cartella separata.
# Uso: strumenti/simula.sh 12   → simulazione/sito/index.html
cd "$(dirname "$0")/.." || exit 1
GIORNI=${1:-12}
rm -rf simulazione && mkdir -p simulazione
export CLAUDIO_DATI=simulazione/dati CLAUDIO_PAGINE=simulazione/pagine CLAUDIO_USCITA=simulazione/uscita CLAUDIO_SITO=simulazione/sito CLAUDIO_CERVELLO=finto CLAUDIO_DOMINIO=no
for g in $(seq 1 $GIORNI); do
  d=$(date -j -v+$((g-1))d -f "%Y-%m-%d" 2026-10-01 +%Y-%m-%d)
  [ -n "$SPESA" ] && CLAUDIO_ADESSO="${d}T04:00:00Z" node strumenti/spesa-finta.mjs $SPESA
  CLAUDIO_ADESSO="${d}T05:23:00Z" node src/ciclo.mjs mattina || exit 1
  CLAUDIO_ADESSO="${d}T17:23:00Z" node src/ciclo.mjs sera >/dev/null || exit 1
done
CLAUDIO_ADESSO="${d}T17:30:00Z" node src/sito.mjs
