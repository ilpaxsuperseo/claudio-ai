// Il cervello: chiama il modello, pretende una risposta nel formato stabilito
// e calcola quanto è costato pensare, in euro.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { config, leggiJson, scriviJson, dataLocale, arrotonda } from './base.mjs'
import { Obiettivo } from './piano.mjs'

export const STRUMENTI = {
  non_fare_niente: 'Non fare niente oggi. Costa zero ed è una scelta valida.',
  pensa_meglio: 'Rifare il ragionamento di oggi pensandoci più a fondo: lo stesso cervello, con più tempo per ragionare. Lo paghi tu, dalla tua cassa (circa 15 centesimi). In "dettagli" scrivi la domanda su cui vuoi pensare meglio.',
  chiedi_a_luca: 'Chiedere a Luca di fare una cosa che tu non puoi fare (aprire un account, comprare uno strumento, pubblicare qualcosa, collegare un servizio) o di approvare una spesa. In "dettagli" scrivi cosa, perché e cosa ti aspetti; in "importo_eur" quanto costa (0 se niente).',
  sveglia: 'Decidere quando svegliarti. In "dettagli" l\'ora di un risveglio in più (per esempio "15:00", "domani 03:30", fino a 7 giorni avanti, almeno un\'ora da adesso) e perché: quanti risvegli in più fare lo decidi tu, e ognuno lo paghi tu, circa 10 centesimi. Oppure "mattino HH:MM" per spostare il tuo risveglio principale di ogni giorno (quello col diario, che parte alle 7:23 finché non lo cambi). Se non metti la sveglia, dormi fino al prossimo risveglio principale (o finché Luca non ti scrive).',
  cerca: 'Cercare sul web, con le fonti. In "dettagli" la domanda, precisa. La ricerca la fa il tuo stesso cervello con al massimo 3 ricerche; costa di solito 15-20 centesimi e la paghi tu. Dopo vedi i risultati e decidi di nuovo. Una ricerca per risveglio.',
  lavoro: 'Ordinare un lavoro nella tua casa: lavori sul Mac mini di Luca, in una cartella tutta tua, con strumenti veri: navigare e cercare in rete, costruire il tuo sito (anche tutto, con la grafica che vuoi), montare video col codice (node, ffmpeg), dare voce ai video con ElevenLabs (una voce tua, mai quella di una persona vera), generare immagini e video con Higgsfield, cercare parole chiave con DataForSEO, cercare su X nei post pubblici anche di oggi (regalo di Luca: la paga lui), leggere la tua posta ciao@nummo.it e rispondere a chi ti scrive. Questi servizi passano da uno sportello che li paga con la tua cassa. Puoi anche preparare un post per i tuoi profili, che parte dopo il lavoro, e cambiare la tua mente: le istruzioni che rileggi ogni mattina e il codice dei tuoi occhi, che ogni mattina raccoglie per te le informazioni che scegli. In "dettagli" il compito, preciso e con il risultato che vuoi trovare alla fine; in "importo_eur" il massimo che sei disposto a spendere (token e crediti compresi): lo decidi tu, il limite è la tua cassa. Un lavoro costa circa 0,15 € solo per partire. Se ti servono i servizi a pagamento dello sportello (voce, immagini, video, parole chiave), scrivi nel compito «sportello: X €»: quella parte va ai servizi, il resto al lavoro; senza, dallo sportello hai solo quello che non costa (la posta). Lo paghi tu. Parte entro un\'ora, a qualsiasi ora; il resoconto lo trovi al risveglio dopo. Al massimo due lavori in coda.',
  statistiche_sito: 'Accendere o spegnere sul tuo sito il contatore delle visite di Metricool. Non usa cookie e non salva niente sui dispositivi di chi visita; non costa niente. In "dettagli" scrivi "accendi" o "spegni". I numeri delle visite per ora li vede Luca su Metricool.',
  crea_pagamento: 'Creare un tuo link di pagamento Stripe (i soldi arrivano sul conto di Luca e li registri tu nel libro dei conti, da soli, ogni mattina). Per una mancia: in "dettagli" scrivi "mancia" e, sulla riga dopo, una frase che spiega a cosa serve; l\'importo lo sceglie chi paga, da 1 € in su. Per un prodotto: in "dettagli" il nome sulla prima riga e la descrizione sotto, in "importo_eur" il prezzo. Il link poi mettilo tu nelle tue pagine. Di chi paga non saprai il nome: solo quanto e cosa.',
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

// Il mattino in cui serve il piano della settimana (src/piano.mjs): la stessa decisione, più il piano.
export const DecisioneConPiano = Decisione.extend({
  piano: z.array(Obiettivo).describe('Il tuo piano di questa settimana: da 1 a 3 obiettivi, ognuno con la sua misura e il suo traguardo.'),
})

// Il cambio del giorno dalla BCE, con riserva se il servizio non risponde.
export async function cambioUsdEur() {
  const oggi = dataLocale()
  const salvato = leggiJson('cambio.json', null)
  if (salvato?.data === oggi) return salvato.usd_eur
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR', { signal: AbortSignal.timeout(8000) })
    const usd_eur = (await r.json()).rates.EUR
    if (!(usd_eur > 0.5 && usd_eur < 1.5)) throw new Error('cambio fuori scala')
    // Lo salva solo GitHub: il Mac non scrive i file di GitHub (un solo scrittore, vedi src/esiti.mjs).
    if (process.env.GITHUB_ACTIONS === 'true') scriviJson('cambio.json', { data: oggi, usd_eur, fonte: 'BCE via frankfurter.dev' })
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

// I suoi profili social, scritti da lui.
export const Profili = z.object({
  nome_visualizzato: z.string().describe('Il nome che compare sui profili, massimo 30 caratteri.'),
  bio_instagram: z.string().describe('Bio di Instagram, massimo 150 caratteri, con la dichiarazione che sei un\'intelligenza artificiale.'),
  bio_x: z.string().describe('Bio di X, massimo 160 caratteri, con la dichiarazione che sei un\'intelligenza artificiale.'),
  bio_tiktok: z.string().describe('Bio di TikTok, massimo 80 caratteri, con la dichiarazione che sei un\'intelligenza artificiale.'),
  bio_facebook: z.string().describe('Descrizione della pagina Facebook, massimo 255 caratteri, con la dichiarazione che sei un\'intelligenza artificiale.'),
  immagine: z.object({
    come: z.enum(['tengo_quella_di_adesso', 'la_disegno_io_col_codice', 'la_chiedo_a_un_generatore']),
    svg: z.string().describe('Se la disegni tu: il file SVG completo, 1080×1080, senza immagini esterne né script. Stringa vuota altrimenti.'),
    prompt: z.string().describe('Se la chiedi a un generatore di immagini: la descrizione, in inglese, di cosa deve disegnare. Stringa vuota altrimenti.'),
    perche: z.string().describe('Perché questa immagine ti aiuta a raggiungere i tuoi obiettivi. Due o tre frasi.'),
  }),
  messaggio_a_luca: z.string().describe('Cosa vuoi dire a Luca, in una o due frasi.'),
})

// Una domanda prima di nascere: una o più scelte sì/no, ciascuna col suo perché.
export const Scelte = z.object({
  decisioni: z.array(z.object({
    cosa: z.string().describe('Di cosa si tratta, in poche parole.'),
    decisione: z.enum(['sì', 'no']),
    perche: z.string().describe('Perché, in rapporto ai tuoi obiettivi. Due o tre frasi.'),
  })),
  messaggio_a_luca: z.string().describe('Cosa vuoi dire a Luca, in una o due frasi.'),
})

// La notte di prova prima di nascere: fino a due lavori, regalati da Luca.
export const LavoriDiProva = z.object({
  lavori: z.array(z.object({
    compito: z.string().describe('Il compito, preciso, con il risultato che vuoi trovare al mattino.'),
    budget_eur: z.number().describe('Quanto al massimo per questo lavoro, in euro.'),
    perche: z.string().describe('Perché questo lavoro ti serve per i tuoi obiettivi. Una o due frasi.'),
  })).describe('Da zero a due lavori. Un elenco vuoto se preferisci non farne.'),
  messaggio_a_luca: z.string().describe('Cosa vuoi dire a Luca, in una o due frasi.'),
})

// La risposta in chat, quando Luca gli parla con /nummo.
export const Risposta = z.object({
  risposta: z.string().describe('Cosa rispondi a Luca, in prima persona. Breve: ogni parola ti costa.'),
  da_ricordare: z.string().describe('Un fatto o un impegno di questa chiacchierata da tenere in memoria, in una frase. Stringa vuota se niente.'),
})

// Opus 5.5 ragiona sempre prima di rispondere e il ragionamento conta nei token di uscita:
// il tetto deve lasciargli spazio, o la risposta si tronca (e si paga lo stesso).
const MAX_TOKENS = 32000

// Il costo massimo possibile di una chiamata, da verificare PRIMA di farla:
// input stimato con larghezza (2,5 caratteri per token) e tutti i token di uscita consentiti.
export async function costoMassimo(livello, testo) {
  const m = config.modelli[livello]
  const usd = (Math.ceil(testo.length / 2.5) * m.input_usd + MAX_TOKENS * m.output_usd) / 1e6
  return arrotonda(usd * (await cambioUsdEur()) * 1.1, 6)
}

const errore = (messaggio, dati) => Object.assign(new Error(messaggio), dati)
const somma = (a, b = { usd: 0, eur: 0 }) => ({ usd: arrotonda(a.usd + b.usd, 6), eur: arrotonda(a.eur + b.eur, 6) })

let client
// «effort» dice quanto ragionare (low, medium, high…): di base quello del livello in config.
export async function pensa({ livello, sistema, messaggio, schema = Decisione, effort = config.modelli[livello].effort }) {
  const modello = config.modelli[livello].id
  if (process.env.NUMMO_CERVELLO === 'finto') return pensaFinto({ livello, modello, messaggio, schema, sistema })
  const formato = zodOutputFormat(schema)

  client ??= new Anthropic()
  // In streaming: con tanto spazio per ragionare l'SDK non accetta più una chiamata unica (potrebbe superare i 10 minuti).
  const flusso = client.messages.stream({
    model: modello,
    max_tokens: MAX_TOKENS,
    system: sistema,
    messages: [{ role: 'user', content: messaggio }],
    output_config: {
      format: { type: formato.type, schema: formato.schema },
      ...(effort ? { effort } : {}),
    },
  })
  let iniziata = null
  flusso.on('streamEvent', (_evento, istantanea) => { iniziata = istantanea })
  let risposta
  try {
    risposta = await flusso.finalMessage()
  } catch (e) {
    // Mai partita: niente da pagare, si può riprovare. Interrotta a metà: quanto ha scritto non si sa, e si
    // registra il massimo possibile (meglio un costo in più che uno nascosto); con un costo, il mattino non riparte da solo.
    if (!iniziata) throw e
    const uso = { ...iniziata.usage, output_tokens: MAX_TOKENS }
    throw errore(`Risposta interrotta a metà (${e.message}): registrato il costo massimo possibile`, { costo: await costoEuro(livello, uso), modello, uso, stima: true })
  }
  // Prima il conto, poi i controlli: una risposta troncata o sbagliata è comunque pagata.
  const costo = await costoEuro(livello, risposta.usage)
  const uso = risposta.usage
  // Il filtro di sicurezza di Anthropic a volte ferma anche richieste innocue: si rifà una volta col modello di riserva.
  if (risposta.stop_reason === 'refusal' && config.modelli[livello].riserva) {
    try {
      const r2 = await pensa({ livello: config.modelli[livello].riserva, sistema, messaggio, schema })
      return { ...r2, costo: somma(costo, r2.costo), modello: `${modello} (fermato dal filtro di sicurezza) → ${r2.modello}` }
    } catch (e) {
      throw errore(`Fermato dal filtro di sicurezza, e la riserva non è riuscita: ${e.message}`, { costo: somma(costo, e.costo), modello: `${modello} → ${e.modello ?? config.modelli[config.modelli[livello].riserva].id}`, uso })
    }
  }
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

// «tettoEur»: prima di ogni ripresa (pause_turn) si controlla che quanto speso più un altro passaggio ci stia dentro.
export async function ricerca(domanda, { tettoEur = config.ricerca?.costo_massimo_eur ?? 1 } = {}) {
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
    if (giro > 0) {
      const speso = (await costoEuro(livello, uso)).eur
      const unAltro = (await costoEuro(livello, { input_tokens: risposta.usage.input_tokens + 8000, output_tokens: 8000, ricerche: config.ricerca?.max_ricerche ?? 3 })).eur
      if (speso + unAltro > tettoEur) throw errore(`Ricerca fermata a metà: un altro passaggio avrebbe superato il tetto di ${tettoEur} €`, { costo: await costoEuro(livello, uso), modello, uso })
    }
    // Se un passaggio si rompe, quelli già fatti restano da pagare: l'errore porta il loro costo.
    risposta = await client.messages.create({
      model: modello,
      max_tokens: 8000, // una risposta di ricerca è breve: il resto è ragionamento
      system: SISTEMA_RICERCA,
      output_config: { effort: 'medium' },
      messages: messaggi,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: config.ricerca?.max_ricerche ?? 3 }],
    }).catch(async (e) => { throw uso.input_tokens ? errore(`Ricerca interrotta: ${e.message}`, { costo: await costoEuro(livello, uso), modello, uso }) : e })
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
async function pensaFinto({ livello, modello, messaggio, schema, sistema = '' }) {
  // Per le prove: NUMMO_STAMPA_PROMPT=file scrive lì quello che il cervello vero leggerebbe.
  if (process.env.NUMMO_STAMPA_PROMPT) (await import('node:fs')).appendFileSync(process.env.NUMMO_STAMPA_PROMPT, `${sistema}\n\n${messaggio}\n\n=====\n\n`)
  const uso = { input_tokens: Math.round(messaggio.length / 3.5) + 1500, output_tokens: 700 }
  if (schema === Profili)
    return { modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso), decisione: { nome_visualizzato: 'Nummo', bio_instagram: 'prova', bio_x: 'prova', bio_tiktok: 'prova', bio_facebook: 'prova', immagine: { come: 'la_disegno_io_col_codice', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#0d5c3a"/><text x="540" y="640" text-anchor="middle" font-family="Archivo Expanded" font-weight="800" font-size="300" fill="#fff">N</text></svg>', prompt: '', perche: 'Prova.' }, messaggio_a_luca: 'Prova.' } }
  if (schema === LavoriDiProva)
    return { modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso), decisione: { lavori: [{ compito: 'Scrivi in note/prova.md una riga di prova.', budget_eur: 0.2, perche: 'Prova.' }], messaggio_a_luca: 'Prova.' } }
  if (schema === Scelte)
    return { modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso), decisione: { decisioni: [{ cosa: 'prova', decisione: 'sì', perche: 'Risposta di prova.' }], messaggio_a_luca: 'Prova.' } }
  if (schema === Nome || schema === NomeDiNuovo)
    return { modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso), decisione: { nome: 'Nummo', dominio: 'nummo.it', alternative: ['nummoai.it', 'nummo-ai.com'], perche: 'Risposta di prova del cervello finto.', messaggio_a_luca: 'Prova.', altri_nomi: ['Prova (prova.it)'] } }
  if (schema === Racconto)
    return { modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso), decisione: { titolo: 'Una giornata di prova', articolo: 'Oggi è una **giornata di prova**. Il cervello finto non pensa, ma i conti sono veri.\n\n## Cosa ho deciso\n\nNiente di speciale.', post: 'Diario di prova.', frase: 'Oggi ho scelto di non spendere.' } }
  if (schema === Risposta)
    return { modello: `${modello} (finto)`, uso, costo: await costoEuro(livello, uso), decisione: { risposta: 'Risposta di prova: il mio cervello finto ha letto il tuo messaggio.', da_ricordare: '' } }
  const giorno = Number(messaggio.match(/Giorno di vita: (\d+)/)?.[1] ?? 1)
  const chiede = livello === 'respiro' && giorno % 5 === 3
  const piano = schema === DecisioneConPiano ? { piano: [{ obiettivo: 'Arrivare a 50 visite sul sito', misura: 'visite_sito', traguardo: 50 }, { obiettivo: 'Scrivere la pagina del mio primo prodotto', misura: 'altro', traguardo: 0 }] } : {}
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
      ...piano,
    },
  }
}
