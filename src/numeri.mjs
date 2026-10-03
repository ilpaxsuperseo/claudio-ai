// I numeri di Nummo: ogni notte, dal Mac di Luca, si leggono da Metricool i dati del brand Nummo
// (follower, visualizzazioni, interazioni, visite al sito) e dalla sua casella quante email aspettano.
// Finiscono in dati/numeri.json, che il ciclo del mattino gli mette davanti.
//   node src/numeri.mjs prepara   → scrive le letture da fare (le usa il guardiano notte/controlla-numeri.mjs)
//   node src/numeri.mjs raccogli  → dalle risposte grezze a dati/numeri.json
// La lettura vera la fa strumenti/numeri.sh con il connettore Metricool di Luca: solo letture, solo il brand Nummo.
import fs from 'node:fs'
import path from 'node:path'
import { RADICE, config, scriviJson, leggiJson, adesso, dataLocale } from './base.mjs'

export const RICHIESTE = path.join(RADICE, 'notte', 'numeri-richieste.json')
export const GREZZI = path.join(RADICE, 'notte', 'numeri-grezzi.jsonl')

// Le metriche, rete per rete. «ultimo» vuol dire che conta il valore dell'ultimo giorno, non la somma.
const METRICHE = {
  instagram: { IGEV01: 'follower', IGEV43: 'nuovi_follower', IGEV44: 'follower_persi', IGEV05: 'visualizzazioni', IGEV06: 'copertura', IGEV38: 'interazioni', IGEV40: 'condivisioni', IGEV39: 'condivisioni_reel', IGEV23: 'visualizzazioni_reel' },
  facebook: { FBEV17: 'follower', FBEV47: 'nuovi_follower', FBEV49: 'visualizzazioni', FBEV34: 'interazioni', FBEV15: 'condivisioni' },
  tiktok: { TKEV07: 'follower', TKEV16: 'nuovi_follower', TKEV02: 'visualizzazioni', TKEV06: 'interazioni', TKEV05: 'condivisioni' },
  x: { TTEV01: 'follower', TTEV03: 'nuovi_follower', TTEV11: 'visualizzazioni', TTEV16: 'interazioni', TTEV12: 'clic_sul_link' },
  sito: { WTEV02: 'visite', WTEV03: 'visitatori', WTEV01: 'pagine_viste' },
}
const ULTIMO = new Set(['follower'])
const EVOLUZIONE = Object.values(METRICHE).flatMap((m) => Object.keys(m))

function prepara() {
  const oggi = dataLocale()
  const da = dataLocale(new Date(adesso().getTime() - 7 * 86400000))
  const giorno = (d) => `${d}T00:00:00${offsetOggi()}`
  const periodo = { brandId: String(config.metricool.blog_id), from: giorno(da), to: giorno(oggi) }
  const richieste = [
    { etichetta: 'evoluzione', input: { ...periodo, metrics: EVOLUZIONE } },
    { etichetta: 'pagine', input: { ...periodo, metrics: ['WTPA01', 'WTPA02'] } },
    { etichetta: 'fonti', input: { ...periodo, metrics: ['WTSO01', 'WTSO02'] } },
  ]
  fs.writeFileSync(RICHIESTE, JSON.stringify(richieste, null, 2))
  fs.rmSync(GREZZI, { force: true })
  console.log(richieste.length)
}

function offsetOggi() {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: config.fuso, timeZoneName: 'longOffset' }).formatToParts(adesso()).find((p) => p.type === 'timeZoneName').value
  return nome === 'GMT' ? '+00:00' : nome.replace('GMT', '')
}

// La risposta di Metricool arriva dentro il risultato dello strumento: si cerca l'oggetto con «rows».
function righe(risposta) {
  const testo = typeof risposta === 'string' ? risposta : JSON.stringify(risposta)
  const trova = (t) => {
    try {
      const j = JSON.parse(t)
      if (j?.rows) return j.rows
      if (Array.isArray(j)) for (const x of j) { const r = trova(typeof x === 'string' ? x : x?.text ?? JSON.stringify(x)); if (r) return r }
      if (j?.content) return trova(JSON.stringify(j.content))
      if (typeof j?.text === 'string') return trova(j.text)
    } catch {}
    return null
  }
  return trova(testo) ?? []
}

const numero = (v) => (v == null || v === '' ? null : Number(v))

// Solo i messaggi che Nummo può leggere: quelli delle piattaforme e con codici restano nascosti e non si contano.
async function postaNonLetta() {
  try {
    const posta = await import('./posta.mjs')
    return posta.collegata() ? await posta.conta() : null
  } catch (e) {
    console.error(`Posta non letta: ${e.message}`)
    return null
  }
}

// Se Metricool non ha risposto a tutte le letture, i numeri di ieri restano: meglio vecchi che vuoti.
async function raccogli() {
  const risposte = fs.existsSync(GREZZI) ? fs.readFileSync(GREZZI, 'utf8').trim().split('\n').filter(Boolean).map((r) => JSON.parse(r)) : []
  const attese = JSON.parse(fs.readFileSync(RICHIESTE, 'utf8')).length
  if (risposte.length < attese) {
    console.log(`incompleti: ${risposte.length} letture su ${attese}, restano i numeri di prima`)
    process.exit(2)
  }
  const di = (etichetta) => righe(risposte.find((r) => r.etichetta === etichetta)?.risposta)
  // Evoluzione: una riga per giorno, con le metriche nell'ordine chiesto e la data (AAAAMMGG) in fondo.
  // Solo i giorni finiti: quello in corso Metricool lo manda con colonne di zeri che non tornano.
  // I giorni letti prima restano (la lettura copre una settimana sola): servono al piano della settimana.
  const oggi = dataLocale()
  const giorni = {}
  for (const riga of di('evoluzione')) {
    const d = String(riga.at(-1))
    const data = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    if (data >= oggi) continue
    giorni[data] ??= {}
    EVOLUZIONE.forEach((id, i) => {
      const [rete, nome] = Object.entries(METRICHE).map(([r, m]) => [r, m[id]]).find(([, n]) => n)
      const v = numero(riga[i])
      if (v == null) return
      giorni[data][rete] ??= {}
      giorni[data][rete][nome] = (giorni[data][rete][nome] ?? 0) + v
    })
  }
  const elenco = (etichetta) => di(etichetta).map((r) => [String(r[0]), numero(r[1]) ?? 0]).filter(([k]) => k && k !== 'null').sort((a, b) => b[1] - a[1]).slice(0, 10)
  const numeri = {
    aggiornato: adesso().toISOString(),
    letture: risposte.length,
    giorni: Object.fromEntries(Object.entries({ ...leggiJson('numeri.json', null)?.giorni, ...giorni }).filter(([d]) => d < oggi).sort().slice(-120)),
    sito: { pagine_piu_viste: elenco('pagine'), da_dove_arrivano: elenco('fonti') },
    posta: await postaNonLetta(),
  }
  scriviJson('numeri.json', numeri)
  console.log(`numeri: ${Object.keys(giorni).length} giorni, ${risposte.length} letture, posta ${numeri.posta ? `${numeri.posta.non_lette} non lette` : 'non letta'}`)
}

// Quello che il ciclo del mattino gli mette davanti: poche righe, i totali degli ultimi 7 giorni e di ieri.
export function riassunto(numeri) {
  if (!numeri?.aggiornato) return ['- ancora nessuno: si leggono ogni notte da Metricool']
  const intestazione = `Somme degli ultimi 7 giorni, tra parentesi quelle di ieri. Letti il ${new Date(numeri.aggiornato).toLocaleString('it-IT', { timeZone: config.fuso, dateStyle: 'short', timeStyle: 'short' })}.`
  const ieri = dataLocale(new Date(Date.parse(numeri.aggiornato) - 86400000))
  const settimanaFa = dataLocale(new Date(Date.parse(numeri.aggiornato) - 7 * 86400000))
  const date = Object.keys(numeri.giorni ?? {}).sort().filter((d) => d >= settimanaFa)
  const nomi = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X', sito: 'Sito nummo.it' }
  const righe = []
  for (const rete of Object.keys(METRICHE)) {
    const somma = {}
    const ultimo = {}
    for (const d of date) for (const [k, v] of Object.entries(numeri.giorni[d][rete] ?? {})) {
      if (ULTIMO.has(k)) ultimo[k] = v
      else somma[k] = (somma[k] ?? 0) + v
    }
    const ieriR = numeri.giorni[ieri]?.[rete] ?? {}
    const parti = Object.entries(somma).map(([k, v]) => `${k.replaceAll('_', ' ')} ${v} (${ieriR[k] ?? 0})`)
    if (parti.length || ultimo.follower != null) righe.push(`- ${nomi[rete]}: ${ultimo.follower != null ? `${ultimo.follower} follower. ` : ''}${parti.join(', ')}`)
  }
  const { pagine_piu_viste: pagine = [], da_dove_arrivano: fonti = [] } = numeri.sito ?? {}
  if (pagine.length) righe.push(`- Pagine più viste (7 giorni): ${pagine.slice(0, 5).map(([p, v]) => `${p} ${v}`).join(', ')}`)
  if (fonti.length) righe.push(`- Da dove arrivano le visite: ${fonti.slice(0, 5).map(([f, v]) => `${f} ${v}`).join(', ')}`)
  if (numeri.posta) righe.push(`- Posta ciao@nummo.it: ${numeri.posta.non_lette} email da leggere su ${numeri.posta.totali} che puoi leggere (i messaggi delle piattaforme e quelli con codici o accessi non contano: restano nascosti). Leggerle e rispondere si fa dai lavori nella casa, dallo sportello.`)
  return [intestazione, ...righe]
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const comando = process.argv[2]
  if (comando === 'prepara') prepara()
  else if (comando === 'raccogli') await raccogli()
  else console.log('uso: node src/numeri.mjs prepara | raccogli')
}
