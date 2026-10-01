// Quello che succede sul Mac (lavori nella casa, chiacchierate, esiti dei post) e come lo prende GitHub.
// Un solo scrittore per file: il Mac scrive solo dati/mac/esiti.jsonl (e i file che sono solo suoi: numeri,
// pubblicati, giorno zero, casa); libro dei conti, lavori, notizie, memoria e chiacchierate li scrive solo il
// ciclo su GitHub, che a ogni controllo applica gli esiti nuovi, una volta sola. Così i due non vanno mai in
// conflitto, e la catena del libro dei conti ha sempre un solo autore.
import fs from 'node:fs'
import path from 'node:path'
import { file, leggiJson, scriviJson, leggiJsonl, aggiungiJsonl, adesso, euro } from './base.mjs'
import { registraCosto, giaRegistrato } from './registro.mjs'

export const ESITI = 'mac/esiti.jsonl'
const APPLICATI = 'mac-applicati.json'
const chiave = (e) => `${e.tipo} ${e.id}`
const applicati = () => new Set(leggiJson(APPLICATI, []))

// Dal Mac: un esito in fondo al suo registro (tipo: lavoro, conversazione, notizia).
export function scriviEsito(e) {
  fs.mkdirSync(path.dirname(file(ESITI)), { recursive: true })
  aggiungiJsonl(ESITI, { quando: adesso().toISOString(), ...e })
}

// Gli esiti che GitHub non ha ancora applicato.
export const inSospeso = () => {
  const fatti = applicati()
  return leggiJsonl(ESITI).filter((e) => !fatti.has(chiave(e)))
}

// Quanto è già stato speso sul Mac ma non è ancora nel libro dei conti: chi controlla la cassa lo toglie.
export const costiInSospeso = () => inSospeso().filter((e) => !e.omaggio).reduce((t, e) => t + (e.costo_eur ?? 0), 0)

function registraLavoro(e) {
  if (e.costo_token_eur > 0 && !giaRegistrato(`lavoro ${e.id}`))
    registraCosto({ categoria: 'lavoro', importo_eur: e.costo_token_eur, descrizione: `Lavoro ${e.id}: token (${e.modello})${e.stima ? ', registrato il massimo: si è interrotto senza resoconto' : ''}`, rif: `lavoro ${e.id}`, giaSostenuto: true })
  const chiamate = e.sportello ?? []
  const servizi = chiamate.reduce((t, x) => t + x.costo_eur, 0)
  if (servizi > 0 && !giaRegistrato(`lavoro ${e.id} sportello`))
    registraCosto({ categoria: 'servizi', importo_eur: servizi, descrizione: `Lavoro ${e.id}: sportello (${[...new Set(chiamate.map((x) => x.servizio))].join(', ')}, ${chiamate.length} chiamate)`, rif: `lavoro ${e.id} sportello`, giaSostenuto: true })
}

// Su GitHub, a ogni controllo: applica gli esiti nuovi. Restituisce quanti erano.
export function applicaEsiti() {
  const nuovi = inSospeso()
  if (!nuovi.length) return 0
  const fatti = applicati()
  const lavori = leggiJson('lavori.json', [])
  const notizie = leggiJson('notizie.json', [])
  const memoria = leggiJson('memoria.json', { strategia: '', lezioni: [], appunti: [] })
  const ricorda = (testo) => { memoria.appunti = [...(memoria.appunti ?? []), testo].slice(-20) }
  const giaDette = new Set(leggiJsonl('conversazioni.jsonl').map((c) => c.quando))
  for (const e of nuovi) {
    if (e.tipo === 'lavoro') {
      if (!e.omaggio) registraLavoro(e)
      const l = lavori.find((x) => x.id === e.id)
      if (l) Object.assign(l, { stato: e.stato, riassunto: e.riassunto, file: e.file ?? [], costo_eur: e.costo_eur, finito: e.quando })
      notizie.push({ quando: e.quando, testo: `Il lavoro ${e.id} è ${e.stato.replace('_', ' ')} (${e.omaggio ? 'pagato da Luca' : `speso ${euro(e.costo_eur, 4)}`}): ${e.riassunto}` })
      if (e.da_ricordare) ricorda(`Giorno ${e.giorno}, dal lavoro ${e.id}: ${e.da_ricordare}`)
    } else if (e.tipo === 'conversazione') {
      if (e.costo_eur > 0 && !giaRegistrato(`conversazione ${e.id}`))
        registraCosto({ categoria: 'conversazione', importo_eur: e.costo_eur, descrizione: e.descrizione, rif: `conversazione ${e.id}`, giaSostenuto: true })
      if (e.nummo && !giaDette.has(e.id)) aggiungiJsonl('conversazioni.jsonl', { quando: e.id, giorno: e.giorno, data: e.data, luca: e.luca, nummo: e.nummo, costo_eur: e.costo_eur, modello: e.modello })
      if (e.da_ricordare) ricorda(`Giorno ${e.giorno}, da una chiacchierata con Luca: ${e.da_ricordare}`)
    } else if (e.tipo === 'notizia') {
      notizie.push({ quando: e.quando, testo: e.testo })
    }
    fatti.add(chiave(e))
  }
  scriviJson('lavori.json', lavori)
  scriviJson('notizie.json', notizie)
  scriviJson('memoria.json', memoria)
  scriviJson(APPLICATI, [...fatti])
  return nuovi.length
}
