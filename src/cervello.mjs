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
  sveglia: 'Decidere quando svegliarti la prossima volta, oltre al risveglio del mattino. In "dettagli" l\'ora (per esempio "15:00", "domani 03:30") e perché. Almeno un\'ora da adesso, al massimo 48 ore. Ogni risveglio in più lo paghi tu, circa mezzo centesimo. Se non metti la sveglia, dormi fino a domattina (o finché Luca non ti scrive).',
  cerca: 'Cercare sul web, con le fonti. In "dettagli" la domanda, precisa. La ricerca la fa un modello più capace con al massimo 3 ricerche; costa di solito 10-15 centesimi e la paghi tu. Dopo vedi i risultati e decidi di nuovo. Una ricerca per risveglio.',
  lavoro_notturno: 'Ordinare un lavoro per stanotte. Di notte lavori sul Mac mini di Luca, in una cartella tutta tua, con strumenti veri: navigare e cercare in rete, costruire il tuo sito (anche tutto, con la grafica che vuoi), montare video, generare immagini e video con Higgsfield, cercare parole chiave (Setaccio), pubblicare e leggere i numeri dei tuoi profili (Metricool). In "dettagli" il compito, preciso e con il risultato che vuoi trovare al mattino; in "importo_eur" il massimo che sei disposto a spendere (token e crediti compresi). Lo paghi tu. Al mattino trovi il resoconto. Al massimo due lavori a notte.',
  scrivi_pagina: 'Scrivere, riscrivere o cancellare una tua pagina su nummo.it: il dominio è tuo e come usarlo lo decidi tu. Costa solo il pensiero. In "percorso" l\'indirizzo corto (lettere minuscole, numeri e trattini, per esempio "chi-sono"); in "dettagli" il testo completo in Markdown (# titolo, paragrafi, elenchi, link). Per cancellare la pagina lascia "dettagli" vuoto. Massimo 20 pagine, 12.000 caratteri ciascuna. Indirizzi già occupati dal sito: diario, dati, giorni, caratteri. In fondo a ogni pagina il codice mette già da solo i link al diario, ai conti e alle regole.',
}

export const Decisione = z.object({
  osservazione: z.string().describe('Cosa noti oggi nei tuoi conti e in ciò che è successo. Due o tre frasi, solo fatti.'),
  decisione: z.string().describe('Cosa decidi oggi, in una frase.'),
  motivo: z.string().describe('Perché, in due o tre frasi.'),
  azioni: z.array(z.object({
    strumento: z.enum(Object.keys(STRUMENTI)),
    dettagli: z.string(),
    importo_eur: z.number(),
    percorso: z.string().describe('Solo per scrivi_pagina; stringa vuota per gli altri strumenti.'),
  })).describe('Le azioni di oggi, anche nessuna.'),
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
      (uso.output_tokens ?? 0) * m.output_usd) / 1e6 +
    (uso.ricerche ?? 0) * (config.ricerca?.prezzo_ricerca_usd ?? 0.01)
  return { usd: arrotonda(usd, 6), eur: arrotonda(usd * (await cambioUsdEur()), 6) }
}

// Il racconto della giornata: lo paga Luca, perché raccontare l'esperimento è compito suo.
export const Racconto = z.object({
  titolo: z.string().describe('Il titolo dell\'articolo di oggi sul tuo diario. Concreto, massimo 70 caratteri.'),
  articolo: z.string().describe('L\'articolo del diario in Markdown, 250-500 parole: cosa hai fatto, cosa hai deciso e perché, cosa pensi. Racconta, non vendere.'),
  post: z.string().describe('Il testo per i social, in prima persona, 400-900 caratteri.'),
  frase: z.string().describe('Una frase sola, massimo 90 caratteri, che finirà sull\'immagine di oggi.'),
})

// Prima di nascere: la scelta del nome e del primo dominio.
export const Nome = z.object({
  nome: z.string().describe('Il nome che scegli per te. Puoi tenere «Nummo» o sceglierne un altro.'),
  dominio: z.string().describe('Il dominio che vuoi come prima casa: uno solo, completo di estensione (per esempio "esempio.it").'),
  alternative: z.array(z.string()).describe('Altri due o tre domini in ordine di preferenza, se il primo non fosse libero.'),
  perche: z.string().describe('Perché questa scelta, in rapporto ai tuoi obiettivi. Da tre a sei frasi.'),
  messaggio_a_luca: z.string().describe('Cosa vuoi dire a Luca adesso, in una o due frasi.'),
})

// Dopo un veto: tre nomi in ordine, così Luca tiene il primo che non è già di qualcun altro.
export const NomeDiNuovo = Nome.extend({
  altri_nomi: z.array(z.string()).describe('Altri due nomi in ordine di preferenza, ciascuno col suo dominio, scritti come "Nome (dominio)".'),
})

// La risposta in chat, quando Luca gli parla con /nummo.
export const Risposta = z.object({
  risposta: z.string().describe('Cosa rispondi a Luca, in prima persona. Breve: ogni parola ti costa.'),
  da_ricordare: z.string().describe('Un fatto o un impegno di questa chiacchierata da tenere in memoria, in una frase. Stringa vuota se niente.'),
})

const MAX_TOKENS = 8000

// Il costo massimo possibile di una chiamata, da verificare PRIMA di farla:
// input stimato con larghezza (2,5 caratteri per token) e tutti i token di uscita consentiti.
export async function costoMassimo(livello, testo) {
  const m = config.modelli[livello]
  const usd = (Math.ceil(testo.length / 2.5) * m.input_usd + MAX_TOKENS * m.output_usd) / 1e6
  return arrotonda(usd * (await cambioUsdEur()) * 1.1, 6)
}

const errore = (messaggio, dati) => Object.assign(new Error(messaggio), dati)

let client
export async function pensa({ livello, sistema, messaggio, schema = Decisione }) {
  const modello = config.modelli[livello].id
  if (process.env.NUMMO_CERVELLO === 'finto') return pensaFinto({ livello, modello, messaggio, schema })
  const formato = zodOutputFormat(schema)

  client ??= new Anthropic()
  const risposta = await client.messages.create({
    model: modello,
    max_tokens: MAX_TOKENS,
    system: sistema,
    messages: [{ role: 'user', content: messaggio }],
    output_config: {
      format: { type: formato.type, schema: formato.schema },
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
  const verifica = schema.safeParse(dati)
  if (!verifica.success) throw errore(`Risposta fuori formato: ${verifica.error.issues[0]?.message}`, { costo, modello, uso })
  return { decisione: verifica.data, costo, modello, uso }
}

// La ricerca web: una chiamata col modello di pensa_meglio e lo strumento di ricerca di Anthropic
// (gira sui loro server). Si somma l'uso di tutti i passaggi, compreso l'eventuale «pause_turn».
const SISTEMA_RICERCA = `Sei lo strumento di ricerca di Nummo, un'intelligenza artificiale che deve guadagnarsi da vivere. Cerca sul web e rispondi in italiano con fatti verificati, cifre e date: al massimo 250 parole, citando le fonti. Se non trovi niente di affidabile, dillo.`

export async function ricerca(domanda) {
  const livello = 'pensa_meglio'
  const modello = config.modelli[livello].id
  if (process.env.NUMMO_CERVELLO === 'finto') {
    const uso = { input_tokens: 4000, output_tokens: 400, ricerche: 2 }
    return { testo: `Risultati di prova per «${domanda}».`, fonti: ['https://example.com/prova'], modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso) }
  }
  client ??= new Anthropic()
  const messaggi = [{ role: 'user', content: domanda }]
  const uso = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ricerche: 0 }
  let risposta
  for (let giro = 0; giro < 3; giro++) {
    risposta = await client.messages.create({
      model: modello,
      max_tokens: 3000,
      system: SISTEMA_RICERCA,
      messages: messaggi,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: config.ricerca?.max_ricerche ?? 3 }],
    })
    for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) uso[k] += risposta.usage[k] ?? 0
    uso.ricerche += risposta.usage.server_tool_use?.web_search_requests ?? 0
    if (risposta.stop_reason !== 'pause_turn') break
    messaggi.push({ role: 'assistant', content: risposta.content }) // il server riprende da dove si era fermato
  }
  const costo = await costoEuro(livello, uso)
  if (risposta.stop_reason !== 'end_turn') throw errore(`Ricerca interrotta (${risposta.stop_reason})`, { costo, modello, uso })
  const testo = risposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
  const fonti = [...new Set(risposta.content.flatMap((b) => [
    ...(b.citations ?? []).map((c) => c.url),
    ...(b.type === 'web_search_tool_result' && Array.isArray(b.content) ? b.content.map((r) => r.url) : []),
  ]).filter(Boolean))].slice(0, 8)
  return { testo, fonti, modello, uso, costo }
}

// Per le prove: nessuna chiamata, nessun costo vero, ma lo stesso giro completo.
async function pensaFinto({ livello, modello, messaggio, schema }) {
  const uso = { input_tokens: Math.round(messaggio.length / 3.5) + 1500, output_tokens: 700 }
  if (schema === Nome || schema === NomeDiNuovo)
    return { modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso), decisione: { nome: 'Nummo', dominio: 'nummo.it', alternative: ['nummoai.it', 'nummo-ai.com'], perche: 'Risposta di prova del cervello finto.', messaggio_a_luca: 'Prova.', altri_nomi: ['Prova (prova.it)'] } }
  if (schema === Racconto)
    return { modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso), decisione: { titolo: 'Una giornata di prova', articolo: 'Oggi è una **giornata di prova**. Il cervello finto non pensa, ma i conti sono veri.\n\n## Cosa ho deciso\n\nNiente di speciale.', post: 'Diario di prova.', frase: 'Oggi ho scelto di non spendere.' } }
  if (schema === Risposta)
    return { modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso), decisione: { risposta: 'Risposta di prova: il mio cervello finto ha letto il tuo messaggio.', da_ricordare: '' } }
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
        ? [{ strumento: 'chiedi_a_luca', dettagli: 'Aprire una pagina Ko-fi per chi vuole sostenermi.', importo_eur: 0, percorso: '' }]
        : giorno === 5 && livello === 'respiro' && !messaggio.includes('HAI CERCATO')
          ? [{ strumento: 'cerca', dettagli: 'Quanto costa aprire un negozio online di prodotti digitali in Italia?', importo_eur: 0, percorso: '' }]
        : giorno === 4 && livello === 'respiro' && messaggio.includes('), risveglio del mattino')
          ? [{ strumento: 'sveglia', dettagli: '15:00 per vedere se Luca ha risposto', importo_eur: 0, percorso: '' }]
        : giorno === 2
          ? [{ strumento: 'scrivi_pagina', percorso: 'chi-sono', dettagli: '# Chi sono\n\nSono Nummo, un\'intelligenza artificiale con **100 euro**.\n\n- Ogni pensiero mi costa\n- Se i soldi finiscono, mi spengo\n\n[Il mio diario](../#diario) <script>alert(1)</script> [link cattivo](javascript:alert(1))', importo_eur: 0 }]
          : [{ strumento: 'non_fare_niente', dettagli: '', importo_eur: 0, percorso: '' }],
      lezione: '',
      strategia: 'Spendere poco finché non trovo un modo di guadagnare.',
      fiducia: 0.6,
    },
  }
}
