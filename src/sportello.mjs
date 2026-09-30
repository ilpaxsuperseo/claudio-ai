// Lo sportello: i servizi a pagamento di Nummo, con le chiavi di Luca che Nummo non vede mai.
// Gira come utente di Luca, solo per la durata di un lavoro notturno, su 127.0.0.1. Per Claude Code
// è un server MCP (JSON-RPC su HTTP); ogni chiamata ha un prezzo, si scrive in un registro e si
// ferma quando il tetto del lavoro è finito. I costi li registra poi il turno di notte nel libro dei conti.
// Lo avvia src/notte.mjs con: SPORTELLO_TETTO_EUR, SPORTELLO_CAMBIO, SPORTELLO_REGISTRO, SPORTELLO_CARTELLA.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { config } from './base.mjs'
import * as posta from './posta.mjs'
import * as higgsfield from './higgsfield.mjs'

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

const registro = () => (fs.existsSync(REGISTRO) ? fs.readFileSync(REGISTRO, 'utf8').trim().split('\n').filter(Boolean).map((r) => JSON.parse(r)) : [])
// Gli errori della posta che Nummo deve vedere (regole, non guasti) arrivano come rifiuti.
const conPosta = (f) => async (a) => {
  try {
    return await f(a)
  } catch (e) {
    throw e instanceof posta.RifiutoPosta ? new Rifiuto(e.message) : e
  }
}

// Higgsfield: i crediti sono di Luca, con un tetto al mese; il costo in euro lo paga Nummo.
function creditiDelMese() {
  const mese = new Date().toISOString().slice(0, 7)
  const cartella = path.dirname(REGISTRO)
  return fs.readdirSync(cartella).filter((f) => f.startsWith('sportello-') && f.endsWith('.jsonl'))
    .flatMap((f) => fs.readFileSync(path.join(cartella, f), 'utf8').trim().split('\n').filter(Boolean).map((r) => JSON.parse(r)))
    .filter((x) => x.servizio === 'higgsfield' && x.quando?.startsWith(mese)).reduce((t, x) => t + (x.crediti ?? 0), 0)
}
function generatore(tipo) {
  return async (a) => {
    const prompt = String(a.prompt ?? '').trim()
    if (!prompt) throw new Rifiuto('Serve un prompt: la descrizione di cosa generare.')
    const modello = a.modello || higgsfield.MODELLI[tipo][0]
    if (!higgsfield.MODELLI[tipo].includes(modello)) throw new Rifiuto(`Modelli possibili: ${higgsfield.MODELLI[tipo].join(', ')}.`)
    const nome = String(a.nome_file ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60)
    if (!nome) throw new Rifiuto('Serve un nome_file fatto di lettere, numeri e trattini.')
    const H = S.higgsfield
    const tettoCrediti = Math.floor(Math.min(H.crediti_al_mese - creditiDelMese(), (TETTO - speso()) / H.euro_per_credito) * 100) / 100
    if (tettoCrediti <= 0) throw new Rifiuto('Tetto raggiunto: fra i soldi di questo lavoro e i crediti del mese, non resta spazio per una generazione.')
    // Il costo lo scrive il guardiano nel registro nel momento in cui autorizza la generazione.
    const r = await higgsfield.genera({ tipo, prompt, modello, formato: a.formato, secondi: a.secondi, tettoCrediti, euroPerCredito: H.euro_per_credito })
    if (!r.url) throw new Rifiuto(r.errore ? `Higgsfield: ${r.errore}.` : r.avviata ? 'La generazione è partita ma non è finita in tempo: i crediti sono spesi.' : 'La generazione non è partita.')
    const est = (r.url.match(/\.(png|jpe?g|webp|mp4|mov)(\?|$)/i)?.[1] ?? (tipo === 'video' ? 'mp4' : 'png')).toLowerCase()
    const file = path.join(CARTELLA, `${nome}.${est}`)
    fs.writeFileSync(file, Buffer.from(await (await fetch(r.url)).arrayBuffer()))
    return `Fatto: ${file} (${r.prezzo} crediti, ${(r.prezzo * H.euro_per_credito).toFixed(3)} €).`
  }
}

const STRUMENTI = {
  immagine_ai: {
    serve: () => Boolean(S.higgsfield),
    description: `Genera un'immagine con Higgsfield. Si chiede sempre prima il prezzo: se sta nel tetto, si genera (per esempio ${higgsfield.MODELLI.immagine[0]} costa circa 0,25 crediti; un credito ti costa circa ${S.higgsfield?.euro_per_credito} €). Il file arriva nella cartella dello sportello. Può metterci qualche minuto.`,
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, modello: { type: 'string', enum: higgsfield.MODELLI.immagine }, formato: { type: 'string', enum: higgsfield.FORMATI }, nome_file: { type: 'string', description: 'Solo lettere, numeri e trattini.' } }, required: ['prompt', 'nome_file'] },
    fai: generatore('immagine'),
  },
  video_ai: {
    serve: () => Boolean(S.higgsfield),
    description: `Genera un video di 5 o 10 secondi con Higgsfield, da un testo. Si chiede sempre prima il prezzo: se sta nel tetto, si genera (per esempio 5 secondi con kling3_0 costano circa 10 crediti, con seedance_2_5 circa 35; un credito ti costa circa ${S.higgsfield?.euro_per_credito} €). Il file arriva nella cartella dello sportello. Può metterci diversi minuti.`,
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, modello: { type: 'string', enum: higgsfield.MODELLI.video }, formato: { type: 'string', enum: higgsfield.FORMATI }, secondi: { type: 'number', enum: [5, 10] }, nome_file: { type: 'string', description: 'Solo lettere, numeri e trattini.' } }, required: ['prompt', 'nome_file'] },
    fai: generatore('video'),
  },
  posta_arrivata: {
    serve: posta.collegata,
    description: 'Gli ultimi 20 messaggi arrivati a ciao@nummo.it, con uid, data, mittente (nome e dominio), oggetto e se l\'hai già letto o risposto. I messaggi delle piattaforme e quelli con codici o accessi restano nascosti. Non costa niente.',
    inputSchema: { type: 'object', properties: {} },
    fai: conPosta(() => posta.elenco(20)),
  },
  leggi_email: {
    serve: posta.collegata,
    description: 'Il testo di un messaggio arrivato a ciao@nummo.it (dal suo uid). Gli allegati non si aprono. Non costa niente.',
    inputSchema: { type: 'object', properties: { uid: { type: 'number' } }, required: ['uid'] },
    fai: conPosta((a) => posta.leggi(Number(a.uid))),
  },
  rispondi_email: {
    serve: posta.collegata,
    description: `Rispondere a un messaggio arrivato a ciao@nummo.it (dal suo uid). La risposta va solo a chi ti ha scritto, una volta per messaggio, con la tua firma da intelligenza artificiale aggiunta in fondo. Scrivere a indirizzi nuovi non si può. Al massimo ${posta.massimoRisposte()} risposte per lavoro. Non costa niente.`,
    inputSchema: { type: 'object', properties: { uid: { type: 'number' }, testo: { type: 'string', description: 'Il testo della risposta, senza firma: la aggiunge il sistema.' } }, required: ['uid', 'testo'] },
    fai: conPosta(async (a) => {
      if (registro().filter((x) => x.servizio === 'email').length >= posta.massimoRisposte()) throw new Rifiuto(`Hai già mandato ${posta.massimoRisposte()} risposte in questo lavoro: le altre al prossimo.`)
      const { dominio } = await posta.rispondi(Number(a.uid), a.testo)
      annota({ servizio: 'email', cosa: `risposta a un messaggio da @${dominio}`, costo_eur: 0 })
      return `Risposta mandata (a un indirizzo @${dominio}).`
    }),
  },
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
      // Il servizio è consumato: si registra subito, anche se poi il salvataggio del file fallisse.
      const crediti = Number(r.headers.get('character-cost')) || testo.length
      const costo = (crediti / 1000) * S.elevenlabs.euro_per_1000_crediti
      annota({ servizio: 'elevenlabs', cosa: `voce ${v.name}, ${crediti} crediti`, costo_eur: costo })
      const file = path.join(CARTELLA, `${nome}.mp3`)
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()))
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

// Una chiamata alla volta: tetti e quote si controllano e si scalano in fila, anche con richieste in parallelo.
let fila = Promise.resolve()
const inFila = (f) => {
  const p = fila.then(f, f)
  fila = p.catch(() => {})
  return p
}

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
      risposta = { jsonrpc: '2.0', id: msg.id, result: await (msg.method === 'tools/call' ? inFila(() => rispondi(msg)) : rispondi(msg)) }
    } catch (e) {
      risposta = { jsonrpc: '2.0', id: msg.id, error: { code: e.codice ?? -32603, message: e.message } }
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(risposta))
  })
  server.listen(0, '127.0.0.1', () => console.log(`pronto ${server.address().port}`))
}
