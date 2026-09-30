// Il guardiano dei numeri (hook di Claude Code). Prima di ogni chiamata (PreToolUse) lascia passare solo
// getAnalyticsDataByMetrics e al posto degli argomenti mette la prossima lettura preparata da
// src/numeri.mjs: sempre e solo il brand di Nummo. Dopo (PostToolUse) salva la risposta così com'è.
// Qualsiasi altro strumento di Metricool, o una lettura in più, viene bloccato (uscita 2).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = path.dirname(fileURLToPath(import.meta.url))
const RICHIESTE = path.join(QUI, 'numeri-richieste.json')
const GREZZI = path.join(QUI, 'numeri-grezzi.jsonl')
const blocca = (motivo) => { process.stderr.write(`Bloccato dal guardiano dei numeri: ${motivo}\n`); process.exit(2) }

let evento
try { evento = JSON.parse(fs.readFileSync(0, 'utf8')) } catch { blocca('evento illeggibile') }
if (evento.tool_name !== 'mcp__claude_ai_Metricool__getAnalyticsDataByMetrics') blocca(`strumento non ammesso: ${evento.tool_name}`)
if (!fs.existsSync(RICHIESTE)) blocca('nessuna lettura preparata')
const richieste = JSON.parse(fs.readFileSync(RICHIESTE, 'utf8'))

if (evento.hook_event_name === 'PostToolUse') {
  const r = richieste.find((x) => x.inviata && !x.ricevuta)
  if (r) {
    r.ricevuta = new Date().toISOString()
    fs.appendFileSync(GREZZI, JSON.stringify({ etichetta: r.etichetta, risposta: evento.tool_response }) + '\n')
    fs.writeFileSync(RICHIESTE, JSON.stringify(richieste, null, 2))
  }
  process.exit(0)
}

const r = richieste.find((x) => !x.inviata)
if (!r) blocca('le letture preparate sono già state fatte tutte')
r.inviata = new Date().toISOString()
fs.writeFileSync(RICHIESTE, JSON.stringify(richieste, null, 2))
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    permissionDecisionReason: `lettura «${r.etichetta}» sul brand ${r.input.brandId}`,
    updatedInput: r.input,
  },
}))
process.exit(0)
