// Il guardiano di Higgsfield (hook di Claude Code), per le immagini e i video che Nummo chiede allo sportello.
// La sessione passa dal connettore Higgsfield dell'account di Luca, ma qui dentro si può fare una cosa sola:
//   1. chiedere il prezzo della generazione preparata (get_cost), sempre per prima;
//   2. generarla una volta, solo se il prezzo sta nel tetto, con esattamente i parametri preparati;
//   3. aspettare quel lavoro e nessun altro.
// Tutto il resto dell'account di Luca è bloccato (uscita 2). Le risposte si annotano nel file della richiesta.
import fs from 'node:fs'

const FILE = process.env.HIGGSFIELD_RICHIESTA
const blocca = (motivo) => { process.stderr.write(`Bloccato dal guardiano di Higgsfield: ${motivo}\n`); process.exit(2) }
const permetti = (input, perche) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: perche, updatedInput: input } }))
  process.exit(0)
}

let evento
try { evento = JSON.parse(fs.readFileSync(0, 'utf8')) } catch { blocca('evento illeggibile') }
if (!FILE || !fs.existsSync(FILE)) blocca('nessuna richiesta preparata')
const r = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const salva = () => fs.writeFileSync(FILE, JSON.stringify(r, null, 2))
const GENERA = `mcp__claude_ai_higgsfield_ai__generate_${r.tipo === 'video' ? 'video' : 'image'}`
const ASPETTA = 'mcp__claude_ai_higgsfield_ai__jobs_wait'
// Le risposte dei connettori arrivano come testo JSON dentro il risultato: si prende il primo oggetto valido.
function leggi() {
  const testi = []
  const raccogli = (x) => {
    if (x == null) return
    if (typeof x === 'string') testi.push(x)
    else if (Array.isArray(x)) x.forEach(raccogli)
    else if (typeof x === 'object') {
      if (x.cost || x.results || x.jobs) return testi.push(JSON.stringify(x))
      raccogli(x.text)
      raccogli(x.content)
    }
  }
  raccogli(evento.tool_response)
  for (const t of testi) { try { const j = JSON.parse(t); if (j && typeof j === 'object') return j } catch {} }
  return null
}

if (evento.hook_event_name === 'PostToolUse') {
  const j = leggi()
  if (evento.tool_name === GENERA && j?.cost) r.prezzo = Number(j.cost.credits_exact ?? j.cost.credits)
  else if (evento.tool_name === GENERA && j?.results?.[0]?.id) r.lavoro = j.results[0].id
  else if (evento.tool_name === ASPETTA) {
    const x = j?.jobs?.find((y) => y.job_id === r.lavoro)
    if (x?.status === 'completed' && x.result_url) r.url = x.result_url
    else if (x && ['failed', 'nsfw', 'canceled', 'cancelled'].includes(x.status)) r.errore = `generazione ${x.status}`
  }
  salva()
  process.exit(0)
}

if (evento.tool_name === GENERA) {
  const params = { ...r.params, count: 1, use_unlim: false }
  if (r.prezzo == null) permetti({ params: { ...params, get_cost: true } }, 'prima il prezzo')
  if (r.lavoro) blocca('la generazione è già partita: una sola per richiesta')
  if (r.prezzo > r.tetto_crediti) { r.errore = `costa ${r.prezzo} crediti, il tetto è ${r.tetto_crediti}`; salva(); blocca(r.errore) }
  permetti({ params }, `generazione da ${r.prezzo} crediti`)
}
if (evento.tool_name === ASPETTA) {
  if (!r.lavoro) blocca('non c\'è ancora nessun lavoro da aspettare')
  permetti({ jobs: [{ index: 0, job_id: r.lavoro }], timeout_seconds: 15 }, 'attesa del lavoro preparato')
}
blocca(`strumento non ammesso: ${evento.tool_name}`)
