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

const { registra, registraCosto, conti, verificaCatena, voci, stato, puoPagare, giaRegistrato, sostegnoResiduo, traguardo } = await import('../src/registro.mjs')
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
