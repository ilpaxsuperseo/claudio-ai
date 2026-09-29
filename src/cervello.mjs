// Il cervello: chiama il modello, pretende una risposta nel formato stabilito
// e calcola quanto è costato pensare, in euro.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { config, leggiJson, scriviJson, dataLocale, arrotonda } from './base.mjs'

export const STRUMENTI = {
  non_fare_niente: 'Non fare niente oggi. Costa zero ed è una scelta valida.',
  pensa_meglio: 'Rifare il ragionamento di oggi con un modello più capace. Lo paghi tu, dalla tua cassa (circa 3-5 centesimi). In "dettagli" scrivi la domanda su cui vuoi pensare meglio.',
  chiedi_a_luca: 'Chiedere a Luca di fare una cosa che tu non puoi fare (aprire un account, comprare uno strumento, pubblicare qualcosa, collegare un servizio) o di approvare una spesa. In "dettagli" scrivi cosa, perché e cosa ti aspetti; in "importo_eur" quanto costa (0 se niente).',
}

export const Decisione = z.object({
  osservazione: z.string().describe('Cosa noti oggi nei tuoi conti e in ciò che è successo. Due o tre frasi, solo fatti.'),
  decisione: z.string().describe('Cosa decidi oggi, in una frase.'),
  motivo: z.string().describe('Perché, in due o tre frasi.'),
  azioni: z.array(z.object({
    strumento: z.enum(Object.keys(STRUMENTI)),
    dettagli: z.string(),
    importo_eur: z.number(),
  })).describe('Le azioni di oggi, anche nessuna.'),
  post: z.string().describe('Il tuo diario di oggi per i social, in prima persona, in italiano. 400-900 caratteri.'),
  frase: z.string().describe('Una frase sola, massimo 90 caratteri, che finirà sull\'immagine di oggi.'),
  lezione: z.string().describe('Cosa hai imparato di nuovo, in una frase. Stringa vuota se niente.'),
  strategia: z.string().describe('La tua strategia attuale per sopravvivere, in due frasi.'),
  fiducia: z.number().describe('Quanto sei sicuro della decisione, da 0 a 1.'),
})

// Il cambio del giorno dalla BCE, con riserva se il servizio non risponde.
async function cambioUsdEur() {
  const oggi = dataLocale()
  const salvato = leggiJson('cambio.json', null)
  if (salvato?.data === oggi) return salvato.usd_eur
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR', { signal: AbortSignal.timeout(8000) })
    const usd_eur = (await r.json()).rates.EUR
    if (!(usd_eur > 0.5 && usd_eur < 1.5)) throw new Error('cambio fuori scala')
    scriviJson('cambio.json', { data: oggi, usd_eur, fonte: 'BCE via frankfurter.dev' })
    return usd_eur
  } catch {
    return salvato?.usd_eur ?? config.cambio_usd_eur_riserva
  }
}

// Costo in euro di una chiamata, dai token effettivamente usati.
export async function costoEuro(livello, uso) {
  const m = config.modelli[livello]
  const usd =
    ((uso.input_tokens ?? 0) * m.input_usd +
      (uso.cache_creation_input_tokens ?? 0) * m.input_usd * 1.25 +
      (uso.cache_read_input_tokens ?? 0) * m.input_usd * 0.1 +
      (uso.output_tokens ?? 0) * m.output_usd) / 1e6
  return { usd: arrotonda(usd, 6), eur: arrotonda(usd * (await cambioUsdEur()), 6) }
}

const MAX_TOKENS = 4000
const FORMATO = zodOutputFormat(Decisione)

// Il costo massimo possibile di una chiamata, da verificare PRIMA di farla:
// input stimato con larghezza (2,5 caratteri per token) e tutti i token di uscita consentiti.
export async function costoMassimo(livello, testo) {
  const m = config.modelli[livello]
  const usd = (Math.ceil(testo.length / 2.5) * m.input_usd + MAX_TOKENS * m.output_usd) / 1e6
  return arrotonda(usd * (await cambioUsdEur()) * 1.1, 6)
}

const errore = (messaggio, dati) => Object.assign(new Error(messaggio), dati)

let client
export async function pensa({ livello, sistema, messaggio }) {
  const modello = config.modelli[livello].id
  if (process.env.CLAUDIO_CERVELLO === 'finto') return pensaFinto({ livello, modello, messaggio })

  client ??= new Anthropic()
  const risposta = await client.messages.create({
    model: modello,
    max_tokens: MAX_TOKENS,
    system: sistema,
    messages: [{ role: 'user', content: messaggio }],
    output_config: {
      format: { type: FORMATO.type, schema: FORMATO.schema },
      ...(livello === 'pensa_meglio' ? { effort: 'medium' } : {}),
    },
  })
  // Prima il conto, poi i controlli: una risposta troncata o sbagliata è comunque pagata.
  const costo = await costoEuro(livello, risposta.usage)
  const uso = risposta.usage
  if (risposta.stop_reason !== 'end_turn') throw errore(`Risposta interrotta (${risposta.stop_reason})`, { costo, modello, uso })
  const testo = risposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  let dati
  try { dati = JSON.parse(testo) } catch { throw errore('Risposta non in JSON', { costo, modello, uso }) }
  const verifica = Decisione.safeParse(dati)
  if (!verifica.success) throw errore(`Risposta fuori formato: ${verifica.error.issues[0]?.message}`, { costo, modello, uso })
  return { decisione: verifica.data, costo, modello, uso }
}

// Per le prove: nessuna chiamata, nessun costo vero, ma lo stesso giro completo.
async function pensaFinto({ livello, modello, messaggio }) {
  const uso = { input_tokens: Math.round(messaggio.length / 3.5) + 1500, output_tokens: 700 }
  const giorno = Number(messaggio.match(/Giorno di vita: (\d+)/)?.[1] ?? 1)
  const chiede = livello === 'respiro' && giorno % 5 === 3
  return {
    modello: `${modello} (finto)`,
    uso,
    costo: await costoEuro(livello, uso),
    decisione: {
      osservazione: `Giorno ${giorno}. I conti tornano, nessuna entrata.`,
      decisione: chiede ? 'Chiedo a Luca di aprirmi una pagina per il sostegno del pubblico.' : 'Oggi non spendo niente.',
      motivo: 'Simulazione: decisione di prova.',
      azioni: chiede
        ? [{ strumento: 'chiedi_a_luca', dettagli: 'Aprire una pagina Ko-fi per chi vuole sostenermi.', importo_eur: 0 }]
        : [{ strumento: 'non_fare_niente', dettagli: '', importo_eur: 0 }],
      post: `Diario di prova del giorno ${giorno}.`,
      frase: 'Oggi ho scelto di non spendere.',
      lezione: '',
      strategia: 'Spendere poco finché non trovo un modo di guadagnare.',
      fiducia: 0.6,
    },
  }
}
