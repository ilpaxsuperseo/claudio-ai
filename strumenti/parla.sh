#!/bin/zsh
# Parlare con Nummo dal Mac (lo usa la skill /nummo).
#   strumenti/parla.sh "messaggio"   → risponde lui, paga lui, la chiacchierata va nel suo diario
#   strumenti/parla.sh               → come sta
# I conti vivono su GitHub: prima ci si allinea, dopo si salva. Se in quel momento Nummo sta
# vivendo un suo ciclo, si aspetta che finisca: il libro dei conti lo scrive uno alla volta.
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.local/node22/bin:$PATH"
REPO=ilpaxsuperseo/nummo

for i in {1..40}; do
  n=$( { gh run list --repo $REPO --event schedule --status in_progress --json databaseId --jq length
         gh run list --repo $REPO --event schedule --status queued --json databaseId --jq length; } 2>/dev/null | awk '{s+=$1} END {print s+0}')
  [ "$n" = "0" ] && break
  [ $i = 1 ] && echo "Nummo sta vivendo il suo ciclo su GitHub: aspetto che finisca…"
  sleep 15
done

git pull -q --rebase --autostash origin main || { echo "Non riesco ad allinearmi con i conti su GitHub."; exit 1; }
[ -f .env ] && { set -a; . ./.env; set +a; }
node src/parla.mjs "$@" || exit 1

[ -z "$*" ] && exit 0
git add dati 2>/dev/null
git diff --cached --quiet && exit 0
git commit -q -m "Chiacchierata con Luca, giorno $(node -e "import('./src/base.mjs').then(b=>console.log(b.giornoDiVita()))")" &&
  git push -q origin main &&
  gh workflow run nummo.yml --repo $REPO -f ciclo=solo-sito >/dev/null 2>&1   # il sito si aggiorna da solo
