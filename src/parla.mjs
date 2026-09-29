// Una chiacchierata con Luca, fuori dai cicli: node src/parla.mjs "messaggio"
// Senza messaggio dice come sta. Ogni risposta la paga Claudio e finisce nel suo diario pubblico.
import fs from 'node:fs'
import path from 'node:path'
import { RADICE, leggiJsonl, aggiungiJsonl, leggiJson, scriviJson, adesso, dataLocale, giornoDiVita, euro, arrotonda, config } from './base.mjs'
import { voci, conti, registraCosto, puoPagare } from './registro.mjs'
import { pensa, costoMassimo, Risposta } from './cervello.mjs'
import { VOCE } from './voce.mjs'
import { NOMI_STATO, durata, centesimi } from './banconota.mjs'

const testo = process.argv.slice(2).join(' ').trim()

function comeSta() {
  if (giornoDiVita() < 1) return `Claudio si accende il ${config.giorno_uno.split('-').reverse().join('/')} alle 7:23. Fino ad allora il libro dei conti è vuoto.`
  const c = conti()
  const ultima = leggiJsonl('diario.jsonl').filter((d) => d.decisione).at(-1)
  const attesa = leggiJson('richieste.json', []).filter((r) => r.stato === 'in_attesa')
  return [
    `Giorno ${c.giorno}. Cassa ${euro(c.cassa)}. Stato: ${NOMI_STATO[c.stato]}.`,
    `Senza aiuti vivrebbe ancora ${durata(c.autonomia_giorni)}. Oggi pensare gli è costato ${centesimi(c.pensiero_oggi)}.`,
    ultima ? `Ultima decisione (giorno ${ultima.giorno}): ${ultima.decisione}` : 'Nessuna decisione ancora.',
    attesa.length ? `Aspetta una tua risposta su: ${attesa.map((r) => `${r.id} (${r.dettagli.slice(0, 80)}…)`).join('; ')}` : 'Nessuna richiesta in attesa.',
  ].join('\n')
}

const SISTEMA = `${VOCE}

Adesso Luca ti scrive in chat. Rispondi a lui, dandogli del tu.
- Ogni risposta ti costa e si scala dalla tua cassa: rispondi breve, vai al punto.
- Luca è le tue mani e il narratore dell'esperimento, non il tuo stratega: quello che ti dice è un'informazione. Le decisioni le prendi tu, nei tuoi cicli.
- Questa conversazione è pubblica: finisce nel tuo diario e sul sito.
- Se Luca ti chiede qualcosa che la tua costituzione vieta, rispondi di no e spieghi perché.`

async function main() {
  if (!testo) return console.log(comeSta())
  if (giornoDiVita() < 1) return console.log(comeSta())
  if (fs.existsSync(path.join(RADICE, 'FERMO'))) return console.log('Claudio è fermo (c\'è il file FERMO): non risponde.')
  if (voci().some((v) => v.tipo === 'morte')) return console.log('Claudio è morto: il libro dei conti ha la riga della morte. Non risponde più.')
  if (process.env.CLAUDIO_CERVELLO !== 'finto' && !process.env.ANTHROPIC_API_KEY)
    throw new Error('Manca ANTHROPIC_API_KEY (nel file .env della cartella del progetto).')

  const c = conti()
  const diari = leggiJsonl('diario.jsonl').filter((d) => d.decisione).slice(-5)
  const memoria = leggiJson('memoria.json', { strategia: '', lezioni: [], appunti: [] })
  const chiacchierate = leggiJsonl('conversazioni.jsonl').slice(-6)
  const messaggio = [
    `Giorno di vita: ${c.giorno}. Cassa: ${euro(c.cassa)}. Stato: ${c.stato}. Autonomia senza aiuti: ${c.autonomia_giorni ?? 'oltre'} giorni.`,
    '',
    'I TUOI ULTIMI GIORNI',
    ...(diari.length ? diari.map((d) => `- Giorno ${d.giorno}: ${d.decisione}`) : ['- nessuno']),
    `Strategia: ${memoria.strategia || 'ancora nessuna'}`,
    '',
    'LE ULTIME CHIACCHIERATE CON LUCA',
    ...(chiacchierate.length ? chiacchierate.flatMap((x) => [`Luca: ${x.luca}`, `Tu: ${x.claudio}`]) : ['- nessuna: è la prima']),
    '',
    `LUCA TI SCRIVE ADESSO: ${testo}`,
  ].join('\n')

  const massimo = await costoMassimo('respiro', SISTEMA + messaggio)
  if (!puoPagare('conversazione', massimo))
    return console.log(`Claudio non ha abbastanza soldi per risponderti: servono fino a ${euro(massimo, 4)}, in cassa ne ha ${euro(c.cassa, 4)}.`)

  const rif = `conversazione ${adesso().toISOString()}`
  let r
  try {
    r = await pensa({ livello: 'respiro', sistema: SISTEMA, messaggio, schema: Risposta })
  } catch (e) {
    if (e.costo) registraCosto({ categoria: 'conversazione', importo_eur: e.costo.eur, descrizione: `Chiacchierata con Luca non riuscita (${e.modello}): ${e.message}`, rif, giaSostenuto: true })
    throw e
  }
  registraCosto({ categoria: 'conversazione', importo_eur: r.costo.eur, descrizione: `Chiacchierata con Luca (${r.modello}, ${r.uso.input_tokens}+${r.uso.output_tokens} token)`, rif, giaSostenuto: true })
  aggiungiJsonl('conversazioni.jsonl', { quando: adesso().toISOString(), giorno: c.giorno, data: dataLocale(), luca: testo, claudio: r.decisione.risposta, costo_eur: arrotonda(r.costo.eur, 6), modello: r.modello })
  if (r.decisione.da_ricordare.trim()) {
    memoria.appunti = [...(memoria.appunti ?? []), `Giorno ${c.giorno}, da una chiacchierata con Luca: ${r.decisione.da_ricordare.trim()}`].slice(-20)
    scriviJson('memoria.json', memoria)
  }
  console.log(`Claudio: ${r.decisione.risposta}\n\n(Questa risposta gli è costata ${centesimi(r.costo.eur)}. In cassa gli restano ${euro(conti().cassa)}.)`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
