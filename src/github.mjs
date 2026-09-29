// Il canale con Luca: le segnalazioni (issues) del repository.
// Nummo apre una richiesta, Luca risponde «sì» o «no» in un commento.
// Luca può anche aprirne lui: «Entrata: 5 sostegno Ko-fi», «Dato: 57 follower», «Stop».
// Conta solo ciò che scrive Luca: tutto il resto è ignorato.
import { config } from './base.mjs'

const repo = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
export const collegato = Boolean(repo && token)

async function gh(percorso, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(`https://api.github.com/repos/${repo}${percorso}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  if (!r.ok) throw new Error(`GitHub ${metodo} ${percorso}: ${r.status}`)
  return r.status === 204 ? null : r.json()
}

const diLuca = (x) => x.user?.login?.toLowerCase() === config.luca_github.toLowerCase()

// Tutte le pagine di un elenco (GitHub ne dà al massimo 100 per volta).
async function tutte(percorso) {
  const elenco = []
  for (let pagina = 1; pagina <= 20; pagina++) {
    const parte = await gh(`${percorso}${percorso.includes('?') ? '&' : '?'}per_page=100&page=${pagina}`)
    elenco.push(...parte)
    if (parte.length < 100) break
  }
  return elenco
}

// La decisione di Luca: la prima parola del commento dev'essere proprio sì/no (o sinonimi).
// «Siccome costa troppo…» non è un sì.
const FINE_PAROLA = '(?=$|[\\s.,;:!?])'
const SI = new RegExp(`^\\s*(s[iì]|ok|approvo|approvata)${FINE_PAROLA}`, 'i')
const NO = new RegExp(`^\\s*(no|rifiuto|rifiutata)${FINE_PAROLA}`, 'i')
export const esitoDi = (testo) => (SI.test(testo) ? 'approvata' : NO.test(testo) ? 'rifiutata' : null)

export async function apriRichiesta({ id, dettagli, importo_eur, giorno }) {
  if (!collegato) return null
  const issue = await gh('/issues', {
    metodo: 'POST',
    corpo: {
      title: `Richiesta ${id} · giorno ${giorno}${importo_eur > 0 ? ` · ${importo_eur} €` : ''}`,
      body: `${dettagli}\n\n---\nRispondi con un commento: **sì** per approvare, **no** per rifiutare. Puoi aggiungere una spiegazione dopo.`,
      labels: ['richiesta'],
    },
  })
  return issue.number
}

// Per ogni richiesta aperta cerca, fra tutti i commenti di Luca, l'ultima decisione esplicita.
export async function risposte(richieste) {
  if (!collegato) return []
  const esiti = []
  for (const r of richieste.filter((r) => r.stato === 'in_attesa' && r.issue)) {
    const decisioni = (await tutte(`/issues/${r.issue}/comments`))
      .filter(diLuca)
      .map((c) => ({ testo: c.body.trim(), esito: esitoDi(c.body) }))
      .filter((c) => c.esito)
    const ultima = decisioni.at(-1)
    if (!ultima) continue
    esiti.push({ id: r.id, esito: ultima.esito, risposta: ultima.testo })
    await gh(`/issues/${r.issue}`, { metodo: 'PATCH', corpo: { state: 'closed' } }).catch(() => {})
  }
  return esiti
}

// Messaggi aperti da Luca: entrate, spese, dati, stop. GitHub filtra già per autore.
export async function messaggiDiLuca() {
  if (!collegato) return []
  const aperte = await tutte(`/issues?state=open&creator=${encodeURIComponent(config.luca_github)}`)
  return aperte
    .filter((i) => diLuca(i) && !i.pull_request && !i.labels.some((l) => l.name === 'richiesta'))
    .map((i) => ({ numero: i.number, titolo: i.title.trim(), testo: (i.body ?? '').trim() }))
}

// Chiudere è una cortesia: se fallisce, il ciclo va avanti (le registrazioni non si ripetono comunque).
export async function chiudi(numero, nota) {
  if (!collegato) return
  try {
    if (nota) await gh(`/issues/${numero}/comments`, { metodo: 'POST', corpo: { body: nota } })
    await gh(`/issues/${numero}`, { metodo: 'PATCH', corpo: { state: 'closed' } })
  } catch (e) {
    console.error(`Chiusura della issue #${numero} non riuscita: ${e.message}`)
  }
}
