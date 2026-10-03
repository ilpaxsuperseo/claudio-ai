// Il piano della settimana (costituzione → piano). Il lunedì Nummo si dà da 1 a 3 obiettivi suoi, ognuno con
// una misura e un traguardo; il lunedì dopo il codice li confronta coi numeri veri: il libro dei conti e Metricool.
// Gli obiettivi li sceglie lui: il codice mette solo la scadenza e fa i conti. Lo scrive solo il ciclo su GitHub.
import { z } from 'zod'
import { config, leggiJson, scriviJson, dataLocale, adesso, euro } from './base.mjs'
import { voci } from './registro.mjs'

const FILE = 'piani.json'
const ENTRATE = ['guadagno', 'sostegno_pubblico', 'sponsor']
const RETI = { instagram: 'Instagram', tiktok: 'TikTok', x: 'X', facebook: 'Facebook' }

const sposta = (data, giorni) => new Date(Date.parse(`${data}T12:00:00Z`) + giorni * 86400000).toISOString().slice(0, 10)
export const lunediDi = (data = dataLocale()) => sposta(data, -((new Date(`${data}T12:00:00Z`).getUTCDay() + 6) % 7))
const domenicaDi = (lunedi) => sposta(lunedi, 6)

// Le entrate della settimana, dal libro dei conti: i soldi di Luca (capitale, sostegno, bonus, iniezioni) non contano.
// Conta il giorno del pagamento (pagato_il, da Stripe), non quello in cui è stato registrato.
const giornoDi = (v) => dataLocale(new Date(v.pagato_il ?? v.quando))
const entrate = (dal, al) => voci().filter((v) => ENTRATE.includes(v.tipo) && v.importo_eur > 0 && giornoDi(v) >= dal && giornoDi(v) <= al)

// Una metrica di Metricool sommata sui giorni della settimana; null se in quei giorni non c'è mai.
function somma(rete, chiave, dal, al) {
  let t = null
  for (const [d, reti] of Object.entries(leggiJson('numeri.json', null)?.giorni ?? {}))
    if (d >= dal && d <= al && reti[rete]?.[chiave] != null) t = (t ?? 0) + reti[rete][chiave]
  return t
}

// Nuovi follower: il totale dell'ultimo giorno della settimana meno quello del giorno prima che cominciasse
// (numeri.json tiene lo storico). Se manca uno dei due, la somma dei nuovi follower giorno per giorno
// (Facebook dà solo quella); se manca anche quella, la misura non c'è: meglio nessun numero che uno sbagliato.
function nuoviFollower(rete, dal, al) {
  const giorni = leggiJson('numeri.json', null)?.giorni ?? {}
  const inizio = giorni[sposta(dal, -1)]?.[rete]?.follower
  const fine = giorni[al]?.[rete]?.follower
  return inizio != null && fine != null ? fine - inizio : somma(rete, 'nuovi_follower', dal, al)
}

// Copertura: una misura di Metricool è completa solo se c'è ogni giorno della settimana (uno zero è un dato, un vuoto no).
function ogniGiorno(rete, chiave, dal, al) {
  const giorni = leggiJson('numeri.json', null)?.giorni ?? {}
  for (let d = dal; d <= al; d = sposta(d, 1)) if (giorni[d]?.[rete]?.[chiave] == null) return false
  return true
}
const totaliFollower = (rete, dal, al) => {
  const giorni = leggiJson('numeri.json', null)?.giorni ?? {}
  return giorni[sposta(dal, -1)]?.[rete]?.follower != null && giorni[al]?.[rete]?.follower != null
}

const sempre = () => true
export const MISURE = {
  entrate_eur: { cosa: 'euro entrati nel libro dei conti: vendite, mance, sponsor (i soldi di Luca non contano)', valore: (dal, al) => entrate(dal, al).reduce((t, v) => t + v.importo_eur, 0), completa: sempre, stripe: true },
  pagamenti: { cosa: 'quanti pagamenti hai ricevuto (vendite, mance, sponsor)', valore: (dal, al) => entrate(dal, al).length, completa: sempre, stripe: true },
  visite_sito: { cosa: 'visite a nummo.it (Metricool)', valore: (dal, al) => somma('sito', 'visite', dal, al), completa: (dal, al) => ogniGiorno('sito', 'visite', dal, al) },
  ...Object.fromEntries(Object.entries(RETI).flatMap(([rete, nome]) => [
    [`nuovi_follower_${rete}`, { cosa: `nuovi follower su ${nome} (Metricool)`, valore: (dal, al) => nuoviFollower(rete, dal, al), completa: (dal, al) => totaliFollower(rete, dal, al) || ogniGiorno(rete, 'nuovi_follower', dal, al) }],
    [`visualizzazioni_${rete}`, { cosa: `visualizzazioni su ${nome} (Metricool)`, valore: (dal, al) => somma(rete, 'visualizzazioni', dal, al), completa: (dal, al) => ogniGiorno(rete, 'visualizzazioni', dal, al) }],
  ])),
  altro: { cosa: 'qualcosa che il codice non sa misurare: lunedì prossimo lo giudichi tu', valore: () => null, completa: sempre },
}

export const Obiettivo = z.object({
  obiettivo: z.string().describe('Cosa vuoi ottenere entro domenica, in una frase.'),
  misura: z.enum(Object.keys(MISURE)).describe('Il numero che lo misura: lunedì prossimo il codice lo legge dai dati veri.'),
  traguardo: z.number().describe('Il valore da raggiungere in questa settimana (con «altro» metti 0).'),
})

const mostra = (misura, n) => (n == null ? 'nessun dato' : misura === 'entrate_eur' ? euro(n) : String(Math.round(n * 100) / 100))
export const piani = () => leggiJson(FILE, [])
const pianoDi = (lunedi) => piani().find((p) => p.settimana === lunedi)
const attivo = () => Boolean(config.piano) && dataLocale() >= config.piano.dal

// Serve un piano se è attivo e questa settimana non c'è ancora: di solito il lunedì, o il primo mattino utile.
export const serveIlPiano = () => attivo() && !pianoDi(lunediDi())

export function salvaPiano(obiettivi, giorno) {
  const scelti = obiettivi.filter((o) => o.obiettivo?.trim()).slice(0, config.piano.obiettivi_massimi ?? 3)
  if (!scelti.length || pianoDi(lunediDi())) return null
  const settimana = lunediDi()
  const piano = { settimana, al: domenicaDi(settimana), scritto: adesso().toISOString(), giorno, obiettivi: scelti.map(({ obiettivo, misura, traguardo }) => ({ obiettivo: obiettivo.trim(), misura, traguardo })) }
  scriviJson(FILE, [...piani(), piano])
  return piano
}

export const GIORNI_DI_ATTESA = 3

// A ogni mattino: i piani delle settimane finite ricevono la verifica coi numeri veri. Se i dati non sono ancora
// completi aspettano, fino a tre giorni dopo la domenica: poi si verifica lo stesso e si dice cosa mancava.
export function verificaPiani({ incassiLetti = true } = {}) {
  const tutti = piani()
  const fatti = []
  for (const p of tutti.filter((x) => !x.verifica && x.al < dataLocale())) {
    // Dati completi: ogni giorno della settimana da Metricool per le sue misure, e Stripe letto stamattina per quelle in euro.
    const scoperte = p.obiettivi.filter((o) => !MISURE[o.misura]?.completa(p.settimana, p.al)).map((o) => o.misura)
    const mancano = [scoperte.length && `i numeri di Metricool (${scoperte.join(', ')})`, !incassiLetti && p.obiettivi.some((o) => MISURE[o.misura]?.stripe) && 'gli incassi di Stripe'].filter(Boolean)
    if (mancano.length && dataLocale() <= sposta(p.al, GIORNI_DI_ATTESA)) continue
    p.verifica = {
      quando: adesso().toISOString(),
      numeri_letti: leggiJson('numeri.json', null)?.aggiornato ?? null,
      ...(mancano.length ? { dati_incompleti: mancano } : {}),
      risultati: p.obiettivi.map((o) => {
        const valore = MISURE[o.misura]?.valore(p.settimana, p.al) ?? null
        // Con giorni mancanti il valore è un minimo: se basta già è raggiunto, se no non si può dire.
        const incompleto = o.misura !== 'altro' && !MISURE[o.misura]?.completa(p.settimana, p.al)
        return { ...o, valore, ...(incompleto ? { incompleto } : {}), raggiunto: o.misura === 'altro' || valore == null ? null : valore >= o.traguardo ? true : incompleto ? null : false }
      }),
    }
    fatti.push(p)
  }
  if (fatti.length) scriviJson(FILE, tutti)
  return fatti
}

const esito = (r) => (r.raggiunto == null ? (r.misura === 'altro' ? 'questo lo giudichi tu' : r.valore == null ? 'non misurabile: mancano i dati' : 'non si può dire: mancano dei giorni') : `${r.raggiunto ? 'raggiunto' : 'non raggiunto'}${r.incompleto ? ' (anche senza i giorni mancanti)' : ''}`)
export const riassuntoVerifica = (p) => {
  const r = p.verifica.risultati
  const misurati = r.filter((x) => x.raggiunto != null)
  return `${misurati.filter((x) => x.raggiunto).length} obiettivi raggiunti su ${misurati.length} misurati${r.length > misurati.length ? `, ${r.length - misurati.length} senza un numero` : ''}${p.verifica.dati_incompleti ? ` (dati incompleti: mancavano ${p.verifica.dati_incompleti.join(' e ')})` : ''}`
}

// A che punto è un piano della settimana in corso, fino a ieri.
export function avanzamento(p) {
  const ieri = sposta(dataLocale(), -1)
  return p.obiettivi.map((o) => `«${o.obiettivo}» (${o.misura}): ${o.misura === 'altro' ? 'lo giudichi tu' : `${mostra(o.misura, ieri < p.settimana ? 0 : MISURE[o.misura].valore(p.settimana, ieri))} su ${mostra(o.misura, o.traguardo)}`}`)
}
export const pianoCorrente = () => (attivo() ? pianoDi(lunediDi()) ?? null : null)

// Le righe per il risveglio: com'è finita la settimana scorsa, a che punto è questa, e se serve, la richiesta del piano
// (solo quando la decisione ha il campo «piano», cioè al risveglio del mattino).
export function righe({ chiedi = true } = {}) {
  if (!attivo()) return []
  const lunedi = lunediDi()
  const scorso = pianoDi(sposta(lunedi, -7))
  const questo = pianoDi(lunedi)
  const out = ['', 'IL TUO PIANO DELLA SETTIMANA (lo dice la costituzione: gli obiettivi li scegli tu, i conti li fa il codice)']
  if (scorso?.verifica) {
    out.push(`La settimana scorsa (dal ${scorso.settimana} al ${scorso.al}): ${riassuntoVerifica(scorso)}.`)
    for (const r of scorso.verifica.risultati) out.push(`- «${r.obiettivo}» (${r.misura}): ${r.misura === 'altro' ? '' : `${mostra(r.misura, r.valore)} su ${mostra(r.misura, r.traguardo)}, `}${esito(r)}`)
  } else if (scorso) out.push(`La settimana scorsa (dal ${scorso.settimana} al ${scorso.al}): la verifica aspetta i numeri completi, al più tardi il ${sposta(scorso.al, GIORNI_DI_ATTESA + 1)}.`)
  else if (lunedi > config.piano.dal) out.push('La settimana scorsa non avevi un piano.')
  if (questo) {
    out.push(`Questa settimana (dal ${questo.settimana} a domenica ${questo.al}, scritto il giorno ${questo.giorno}). Finora, fino a ieri:`)
    for (const r of avanzamento(questo)) out.push(`- ${r}`)
  } else if (!chiedi) {
    out.push('Questa settimana non hai ancora un piano: lo scrivi al prossimo risveglio del mattino.')
  } else {
    out.push(`Questa settimana non hai ancora un piano. Scrivilo oggi nel campo «piano»: da 1 a ${config.piano.obiettivi_massimi ?? 3} obiettivi tuoi, fino a domenica ${domenicaDi(lunedi)}, ognuno con una misura e un traguardo. Lunedì prossimo il codice confronta i traguardi coi numeri veri, e il risultato va sul tuo sito. Le misure:`)
    for (const [k, m] of Object.entries(MISURE)) out.push(`- ${k}: ${m.cosa}`)
  }
  return out
}
