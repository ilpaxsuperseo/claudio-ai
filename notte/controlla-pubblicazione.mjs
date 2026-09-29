// Il guardiano della pubblicazione (hook PreToolUse di Claude Code). Lascia passare una sola cosa:
// createScheduledPost sul brand di Nummo, e al posto degli argomenti scritti dalla sessione mette
// esattamente quelli preparati da src/pubblica.mjs (brand, data, testo, immagine, reti).
// Qualsiasi altro strumento di Metricool viene bloccato (uscita 2).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const blocca = (motivo) => { process.stderr.write(`Bloccato dal guardiano di Nummo: ${motivo}\n`); process.exit(2) }
const PAYLOAD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'da-pubblicare.json')

let evento
try { evento = JSON.parse(fs.readFileSync(0, 'utf8')) } catch { blocca('evento illeggibile') }
if (evento.tool_name !== 'mcp__claude_ai_Metricool__createScheduledPost') blocca(`strumento non ammesso: ${evento.tool_name}`)
if (!fs.existsSync(PAYLOAD)) blocca('non c\'è nessun post preparato')
const atteso = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'))
if (!/^\d+$/.test(atteso.blogId)) blocca('brand preparato non valido')

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    permissionDecisionReason: `post del giorno ${atteso.giorno} sul brand ${atteso.blogId}`,
    updatedInput: { blogId: atteso.blogId, date: atteso.date, info: JSON.stringify(atteso.info) },
  },
}))
process.exit(0)
