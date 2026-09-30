#!/bin/zsh
# I numeri di Nummo (li lancia il turno di notte, dopo i lavori): da Metricool, con il connettore
# dell'account di Luca, si leggono i dati del brand Nummo. Un guardiano (notte/controlla-numeri.mjs)
# consente solo le letture preparate da src/numeri.mjs, e solo sul brand di Nummo.
# Uso a mano: strumenti/numeri.sh
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.local/node22/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
C=$(ls -d ~/.vscode/extensions/anthropic.claude-code-*-darwin-arm64/resources/native-binary/claude | sort -V | tail -1)
N=$PWD

git pull -q --rebase --autostash origin main || { echo "Non riesco ad allinearmi con GitHub."; exit 1; }
set -a; . ./.env; set +a
quante=$(node src/numeri.mjs prepara) || exit 1

cat > notte/numeri-impostazioni.json <<JSON
{ "hooks": {
  "PreToolUse": [ { "matcher": "mcp__claude_ai_Metricool__.*", "hooks": [ { "type": "command", "command": "node $N/notte/controlla-numeri.mjs" } ] } ],
  "PostToolUse": [ { "matcher": "mcp__claude_ai_Metricool__getAnalyticsDataByMetrics", "hooks": [ { "type": "command", "command": "node $N/notte/controlla-numeri.mjs" } ] } ]
} }
JSON

blog=$(node -e "console.log(require('./notte/numeri-richieste.json')[0].input.brandId)")
cd /tmp && env -u ANTHROPIC_API_KEY "$C" -p "Chiama lo strumento getAnalyticsDataByMetrics di Metricool esattamente $quante volte, una dopo l'altra. Gli argomenti li completa da sé il sistema: ogni volta passa brandId \"$blog\", from, to e metrics anche provvisori. Non chiamare altri strumenti. Poi rispondi soltanto: FATTO." \
  --allowedTools "mcp__claude_ai_Metricool__getAnalyticsDataByMetrics" --permission-mode dontAsk \
  --settings "$N/notte/numeri-impostazioni.json" --model claude-haiku-4-5 --output-format json < /dev/null > "$N/notte/numeri-sessione.json" 2>&1
cd "$N"

node src/numeri.mjs raccogli || exit 1
git add dati/numeri.json
git diff --cached --quiet || git commit -q -m "I numeri della notte"
git pull -q --rebase --autostash origin main && git push -q origin main
