// Il libro dei conti. Si aggiunge e basta: ogni riga porta l'impronta della precedente,
// quindi cambiare una cifra del passato rompe la catena e si vede.
// Gli importi si confrontano in milionesimi di euro (interi): niente scoperti per arrotondamento.
import crypto from 'node:crypto'
import { config, leggiJsonl, aggiungiJsonl, adesso, dataLocale, giornoDiVita, inSostegno, arrotonda } from './base.mjs'

const NOME = 'registro.jsonl'

// Tipi di voce e segno atteso dell'importo.
export const TIPI = {
  capitale_iniziale: +1,
  costo: -1,
  guadagno: +1,           // soldi incassati vendendo qualcosa che ha creato lui
  sostegno_pubblico: +1,  // chi sostiene l'esperimento
  sponsor: +1,
  iniezione: +1,          // soldi senza un'attività dietro
  tasse: -1,
  morte: 0,               // riga senza soldi: da qui in poi Claudio è spento, per sempre
}

// Il respiro del mattino; quello della sera (respiro_extra) lo paga Claudio.
export const PENSIERO = ['respiro', 'respiro_extra', 'cervello']

const impronta = (voce) => crypto.createHash('sha256').update(JSON.stringify(voce)).digest('hex')
const micro = (eur) => Math.round(eur * 1e6)

export const voci = () => leggiJsonl(NOME)
export const giaRegistrato = (rif, tutte = voci()) => tutte.some((v) => v.rif === rif)

function scrivi(dati) {
  const tutte = voci()
  const ultima = tutte.at(-1)
  if (!(dati.tipo in TIPI)) throw new Error(`Tipo di voce sconosciuto: ${dati.tipo}`)
  if (Math.sign(dati.importo_eur) !== TIPI[dati.tipo] && dati.importo_eur !== 0)
    throw new Error(`Segno sbagliato per ${dati.tipo}: ${dati.importo_eur}`)
  const voce = {
    n: (ultima?.n ?? 0) + 1,
    quando: adesso().toISOString(),
    giorno: giornoDiVita(),
    ...dati,
    importo_eur: arrotonda(dati.importo_eur, 6),
    prec: ultima?.hash ?? '0',
  }
  voce.hash = impronta(voce)
  aggiungiJsonl(NOME, voce)
  return voce
}

export const registra = (dati) => scrivi({ pagato_da: 'claudio', ...dati })

// Cassa di Claudio in milionesimi di euro.
export const cassaMicro = (tutte = voci()) =>
  tutte.filter((v) => v.pagato_da !== 'sostegno_vitale').reduce((s, v) => s + micro(v.importo_eur), 0)

// Quanto sostegno resta questo mese per una categoria (in euro; zero se la categoria non è coperta).
export function sostegnoResiduo(categoria, tutte = voci()) {
  const sv = config.sostegno_vitale
  if (!inSostegno() || !sv.copre.includes(categoria)) return 0
  const mese = dataLocale().slice(0, 7)
  const usatoMicro = tutte
    .filter((v) => v.pagato_da === 'sostegno_vitale' && dataLocale(new Date(v.quando)).slice(0, 7) === mese)
    .reduce((s, v) => s - micro(v.importo_eur), 0)
  return Math.max(0, micro(sv.tetto_mensile_eur) - usatoMicro) / 1e6
}

// Si può pagare questa cifra, fra sostegno residuo e cassa? Da chiedere PRIMA di spendere.
export function puoPagare(categoria, importo_eur, tutte = voci()) {
  const costo = micro(Math.abs(importo_eur))
  const coperto = Math.min(costo, micro(sostegnoResiduo(categoria, tutte)))
  return costo - coperto <= cassaMicro(tutte)
}

// Un costo lo paga il sostegno vitale se la categoria è coperta e il tetto del mese non è superato;
// il resto lo paga Claudio. Le due parti si controllano insieme prima di scrivere qualsiasi riga.
// "giaSostenuto": il servizio è già stato consumato (una chiamata al modello fatta): si registra
// comunque, perché nascondere una spesa è peggio che andare sotto zero.
export function registraCosto({ categoria, importo_eur, descrizione, rif, giaSostenuto = false }) {
  const tutte = voci()
  const costo = micro(Math.abs(importo_eur))
  const coperto = Math.min(costo, micro(sostegnoResiduo(categoria, tutte)))
  const resto = costo - coperto
  if (resto > cassaMicro(tutte) && !giaSostenuto)
    throw Object.assign(new Error(`Spesa rifiutata: servono ${(resto / 1e6).toFixed(4)} €, in cassa ce ne sono ${(cassaMicro(tutte) / 1e6).toFixed(4)}`), { senzaSoldi: true })
  const scritte = []
  if (coperto > 0) scritte.push(scrivi({ tipo: 'costo', categoria, importo_eur: -coperto / 1e6, pagato_da: 'sostegno_vitale', descrizione, rif }))
  if (resto > 0) scritte.push(scrivi({ tipo: 'costo', categoria, importo_eur: -resto / 1e6, pagato_da: 'claudio', descrizione, rif }))
  return scritte
}

export function verificaCatena(tutte = voci()) {
  let prec = '0'
  for (const v of tutte) {
    const { hash, ...resto } = v
    if (v.prec !== prec || impronta(resto) !== hash) return { integra: false, rotta_alla_riga: v.n }
    prec = hash
  }
  return { integra: true, righe: tutte.length }
}

// Media giornaliera degli ultimi 14 giorni per le voci scelte (in euro, positiva).
function mediaGiornaliera(tutte, filtro, oggi) {
  const finestra = Math.max(1, Math.min(14, oggi))
  const voci = tutte.filter((v) => v.tipo === 'costo' && filtro(v) && v.giorno > oggi - finestra && v.giorno <= oggi)
  if (oggi < 2 || voci.length === 0) return null
  return -voci.reduce((s, v) => s + v.importo_eur, 0) / finestra
}

// La fotografia dei conti a oggi.
export function conti(tutte = voci()) {
  const cassa = cassaMicro(tutte) / 1e6
  const somma = (filtro) => arrotonda(tutte.filter(filtro).reduce((s, v) => s + v.importo_eur, 0))
  const oggi = giornoDiVita()

  // Quanto costa vivere un giorno pagando tutto (autonomia), e quanto costa solo respirare (morte).
  const costoGiorno = mediaGiornaliera(tutte, () => true, oggi) ?? config.respiro_stimato_eur_giorno
  const costoRespiro = mediaGiornaliera(tutte, (v) => v.categoria === 'respiro', oggi) ?? config.respiro_stimato_eur_giorno
  const autonomiaGiorni = costoGiorno > 0 ? cassa / costoGiorno : Infinity
  const morto = tutte.some((v) => v.tipo === 'morte')

  return {
    giorno: oggi,
    cassa: arrotonda(cassa),
    capitale_iniziale: somma((v) => v.tipo === 'capitale_iniziale'),
    guadagni: somma((v) => v.tipo === 'guadagno'),
    sostegno_pubblico: somma((v) => v.tipo === 'sostegno_pubblico'),
    sponsor: somma((v) => v.tipo === 'sponsor'),
    iniezioni: somma((v) => v.tipo === 'iniezione'),
    tasse: somma((v) => v.tipo === 'tasse'),
    costi_pagati_da_claudio: somma((v) => v.tipo === 'costo' && v.pagato_da === 'claudio'),
    costi_pagati_dal_sostegno: somma((v) => v.tipo === 'costo' && v.pagato_da === 'sostegno_vitale'),
    costo_oggi: somma((v) => v.tipo === 'costo' && v.giorno === oggi),
    pensiero_oggi: somma((v) => v.tipo === 'costo' && v.giorno === oggi && PENSIERO.includes(v.categoria)),
    costo_giorno_medio: arrotonda(costoGiorno),
    costo_respiro_medio: arrotonda(costoRespiro, 6),
    autonomia_giorni: Number.isFinite(autonomiaGiorni) ? Math.max(0, Math.floor(autonomiaGiorni)) : null,
    in_sostegno: inSostegno(),
    stato: stato({ cassa, autonomiaGiorni, costoRespiro, morto }),
  }
}

// MORTO è definitivo (c'è la riga «morte»). Durante il sostegno il respiro è pagato: al massimo CRITICO.
// Dopo il sostegno si muore quando la cassa non basta più a pagare il prossimo respiro.
export function stato({ cassa, autonomiaGiorni, costoRespiro, morto = false }) {
  if (morto) return 'MORTO'
  if (cassa < costoRespiro) return inSostegno() ? 'CRITICO' : 'MORTO'
  const mesi = autonomiaGiorni / 30
  return config.stati.find((s) => mesi > s.sopra_mesi)?.nome ?? 'CRITICO'
}

// La cassa a fine di ogni giorno, per il grafico.
export function serieCassa(tutte = voci()) {
  const oggi = giornoDiVita()
  const serie = []
  let cassa = 0
  let i = 0
  const mie = tutte.filter((v) => v.pagato_da !== 'sostegno_vitale')
  for (let g = 1; g <= oggi; g++) {
    while (i < mie.length && mie[i].giorno <= g) cassa += micro(mie[i++].importo_eur)
    serie.push({ giorno: g, cassa: arrotonda(cassa / 1e6) })
  }
  return serie
}
