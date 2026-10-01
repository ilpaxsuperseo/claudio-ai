#!/bin/zsh
# Ogni ora al minuto 50 (LaunchAgent com.masrepassaro.nummo-pubblica): se il post del giorno di Nummo è
# pronto e non è ancora uscito, lo programma su Metricool. Passa dal connettore Metricool dell'account di Luca, ma un guardiano
# (notte/controlla-pubblicazione.mjs) consente solo il post preparato, e solo sul brand di Nummo.
# Uso a mano: strumenti/pubblica.sh        → il post del giorno
#             strumenti/pubblica.sh casa   → il post che Nummo ha preparato di notte (lo lancia il turno di notte)
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.local/node22/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
C=$(ls -d ~/.vscode/extensions/anthropic.claude-code-*-darwin-arm64/resources/native-binary/claude | sort -V | tail -1)
N=$PWD

git pull -q --rebase --autostash origin main || { echo "Non riesco ad allinearmi con GitHub."; exit 1; }
if [ "$1" = casa ]; then esito=$(node src/pubblica.mjs prepara-casa /Users/Shared/nummo-casa/lavoro/da-pubblicare.json)
else esito=$(node src/pubblica.mjs prepara); fi
echo "$esito"
[[ "$esito" == pronto* ]] || exit 0

# L'immagine dev'essere già online: Metricool la scarica dall'indirizzo pubblico.
url=$(node -e "console.log(JSON.parse(require('fs').readFileSync('notte/da-pubblicare.json','utf8')).immagine)")
for i in {1..20}; do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" = 200 ] && break
  [ $i = 20 ] && { echo "L'immagine non è online: $url"; rm -f notte/da-pubblicare.json; set -a; . ./.env; set +a; node strumenti/avvisa.mjs "Il post di Nummo non è partito: l'immagine non era online ($url)."; exit 1; }
  sleep 30
done

cat > notte/pubblica-impostazioni.json <<EOF
{ "hooks": {
  "PreToolUse": [ { "matcher": ".*", "hooks": [ { "type": "command", "command": "node $N/notte/controlla-pubblicazione.mjs" } ] } ],
  "PostToolUse": [ { "matcher": "mcp__claude_ai_Metricool__createScheduledPost", "hooks": [ { "type": "command", "command": "node $N/notte/controlla-pubblicazione.mjs" } ] } ]
} }
EOF

quanti=$(node -e "console.log(JSON.parse(require('fs').readFileSync('notte/da-pubblicare.json','utf8')).posts.length)")
blog=$(node -e "console.log(JSON.parse(require('fs').readFileSync('notte/da-pubblicare.json','utf8')).blogId)")
cd /tmp && env -u ANTHROPIC_API_KEY "$C" -p "Chiama lo strumento createScheduledPost di Metricool esattamente $quanti volte, una dopo l'altra, per programmare i post di Nummo. Gli argomenti li completa da sé il sistema: ogni volta passa blogId \"$blog\", date e info anche provvisori. Non chiamare altri strumenti. Poi rispondi soltanto con gli identificativi dei post programmati separati da uno spazio, oppure con la parola ERRORE e il motivo." \
  --allowedTools "mcp__claude_ai_Metricool__createScheduledPost" --permission-mode dontAsk \
  --settings "$N/notte/pubblica-impostazioni.json" --model claude-haiku-4-5 --output-format json < /dev/null > "$N/notte/ultima-pubblicazione.json" 2> "$N/notte/ultima-pubblicazione.err"
cd "$N"

# Com'è andata lo dicono le risposte vere di Metricool, annotate dal guardiano (non il testo della sessione).
esito=$(node src/pubblica.mjs fatto); codice=$?
echo "$esito"
avvisa() { set -a; . ./.env; set +a; node strumenti/avvisa.mjs "$1"; }
if [ $codice = 1 ]; then
  avvisa "Il post di Nummo non è partito su Metricool: ${esito:0:300}. Riprovo al prossimo giro; se il collegamento Metricool chiede di rifare l'accesso, va rifatto su claude.ai."
  exit 1
fi
[ $codice = 3 ] && avvisa "Il post di Nummo è partito solo in parte: ${esito:0:300}"
git add dati/pubblicati.json && git commit -q -m "Post ${1:+della notte }programmato su Metricool" && git pull -q --rebase --autostash origin main && git push -q origin main
