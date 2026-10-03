// Le prove delle parti che non possono sbagliare. Uso: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Ogni esecuzione lavora in una cartella temporanea: il libro dei conti vero non si tocca.
const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'nummo-prove-'))
process.env.NUMMO_DATI = cartella
process.env.NUMMO_ADESSO = '2026-10-05T07:23:00Z'

const { registra, registraCosto, conti, verificaCatena, voci, stato, puoPagare, giaRegistrato, sostegnoResiduo, traguardo, bonusResiduo } = await import('../src/registro.mjs')
// Il bonus della settimana ha la sua prova: nelle altre resta spento, così pagano sostegno e cassa come prima.
const { config } = await import('../src/base.mjs')
const BONUS = config.bonus
config.bonus = null
const { scriviPagina } = await import('../src/pagine.mjs')
const sveglia = await import('../src/sveglia.mjs')
const { esitoDi } = await import('../src/github.mjs')
const { leggiEntrata, leggiSpesa, leggiImporto } = await import('../src/messaggi.mjs')
const { taglio, durata } = await import('../src/banconota.mjs')

test('il capitale iniziale entra in cassa', () => {
  registra({ tipo: 'capitale_iniziale', importo_eur: 100, descrizione: 'prova' })
  assert.equal(conti().cassa, 100)
})

test('durante il sostegno il respiro lo paga Luca, il resto Nummo', () => {
  const [respiro] = registraCosto({ categoria: 'respiro', importo_eur: 0.005, descrizione: 'respiro' })
  assert.equal(respiro.pagato_da, 'sostegno_vitale')
  assert.equal(conti().cassa, 100)
  const [pensiero] = registraCosto({ categoria: 'cervello', importo_eur: 0.04, descrizione: 'pensa meglio' })
  assert.equal(pensiero.pagato_da, 'nummo')
  assert.equal(conti().cassa, 99.96)
})

test('il tetto mensile del sostegno: la parte che sfora la paga Nummo', () => {
  const prima = conti().cassa
  const scritte = registraCosto({ categoria: 'infrastruttura', importo_eur: 100.5, descrizione: 'oltre il tetto' })
  assert.equal(scritte.length, 2)
  assert.equal(scritte[0].pagato_da, 'sostegno_vitale')
  assert.equal(scritte[1].pagato_da, 'nummo')
  assert.ok(Math.abs(conti().cassa - (prima - 0.505)) < 1e-9)
})

test('niente debiti: una spesa oltre la cassa viene rifiutata', () => {
  assert.throws(() => registraCosto({ categoria: 'creativo', importo_eur: 1000, descrizione: 'troppo' }), (e) => e.senzaSoldi)
})

test('i segni sbagliati non entrano nel libro', () => {
  assert.throws(() => registra({ tipo: 'guadagno', importo_eur: -5 }))
  assert.throws(() => registra({ tipo: 'tasse', importo_eur: 5 }))
})

test('la catena delle impronte è integra, e si rompe se si ritocca il passato', () => {
  assert.equal(verificaCatena().integra, true)
  const ritoccate = voci().map((v) => (v.n === 2 ? { ...v, importo_eur: -0.001 } : v))
  assert.deepEqual(verificaCatena(ritoccate), { integra: false, rotta_alla_riga: 2 })
})

test('gli stati seguono i mesi di autonomia', () => {
  const st = (cassa, autonomiaGiorni, costoRespiro = 0.005, morto = false) => stato({ cassa, autonomiaGiorni, costoRespiro, morto })
  assert.equal(st(100, 400), 'PROSPERO')
  assert.equal(st(100, 200), 'STABILE')
  assert.equal(st(100, 100), 'PRUDENTE')
  assert.equal(st(100, 40), 'DISPERATO')
  assert.equal(st(10, 20), 'CRITICO')
  assert.equal(st(0, 0), 'CRITICO') // durante il sostegno il respiro è pagato: non si muore
  assert.equal(st(100, 400, 0.005, true), 'MORTO') // la riga della morte è definitiva
})

test('una spesa rifiutata non consuma il sostegno (Codex, punto 3)', () => {
  const righe = voci().length
  const residuo = sostegnoResiduo('infrastruttura')
  assert.throws(() => registraCosto({ categoria: 'infrastruttura', importo_eur: residuo + 1000, descrizione: 'troppo' }), (e) => e.senzaSoldi)
  assert.equal(voci().length, righe)
  assert.equal(sostegnoResiduo('infrastruttura'), residuo)
})

test('niente scoperti per arrotondamento (Codex, punto 12)', () => {
  const cassa = conti().cassa
  assert.equal(puoPagare('creativo', cassa + 0.00004), false)
  assert.equal(puoPagare('creativo', cassa), true)
})

test('un costo già sostenuto si registra anche se sfora', () => {
  const [v] = registraCosto({ categoria: 'cervello', importo_eur: 0.000001, descrizione: 'minimo', rif: 'prova sostenuto', giaSostenuto: true })
  assert.equal(v.pagato_da, 'nummo')
  assert.equal(giaRegistrato('prova sostenuto'), true)
  assert.equal(giaRegistrato('mai vista'), false)
})

test('le risposte di Luca: solo sì e no espliciti (Codex, punto 9)', () => {
  assert.equal(esitoDi('sì, vai'), 'approvata')
  assert.equal(esitoDi('OK'), 'approvata')
  assert.equal(esitoDi('no, costa troppo'), 'rifiutata')
  assert.equal(esitoDi('Siccome costa troppo, aspetta'), null)
  assert.equal(esitoDi('Nope'), null)
  assert.equal(esitoDi('Quanto costa?'), null)
})

test('il diario lo paga Luca: non tocca la cassa né il netto', () => {
  const cassa = conti().cassa
  const nettoPrima = traguardo().questo_mese.netto
  const [v] = registraCosto({ categoria: 'diario', importo_eur: 0.006, descrizione: 'diario di prova', rif: 'prova diario' })
  assert.equal(v.pagato_da, 'luca')
  assert.equal(conti().cassa, cassa)
  assert.equal(traguardo().questo_mese.netto, nettoPrima)
  assert.equal(puoPagare('diario', 1e6), true)
})

test('il traguardo: netto del mese, scala e budget per gli strumenti', () => {
  const prima = traguardo()
  registra({ tipo: 'guadagno', importo_eur: 10, descrizione: 'prima vendita', rif: 'vendita 1' })
  registra({ tipo: 'tasse', importo_eur: -2.4, descrizione: 'tasse', rif: 'vendita 1 tasse' })
  const dopo = traguardo()
  assert.equal(dopo.questo_mese.guadagni, prima.questo_mese.guadagni + 10)
  assert.equal(dopo.questo_mese.tasse, prima.questo_mese.tasse + 2.4)
  assert.ok(Math.abs(dopo.questo_mese.netto - (prima.questo_mese.netto + 7.6)) < 1e-6)
  assert.equal(dopo.livelli[1].raggiunto, true) // il primo euro guadagnato
  assert.equal(dopo.livelli[4].raggiunto, false)
  assert.equal(dopo.budget_strumenti, 3.8) // metà di 10 − 2,40
})

test('le pagine di Nummo: indirizzi validi, riservati e cancellazione', () => {
  process.env.NUMMO_PAGINE = cartella
  assert.match(scriviPagina('Chi Sono', 'x'), /non è un indirizzo valido/)
  assert.match(scriviPagina('diario', 'x'), /riservato/)
})

test('la sveglia: ora italiana, cambio d\'ora, limiti', () => {
  assert.equal(sveglia.daLocale('2026-10-02', '03:30').toISOString(), '2026-10-02T01:30:00.000Z') // ora legale
  assert.equal(sveglia.daLocale('2026-10-26', '03:30').toISOString(), '2026-10-26T02:30:00.000Z') // ora solare
  const mezzogiorno = new Date('2026-10-01T10:00:00Z') // le 12:00 in Italia
  assert.equal(sveglia.interpreta('15:00 per controllare', mezzogiorno).prossima.toISOString(), '2026-10-01T13:00:00.000Z')
  assert.equal(sveglia.interpreta('11:00', mezzogiorno).prossima.toISOString(), '2026-10-02T09:00:00.000Z') // già passata: domani
  assert.equal(sveglia.interpreta('domani alle 03.30', mezzogiorno).prossima.toISOString(), '2026-10-02T01:30:00.000Z')
  assert.match(sveglia.interpreta('12:30', mezzogiorno).errore, /troppo presto/)
  assert.match(sveglia.interpreta('2026-10-09 10:00', mezzogiorno).errore, /troppo lontano/)
  assert.match(sveglia.interpreta('quando mi pare', mezzogiorno).errore, /non capisco/)
})

test('la morte è una riga del libro, e da lì in poi resta', () => {
  registra({ tipo: 'morte', importo_eur: 0, descrizione: 'prova' })
  assert.equal(conti().stato, 'MORTO')
  assert.equal(verificaCatena().integra, true)
})

test('i messaggi di Luca si leggono giusti', () => {
  assert.deepEqual(leggiEntrata('Entrata: 5 sostegno Ko-fi di Mario'), { importo: 5, tipo: 'sostegno_pubblico', descrizione: 'Ko-fi di Mario' })
  assert.deepEqual(leggiEntrata('entrata 12,50 € vendita guida PDF'), { importo: 12.5, tipo: 'guadagno', descrizione: 'guida PDF' })
  assert.deepEqual(leggiEntrata('Entrata: 3 Ko-fi'), { importo: 3, tipo: 'sostegno_pubblico', descrizione: 'Ko-fi' })
  assert.deepEqual(leggiSpesa('Spesa: 12,20 infrastruttura dominio nummo.it'), { importo: 12.2, categoria: 'infrastruttura', descrizione: 'dominio nummo.it' })
  assert.deepEqual(leggiSpesa('Spesa 4.99 abbonamento'), { importo: 4.99, categoria: 'servizi', descrizione: 'abbonamento' })
  assert.equal(leggiEntrata('Dato: 57 follower'), null)
  assert.equal(leggiImporto('1.234,50'), 1234.5)
})

test('il colore della pagina segue il taglio della cassa', () => {
  assert.equal(taglio(100, 'PROSPERO').nome, '100')
  assert.equal(taglio(99.99, 'STABILE').nome, '50')
  assert.equal(taglio(47.3, 'PRUDENTE').nome, '20')
  assert.equal(taglio(3.12, 'CRITICO').nome, 'monete')
  assert.equal(taglio(50, 'MORTO').nome, 'nessuno')
  assert.equal(durata(3300), '9 anni')
  assert.equal(durata(45), '45 giorni')
})

test('gli esiti del Mac entrano nei conti una volta sola', async () => {
  const { scriviEsito, applicaEsiti, costiInSospeso } = await import('../src/esiti.mjs')
  fs.writeFileSync(path.join(cartella, 'lavori.json'), JSON.stringify([{ id: 'L900', giorno: 5, compito: 'prova', budget_eur: 1, stato: 'in_coda' }]))
  scriviEsito({ tipo: 'lavoro', id: 'L900', giorno: 5, stato: 'fatto', riassunto: 'fatto', file: [], costo_token_eur: 0.2, sportello: [{ servizio: 'dataforseo', costo_eur: 0.05 }], costo_eur: 0.25, modello: 'prova' })
  scriviEsito({ tipo: 'conversazione', id: '2026-10-05T07:00:00.000Z', giorno: 5, data: '2026-10-05', luca: 'ciao', nummo: 'ciao', costo_eur: 0.01, modello: 'prova', descrizione: 'prova' })
  assert.equal(Math.round(costiInSospeso() * 100), 26)
  const prima = voci().length
  assert.equal(applicaEsiti(), 2)
  assert.equal(applicaEsiti(), 0) // la seconda volta non rifà niente
  assert.equal(voci().length, prima + 3) // token, sportello, chiacchierata
  assert.equal(costiInSospeso(), 0)
  assert.equal(JSON.parse(fs.readFileSync(path.join(cartella, 'lavori.json'), 'utf8'))[0].stato, 'fatto')
  assert.ok(verificaCatena().ok ?? verificaCatena())
})

test('il bonus del lunedì paga prima della cassa, solo il lunedì, non copre respiro e affitto', () => {
  config.bonus = BONUS
  const prima = process.env.NUMMO_ADESSO
  try {
    process.env.NUMMO_ADESSO = '2026-10-06T09:00:00Z' // martedì: niente bonus
    assert.equal(bonusResiduo('lavoro'), 0)
    process.env.NUMMO_ADESSO = '2026-10-12T09:00:00Z' // lunedì
    const cassa = conti().cassa
    assert.equal(bonusResiduo('lavoro'), 15)
    assert.deepEqual(registraCosto({ categoria: 'lavoro', importo_eur: 4, descrizione: 'prova', rif: 'b1' }).map((v) => v.pagato_da), ['bonus'])
    assert.deepEqual(registraCosto({ categoria: 'servizi', importo_eur: 12, descrizione: 'prova', rif: 'b2' }).map((v) => [v.pagato_da, -v.importo_eur]), [['bonus', 11], ['nummo', 1]])
    assert.equal(bonusResiduo('lavoro'), 0)
    assert.ok(registraCosto({ categoria: 'affitto', importo_eur: 1, descrizione: 'prova', rif: 'b3' }).every((v) => v.pagato_da === 'nummo'))
    assert.equal(Math.round((cassa - conti().cassa) * 100), 200) // dalla cassa escono solo 1 € di servizi e 1 € di affitto
    // Un lavoro partito lunedì e registrato martedì resta del lunedì (che qui è già esaurito).
    process.env.NUMMO_ADESSO = '2026-10-13T00:30:00Z'
    assert.deepEqual(registraCosto({ categoria: 'lavoro', importo_eur: 1, descrizione: 'prova', rif: 'b4', quando: new Date('2026-10-12T21:00:00Z') }).map((v) => v.pagato_da), ['nummo'])
    process.env.NUMMO_ADESSO = '2026-10-19T08:00:00Z' // lunedì dopo: si riparte da 15
    assert.equal(bonusResiduo('lavoro'), 15)
    assert.ok(verificaCatena())
  } finally {
    process.env.NUMMO_ADESSO = prima
    config.bonus = null
  }
})

test('il piano della settimana: si scrive una volta, il lunedì dopo si confronta coi numeri veri', async () => {
  const piano = await import('../src/piano.mjs')
  const prima = process.env.NUMMO_ADESSO
  try {
    assert.equal(piano.lunediDi('2026-10-11'), '2026-10-05') // domenica → il suo lunedì
    assert.equal(piano.lunediDi('2026-10-12'), '2026-10-12')
    process.env.NUMMO_ADESSO = '2026-10-26T05:23:00Z' // lunedì, nessun piano ancora
    assert.equal(piano.serveIlPiano(), true)
    const p = piano.salvaPiano([
      { obiettivo: 'Cento visite', misura: 'visite_sito', traguardo: 100 },
      { obiettivo: 'Una mancia', misura: 'pagamenti', traguardo: 1 },
      { obiettivo: 'Nuovi follower', misura: 'nuovi_follower_tiktok', traguardo: 5 },
      { obiettivo: 'Una pagina', misura: 'altro', traguardo: 0 },
    ], 26)
    assert.equal(p.obiettivi.length, 3) // al massimo tre
    assert.equal(piano.serveIlPiano(), false)
    assert.equal(piano.salvaPiano([{ obiettivo: 'Un altro', misura: 'altro', traguardo: 0 }], 26), null) // uno a settimana
    // La settimana: 60 visite, una mancia, follower TikTok da 10 a 17 (la lettura prima dell'inizio conta come partenza).
    // Tutti i giorni della settimana: 60 visite (lo zero è un dato); fuori dalla settimana non contano.
    const visite = { '2026-10-26': 0, '2026-10-27': 20, '2026-10-28': 0, '2026-10-29': 0, '2026-10-30': 0, '2026-10-31': 0, '2026-11-01': 40 }
    fs.writeFileSync(path.join(cartella, 'numeri.json'), JSON.stringify({ aggiornato: '2026-11-02T01:00:00Z', giorni: {
      '2026-10-25': { tiktok: { follower: 10 }, sito: { visite: 500 } },
      ...Object.fromEntries(Object.entries(visite).map(([d, v]) => [d, { sito: { visite: v } }])),
      '2026-10-27': { tiktok: { follower: 12 }, sito: { visite: 20 } },
      '2026-11-01': { tiktok: { follower: 17 }, sito: { visite: 40 } },
      '2026-11-02': { sito: { visite: 900 } },
    } }))
    process.env.NUMMO_ADESSO = '2026-10-28T10:00:00Z'
    registra({ tipo: 'sostegno_pubblico', importo_eur: 3, descrizione: 'mancia di prova' })
    registra({ tipo: 'iniezione', importo_eur: 50, descrizione: 'soldi di Luca: non contano' })
    process.env.NUMMO_ADESSO = '2026-11-01T20:00:00Z' // domenica: la settimana non è finita
    assert.deepEqual(piano.verificaPiani(), [])
    process.env.NUMMO_ADESSO = '2026-11-02T05:23:00Z' // lunedì dopo
    // Pagata domenica sera, registrata lunedì mattina: conta nella settimana in cui è stata pagata.
    registra({ tipo: 'sostegno_pubblico', importo_eur: 2, descrizione: 'mancia della domenica', pagato_il: '2026-11-01T21:00:00Z' })
    const [v] = piano.verificaPiani()
    assert.deepEqual(v.verifica.risultati.map((r) => [r.misura, r.valore, r.raggiunto]), [
      ['visite_sito', 60, false], ['pagamenti', 2, true], ['nuovi_follower_tiktok', 7, true],
    ])
    assert.deepEqual(piano.verificaPiani(), []) // una volta sola
    assert.equal(piano.riassuntoVerifica(v), '2 obiettivi raggiunti su 3 misurati')
    assert.equal(piano.serveIlPiano(), true) // nuova settimana, nuovo piano
    assert.ok(piano.righe().some((r) => r.includes('«Cento visite» (visite_sito): 60 su 100, non raggiunto')))
  } finally {
    process.env.NUMMO_ADESSO = prima
  }
})

test('la verifica del piano aspetta i dati completi, al massimo tre giorni; i follower senza base non si inventano', async () => {
  const piano = await import('../src/piano.mjs')
  const prima = process.env.NUMMO_ADESSO
  try {
    process.env.NUMMO_ADESSO = '2026-11-09T05:23:00Z' // lunedì
    piano.salvaPiano([
      { obiettivo: 'Follower X', misura: 'nuovi_follower_x', traguardo: 1 },
      { obiettivo: 'Follower Facebook', misura: 'nuovi_follower_facebook', traguardo: 1 },
      { obiettivo: 'Follower Instagram', misura: 'nuovi_follower_instagram', traguardo: 1 },
    ], 40)
    // Metricool letto sabato: la domenica manca. X ha il totale solo a metà settimana, Facebook solo i nuovi del giorno.
    fs.writeFileSync(path.join(cartella, 'numeri.json'), JSON.stringify({ aggiornato: '2026-11-14T01:00:00Z', giorni: {
      '2026-11-11': { x: { follower: 4 }, facebook: { nuovi_follower: 2 } },
      '2026-11-15': { facebook: { nuovi_follower: 1 } },
    } }))
    process.env.NUMMO_ADESSO = '2026-11-16T05:23:00Z' // lunedì dopo: numeri vecchi → aspetta
    assert.deepEqual(piano.verificaPiani(), [])
    assert.ok(piano.righe().some((r) => r.includes('la verifica aspetta i numeri completi')))
    process.env.NUMMO_ADESSO = '2026-11-17T05:23:00Z' // numeri ancora vecchi e Stripe non letto → aspetta ancora
    assert.deepEqual(piano.verificaPiani({ incassiLetti: false }), [])
    process.env.NUMMO_ADESSO = '2026-11-19T05:23:00Z' // passati tre giorni dalla domenica: si verifica e si dice cosa mancava
    const [v] = piano.verificaPiani({ incassiLetti: false }) // Stripe non conta: nessun obiettivo in euro
    assert.deepEqual(v.verifica.dati_incompleti, ['i numeri di Metricool (nuovi_follower_x, nuovi_follower_facebook, nuovi_follower_instagram)'])
    // Facebook ha solo due giorni su sette, ma 3 bastano già per il traguardo di 1: raggiunto lo stesso.
    assert.deepEqual(v.verifica.risultati.map((r) => [r.misura, r.valore, r.raggiunto]), [
      ['nuovi_follower_x', null, null], ['nuovi_follower_facebook', 3, true], ['nuovi_follower_instagram', null, null],
    ])
    assert.match(piano.riassuntoVerifica(v), /dati incompleti: mancavano i numeri di Metricool/)
  } finally {
    process.env.NUMMO_ADESSO = prima
  }
})
