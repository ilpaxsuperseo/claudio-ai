// Il guardiano della pubblicazione (hook PreToolUse di Claude Code). Lascia passare una sola cosa:
// createScheduledPost sul brand di Nummo, e al posto degli argomenti scritti dalla sessione mette
// esattamente quelli preparati da src/pubblica.mjs (brand, data, testo, immagine, reti), un post
// alla volta e nell'ordine: ogni chiamata consuma il primo post non ancora mandato.
// Qualsiasi altro strumento di Metricool, o una chiamata in più, viene bloccato (uscita 2).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const blocca = (motivo) => { process.stderr.write(`Bloccato dal guardiano di Nummo: ${motivo}\n`); process.exit(2) }
const PAYLOAD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'da-pubblicare.json')

let evento
try { evento = JSON.parse(fs.readFileSync(0, 'utf8')) } catch { blocca('evento illeggibile') }
if (evento.tool_name === 'ToolSearch') process.exit(0) // caricare la descrizione degli strumenti non fa niente
if (evento.tool_name !== 'mcp__claude_ai_Metricool__createScheduledPost') blocca(`strumento non ammesso: ${evento.tool_name}`)
if (!fs.existsSync(PAYLOAD)) blocca('non c\'è nessun post preparato')
const atteso = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'))
if (!/^\d+$/.test(atteso.blogId)) blocca('brand preparato non valido')
// Dopo la chiamata (PostToolUse): si conserva la risposta di Metricool; il numero del post dice che è partito.
if (evento.hook_event_name === 'PostToolUse') {
  const mandato = atteso.posts?.find((p) => p.inviato && p.risposta == null)
  if (mandato) {
    const t = typeof evento.tool_response === 'string' ? evento.tool_response : JSON.stringify(evento.tool_response)
    mandato.risposta = t.slice(0, 600)
    mandato.confermato = t.match(/\\?"id\\?"\s*:\s*\\?"?(\d{5,})/)?.[1] ?? null
    fs.writeFileSync(PAYLOAD, JSON.stringify(atteso, null, 2))
  }
  process.exit(0)
}

const post = atteso.posts?.find((p) => !p.inviato)
if (!post) blocca('i post preparati sono già stati mandati tutti')
post.inviato = new Date().toISOString()
fs.writeFileSync(PAYLOAD, JSON.stringify(atteso, null, 2))

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    permissionDecisionReason: `post del giorno ${atteso.giorno} sul brand ${atteso.blogId} (${post.reti.join(', ')})`,
    updatedInput: { blogId: atteso.blogId, date: post.date, info: JSON.stringify(post.info) },
  },
}))
process.exit(0)
