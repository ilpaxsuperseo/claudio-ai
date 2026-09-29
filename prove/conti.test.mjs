// Le prove delle parti che non possono sbagliare. Uso: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Ogni esecuzione lavora in una cartella temporanea: il libro dei conti vero non si tocca.
const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'claudio-prove-'))
process.env.CLAUDIO_DATI = cartella
process.env.CLAUDIO_ADESSO = '2026-10-05T07:23:00Z'

const { registra, registraCosto, conti, verificaCatena, voci, stato, puoPagare, giaRegistrato, sostegnoResiduo } = await import('../src/registro.mjs')
const { esitoDi } = await import('../src/github.mjs')
const { leggiEntrata, leggiSpesa, leggiImporto } = await import('../src/messaggi.mjs')
const { taglio, durata } = await import('../src/banconota.mjs')

test('il capitale iniziale entra in cassa', () => {
  registra({ tipo: 'capitale_iniziale', importo_eur: 100, descrizione: 'prova' })
  assert.equal(conti().cassa, 100)
})

test('durante il sostegno il respiro lo paga Luca, il resto Claudio', () => {
  const [respiro] = registraCosto({ categoria: 'respiro', importo_eur: 0.005, descrizione: 'respiro' })
  assert.equal(respiro.pagato_da, 'sostegno_vitale')
  assert.equal(conti().cassa, 100)
  const [pensiero] = registraCosto({ categoria: 'cervello', importo_eur: 0.04, descrizione: 'pensa meglio' })
  assert.equal(pensiero.pagato_da, 'claudio')
  assert.equal(conti().cassa, 99.96)
})

test('il tetto mensile del sostegno: la parte che sfora la paga Claudio', () => {
  const prima = conti().cassa
  const scritte = registraCosto({ categoria: 'infrastruttura', importo_eur: 100.5, descrizione: 'oltre il tetto' })
  assert.equal(scritte.length, 2)
  assert.equal(scritte[0].pagato_da, 'sostegno_vitale')
  assert.equal(scritte[1].pagato_da, 'claudio')
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
  assert.equal(v.pagato_da, 'claudio')
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

test('la morte è una riga del libro, e da lì in poi resta', () => {
  registra({ tipo: 'morte', importo_eur: 0, descrizione: 'prova' })
  assert.equal(conti().stato, 'MORTO')
  assert.equal(verificaCatena().integra, true)
})

test('i messaggi di Luca si leggono giusti', () => {
  assert.deepEqual(leggiEntrata('Entrata: 5 sostegno Ko-fi di Mario'), { importo: 5, tipo: 'sostegno_pubblico', descrizione: 'Ko-fi di Mario' })
  assert.deepEqual(leggiEntrata('entrata 12,50 € vendita guida PDF'), { importo: 12.5, tipo: 'guadagno', descrizione: 'guida PDF' })
  assert.deepEqual(leggiEntrata('Entrata: 3 Ko-fi'), { importo: 3, tipo: 'sostegno_pubblico', descrizione: 'Ko-fi' })
  assert.deepEqual(leggiSpesa('Spesa: 12,20 infrastruttura dominio claudioai.it'), { importo: 12.2, categoria: 'infrastruttura', descrizione: 'dominio claudioai.it' })
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
