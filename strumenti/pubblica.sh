#!/bin/zsh
# Ogni mattina (LaunchAgent com.masrepassaro.nummo-pubblica, 7:50 e 9:50): programma su Metricool
# il post del giorno di Nummo. Passa dal connettore Metricool dell'account di Luca, ma un guardiano
# (notte/controlla-pubblicazione.mjs) consente solo il post preparato, e solo sul brand di Nummo.
# Uso a mano: strumenti/pubblica.sh
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.local/node22/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
C=$(ls -d ~/.vscode/extensions/anthropic.claude-code-*-darwin-arm64/resources/native-binary/claude | sort -V | tail -1)
N=$PWD

git pull -q --rebase --autostash origin main || { echo "Non riesco ad allinearmi con GitHub."; exit 1; }
esito=$(node src/pubblica.mjs prepara); echo "$esito"
[[ "$esito" == pronto* ]] || exit 0

# L'immagine dev'essere già online: Metricool la scarica dall'indirizzo pubblico.
url=$(node -e "console.log(JSON.parse(require('fs').readFileSync('notte/da-pubblicare.json','utf8')).immagine)")
for i in {1..20}; do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" = 200 ] && break
  [ $i = 20 ] && { echo "L'immagine non è online: $url"; rm -f notte/da-pubblicare.json; exit 1; }
  sleep 30
done

cat > notte/pubblica-impostazioni.json <<EOF
{ "hooks": { "PreToolUse": [ { "matcher": "mcp__claude_ai_Metricool__.*", "hooks": [ { "type": "command", "command": "node $N/notte/controlla-pubblicazione.mjs" } ] } ] } }
EOF

cd /tmp && env -u ANTHROPIC_API_KEY "$C" -p "Chiama una sola volta lo strumento createScheduledPost di Metricool per programmare il post del giorno di Nummo. Gli argomenti li completa da sé il sistema: passa blogId \"$(node -e "console.log(JSON.parse(require('fs').readFileSync('$N/notte/da-pubblicare.json','utf8')).blogId)")\", date e info anche provvisori. Non chiamare altri strumenti. Poi rispondi soltanto con l'identificativo del post programmato, oppure con la parola ERRORE e il motivo." \
  --allowedTools "mcp__claude_ai_Metricool__createScheduledPost" --permission-mode dontAsk \
  --settings "$N/notte/pubblica-impostazioni.json" --model claude-haiku-4-5 --output-format json < /dev/null > "$N/notte/ultima-pubblicazione.json" 2> "$N/notte/ultima-pubblicazione.err"
cd "$N"

risposta=$(node -e "try{const r=JSON.parse(require('fs').readFileSync('notte/ultima-pubblicazione.json','utf8'));console.log(r.subtype==='success'&&!/ERRORE/i.test(r.result)?'OK '+r.result.trim().split(/\s+/)[0]:'ERRORE '+(r.result||r.subtype))}catch(e){console.log('ERRORE risposta illeggibile')}")
echo "$risposta"
[[ "$risposta" == OK* ]] || exit 1
node src/pubblica.mjs fatto "${risposta#OK }"
git add dati && git commit -q -m "Post del giorno programmato su Metricool" && git push -q origin main
