// Lo sportello: i servizi a pagamento di Nummo, con le chiavi di Luca che Nummo non vede mai.
// Gira come utente di Luca, solo per la durata di un lavoro notturno, su 127.0.0.1. Per Claude Code
// è un server MCP (JSON-RPC su HTTP); ogni chiamata ha un prezzo, si scrive in un registro e si
// ferma quando il tetto del lavoro è finito. I costi li registra poi il turno di notte nel libro dei conti.
// Lo avvia src/notte.mjs con: SPORTELLO_TETTO_EUR, SPORTELLO_CAMBIO, SPORTELLO_REGISTRO, SPORTELLO_CARTELLA.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { config } from './base.mjs'

const TETTO = Number(process.env.SPORTELLO_TETTO_EUR) || 0
const CAMBIO = Number(process.env.SPORTELLO_CAMBIO) || config.cambio_usd_eur_riserva
const REGISTRO = process.env.SPORTELLO_REGISTRO
const CARTELLA = process.env.SPORTELLO_CARTELLA
const S = config.servizi
const speso = () => (fs.existsSync(REGISTRO) ? fs.readFileSync(REGISTRO, 'utf8').trim().split('\n').filter(Boolean).reduce((t, r) => t + JSON.parse(r).costo_eur, 0) : 0)
const annota = (voce) => fs.appendFileSync(REGISTRO, JSON.stringify({ quando: new Date().toISOString(), ...voce }) + '\n')

class Rifiuto extends Error {}
function pagabile(stima) {
  const resta = TETTO - speso()
  if (stima > resta) throw new Rifiuto(`Tetto dello sportello raggiunto: per questa chiamata servono fino a ${stima.toFixed(3)} €, ne restano ${resta.toFixed(3)}.`)
}

// ElevenLabs. Mai voci clonate o professionali: sono persone vere (c'è quella di Luca).
const el = async (percorso, opzioni = {}) => {
  const r = await fetch(`https://api.elevenlabs.io${percorso}`, { ...opzioni, headers: { 'xi-api-key': process.env.NUMMO_ELEVENLABS_KEY, 'content-type': 'application/json', ...opzioni.headers } })
  if (!r.ok) throw new Rifiuto(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r
}
const VOCI_DI_PERSONE = ['cloned', 'professional']
const vietata = (v) => VOCI_DI_PERSONE.includes(v.category) || S.elevenlabs.voci_vietate.includes(v.voice_id)

// DataForSEO: il costo vero arriva nella risposta, in dollari.
async function dfs(percorso, compito, tipo) {
  pagabile(S.dataforseo.stima_usd[tipo] * CAMBIO)
  const auth = Buffer.from(`${process.env.NUMMO_DATAFORSEO_LOGIN}:${process.env.NUMMO_DATAFORSEO_PASSWORD}`).toString('base64')
  const r = await (await fetch(`https://api.dataforseo.com/v3/${percorso}`, { method: 'POST', headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify([compito]) })).json()
  if (r.cost > 0) annota({ servizio: 'dataforseo', cosa: percorso, costo_eur: r.cost * CAMBIO })
  const t = r.tasks?.[0]
  if (r.status_code !== 20000 || t?.status_code !== 20000) throw new Rifiuto(`DataForSEO: ${t?.status_message ?? r.status_message}`)
  return t.result ?? []
}
const dove = (a) => ({ location_name: a.paese || 'Italy', language_code: a.lingua || 'it' })
const parole = (a) => (Array.isArray(a.parole) ? a.parole : []).map(String).map((p) => p.trim()).filter(Boolean).slice(0, 20)

const STRUMENTI = {
  voci_disponibili: {
    serve: () => Boolean(process.env.NUMMO_ELEVENLABS_KEY),
    description: 'Le voci ElevenLabs che puoi usare (nome, descrizione, id). Non costa niente.',
    inputSchema: { type: 'object', properties: {} },
    async fai() {
      const { voices } = await (await el('/v1/voices')).json()
      return voices.filter((v) => !vietata(v)).map((v) => `${v.voice_id} — ${v.name} (${[v.labels?.gender, v.labels?.age, v.labels?.accent, v.labels?.description].filter(Boolean).join(', ')})`).join('\n')
    },
  },
  voce: {
    serve: () => Boolean(process.env.NUMMO_ELEVENLABS_KEY),
    description: `Trasforma un testo in voce (mp3) con ElevenLabs. Costa circa ${S.elevenlabs.euro_per_1000_crediti} € ogni 1000 caratteri. Il file finisce nella cartella dello sportello: il percorso te lo dico nella risposta, poi lo copi tu nella casa.`,
    inputSchema: { type: 'object', properties: { testo: { type: 'string', description: 'Al massimo 3000 caratteri.' }, voice_id: { type: 'string' }, nome_file: { type: 'string', description: 'Solo lettere, numeri e trattini.' } }, required: ['testo', 'voice_id', 'nome_file'] },
    async fai(a) {
      const testo = String(a.testo ?? '').trim()
      if (!testo || testo.length > 3000) throw new Rifiuto('Il testo va da 1 a 3000 caratteri.')
      const nome = String(a.nome_file ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60)
      if (!nome) throw new Rifiuto('Serve un nome_file fatto di lettere, numeri e trattini.')
      const v = await (await el(`/v1/voices/${encodeURIComponent(String(a.voice_id))}`)).json()
      if (vietata(v)) throw new Rifiuto('Questa voce è di una persona vera: non puoi usarla.')
      pagabile((testo.length / 1000) * S.elevenlabs.euro_per_1000_crediti)
      const r = await el(`/v1/text-to-speech/${encodeURIComponent(v.voice_id)}?output_format=mp3_44100_128`, { method: 'POST', body: JSON.stringify({ text: testo, model_id: S.elevenlabs.modello }) })
      const crediti = Number(r.headers.get('character-cost')) || testo.length
      const file = path.join(CARTELLA, `${nome}.mp3`)
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()))
      const costo = (crediti / 1000) * S.elevenlabs.euro_per_1000_crediti
      annota({ servizio: 'elevenlabs', cosa: `voce ${v.name}, ${crediti} crediti`, costo_eur: costo })
      return `Fatto: ${file} (${crediti} crediti, ${costo.toFixed(3)} €).`
    },
  },
  volumi_parole_chiave: {
    serve: () => Boolean(process.env.NUMMO_DATAFORSEO_PASSWORD),
    description: 'Quante ricerche al mese hanno fino a 20 parole chiave su Google (DataForSEO, dati Google Ads), con costo per clic e concorrenza. Costa qualche centesimo per chiamata.',
    inputSchema: { type: 'object', properties: { parole: { type: 'array', items: { type: 'string' } }, paese: { type: 'string', description: 'In inglese, es. Italy (predefinito), Spain, United States.' }, lingua: { type: 'string', description: 'Codice, es. it (predefinito), es, en.' } }, required: ['parole'] },
    async fai(a) {
      const righe = await dfs('keywords_data/google_ads/search_volume/live', { keywords: parole(a), ...dove(a) }, 'volumi')
      return righe.map((k) => `${k.keyword}: ${k.search_volume ?? '?'} ricerche/mese, CPC ${k.cpc ?? '?'} $, concorrenza ${k.competition ?? '?'}`).join('\n') || 'Nessun dato.'
    },
  },
  idee_parole_chiave: {
    serve: () => Boolean(process.env.NUMMO_DATAFORSEO_PASSWORD),
    description: 'Parole chiave collegate a quelle che dai, con le ricerche al mese (DataForSEO Labs). Costa qualche centesimo per chiamata.',
    inputSchema: { type: 'object', properties: { parole: { type: 'array', items: { type: 'string' } }, paese: { type: 'string' }, lingua: { type: 'string' }, quante: { type: 'number', description: 'Da 10 a 100, predefinito 30.' } }, required: ['parole'] },
    async fai(a) {
      const quante = Math.min(100, Math.max(10, Number(a.quante) || 30))
      const r = await dfs('dataforseo_labs/google/keyword_ideas/live', { keywords: parole(a).slice(0, 5), ...dove(a), limit: quante }, 'idee')
      return (r[0]?.items ?? []).map((k) => `${k.keyword}: ${k.keyword_info?.search_volume ?? '?'} ricerche/mese, CPC ${k.keyword_info?.cpc ?? '?'} $`).join('\n') || 'Nessuna idea.'
    },
  },
  risultati_google: {
    serve: () => Boolean(process.env.NUMMO_DATAFORSEO_PASSWORD),
    description: 'I primi 10 risultati di Google per una ricerca (titolo, indirizzo, descrizione). Costa meno di un centesimo.',
    inputSchema: { type: 'object', properties: { ricerca: { type: 'string' }, paese: { type: 'string' }, lingua: { type: 'string' } }, required: ['ricerca'] },
    async fai(a) {
      const r = await dfs('serp/google/organic/live/regular', { keyword: String(a.ricerca ?? '').slice(0, 200), ...dove(a), depth: 10 }, 'google')
      return (r[0]?.items ?? []).filter((i) => i.type === 'organic').map((i) => `${i.rank_absolute}. ${i.title}\n   ${i.url}\n   ${i.description ?? ''}`).join('\n') || 'Nessun risultato.'
    },
  },
}
export const attivi = () => Object.entries(STRUMENTI).filter(([, s]) => s.serve()).map(([nome]) => nome)

// Il minimo di MCP che serve a Claude Code: initialize, tools/list, tools/call. Risposte in JSON, niente flussi.
async function rispondi(msg) {
  const { id, method, params } = msg
  if (method === 'initialize') return { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sportello-di-nummo', version: '1' } }
  if (method === 'ping') return {}
  if (method === 'tools/list') return { tools: attivi().map((nome) => ({ name: nome, description: STRUMENTI[nome].description, inputSchema: STRUMENTI[nome].inputSchema })) }
  if (method === 'tools/call') {
    const s = STRUMENTI[params?.name]
    if (!s?.serve()) return { content: [{ type: 'text', text: 'Strumento non disponibile.' }], isError: true }
    try {
      return { content: [{ type: 'text', text: await s.fai(params.arguments ?? {}) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: e instanceof Rifiuto ? e.message : `Errore: ${e.message}` }], isError: true }
    }
  }
  throw Object.assign(new Error(`Metodo sconosciuto: ${method}`), { codice: -32601, id })
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  fs.mkdirSync(CARTELLA, { recursive: true })
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') return res.writeHead(405).end()
    let corpo = ''
    for await (const pezzo of req) corpo += pezzo
    let msg
    try {
      msg = JSON.parse(corpo)
    } catch {
      return res.writeHead(400).end()
    }
    if (msg.id === undefined) return res.writeHead(202).end() // una notifica: niente da rispondere
    let risposta
    try {
      risposta = { jsonrpc: '2.0', id: msg.id, result: await rispondi(msg) }
    } catch (e) {
      risposta = { jsonrpc: '2.0', id: msg.id, error: { code: e.codice ?? -32603, message: e.message } }
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(risposta))
  })
  server.listen(0, '127.0.0.1', () => console.log(`pronto ${server.address().port}`))
}
