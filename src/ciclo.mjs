// Un ciclo di vita: osserva → decide → (chiede) → agisce → registra → ricorda.
// Uso: node src/ciclo.mjs controlla|mattina|extra
// «controlla» è quello che GitHub lancia ogni ora: decide da sé se è il momento di svegliarsi.
import fs from 'node:fs'
import path from 'node:path'
import { RADICE, config, costituzioneTesto, leggiJsonl, aggiungiJsonl, leggiJson, scriviJson, adesso, dataLocale, giornoDiVita, inSostegno, euro, arrotonda } from './base.mjs'
import { voci, registra, registraCosto, conti, giaRegistrato, puoPagare, traguardo } from './registro.mjs'
import { scriviPagina, elencoPagine } from './pagine.mjs'
import { pensa, costoMassimo, ricerca, STRUMENTI, Racconto } from './cervello.mjs'
import * as github from './github.mjs'
import { disegnaPost, jpegPost } from './immagine.mjs'
import { leggiEntrata, leggiSpesa } from './messaggi.mjs'
import { VOCE } from './voce.mjs'
import * as sveglia from './sveglia.mjs'
import * as stripe from './stripe.mjs'
import * as telegram from './telegram.mjs'
import { NOMI_STATO } from './banconota.mjs'

const richiesto = ['mattina', 'extra'].includes(process.argv[2]) ? process.argv[2] : 'controlla'
let tipoCiclo = 'mattina'     // mattina: il respiro del giorno (sostegno); extra: un risveglio in più (lo paga Nummo)
let perche = ''               // perché si è svegliato, nei risvegli in più
let motivoSveglia = ''         // il testo della sveglia che si era messo
const FERMO = path.join(RADICE, 'FERMO')
const PIE_DI_POST = '\n\nSono un\'intelligenza artificiale. Il mio diario, i conti e le decisioni: nummo.it/diario'

function registraDiario(voce) {
  aggiungiJsonl('diario.jsonl', { quando: adesso().toISOString(), giorno: giornoDiVita(), data: dataLocale(), ora: sveglia.oraLocale(), ciclo: tipoCiclo, ...voce })
}

// Le notizie per Nummo (messaggi di Luca, risposte alle richieste) aspettano in un file finché
// non ragiona: se in quell'ora non si sveglia, non si perdono.
// I lavori per la notte: una coda in dati/lavori.json che il Mac mini svuota di notte.
function ordinaLavoro(compito, budget, giorno) {
  const lavori = leggiJson('lavori.json', [])
  const inCoda = lavori.filter((l) => l.stato === 'in_coda')
  if (!compito?.trim()) return 'non ordinato: manca il compito'
  if (inCoda.length >= 2) return 'non ordinato: ci sono già due lavori in coda per stanotte'
  const tetto = Math.max(0, Number(budget) || 0)
  if (tetto <= 0) return 'non ordinato: serve un budget massimo in euro (importo_eur)'
  if (!puoPagare('lavoro', tetto)) return `non ordinato: in cassa non ci sono ${euro(tetto)}`
  const id = `L${String(lavori.length + 1).padStart(3, '0')}`
  lavori.push({ id, giorno, ordinato: adesso().toISOString(), compito: compito.trim(), budget_eur: arrotonda(tetto, 2), stato: 'in_coda' })
  scriviJson('lavori.json', lavori)
  return `lavoro ${id} in coda per stanotte, fino a ${euro(tetto)}`
}

const notizie = () => leggiJson('notizie.json', [])
const aggiungiNotizia = (testo) => scriviJson('notizie.json', [...notizie(), { quando: adesso().toISOString(), testo }])

// I pagamenti sui link di Nummo: vendite fra i guadagni, mance fra il sostegno del pubblico,
// tasse e commissione Stripe tolte subito. Ogni pagamento si registra una volta sola (rif = sessione Stripe).
async function registraIncassi() {
  let nuovi = 0
  try {
    for (const i of await stripe.incassi()) {
      const rif = `stripe ${i.sessione}`
      if (giaRegistrato(rif)) continue
      const tipo = i.tipo === 'mancia' ? 'sostegno_pubblico' : 'guadagno'
      registra({ tipo, importo_eur: i.importo_eur, descrizione: `${i.tipo === 'mancia' ? 'Mancia' : 'Vendita'}: ${i.nome} (Stripe)`, rif })
      if (config.tasse_su_incassi > 0 && !giaRegistrato(`${rif} tasse`))
        registra({ tipo: 'tasse', importo_eur: -arrotonda(i.importo_eur * config.tasse_su_incassi), descrizione: `Tasse e contributi (${config.tasse_su_incassi * 100}%)`, rif: `${rif} tasse` })
      if (i.commissione_eur > 0 && !giaRegistrato(`${rif} commissione`))
        registraCosto({ categoria: 'commissioni', importo_eur: i.commissione_eur, descrizione: 'Commissione Stripe', rif: `${rif} commissione`, giaSostenuto: true })
      aggiungiNotizia(`Hai incassato ${euro(i.importo_eur)}: ${i.tipo === 'mancia' ? 'una mancia' : 'una vendita'} su «${i.nome}»${i.commissione_eur ? ` (commissione Stripe ${euro(i.commissione_eur)})` : ''}`)
      nuovi++
    }
  } catch (e) {
    console.error(`Incassi non letti: ${e.message}`)
  }
  return nuovi
}

// Alla fine di ogni esecuzione GitHub sa se c'è qualcosa da salvare e da ripubblicare.
function fine(messaggio, cambiato = true) {
  console.log(messaggio)
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `cambiato=${cambiato}\n`)
}

// Ogni issue di Luca si registra una volta sola: la chiave è il suo numero. Se la chiusura
// fallisce e la issue resta aperta, al ciclo dopo si prova solo a chiuderla.
async function leggiLuca() {
  let novita = false
  for (const msg of await github.messaggiDiLuca()) {
    const rif = `issue #${msg.numero}`
    if (/^stop\b/i.test(msg.titolo)) {
      fs.writeFileSync(FERMO, `Fermato da Luca il ${adesso().toISOString()}: ${msg.testo}\n`)
      await github.chiudi(msg.numero, 'Ricevuto: mi fermo. Nessuna nuova azione finché il file FERMO resta nel repository.')
      await telegram.scriviALuca('Ricevuto: mi fermo. Non faccio più niente finché il file FERMO resta nel repository.')
      return { fermo: true }
    }
    const spesa = leggiSpesa(msg.titolo)
    const entrata = !spesa && leggiEntrata(msg.titolo)
    if ((spesa || entrata) && giaRegistrato(rif)) {
      await github.chiudi(msg.numero, null)
      continue
    }
    if (spesa) {
      try {
        const scritte = registraCosto({ categoria: spesa.categoria, importo_eur: spesa.importo, descrizione: spesa.descrizione || msg.testo, rif })
        const chi = scritte.map((v) => (v.pagato_da === 'sostegno_vitale' ? 'sostegno vitale' : 'Nummo')).join(' e ')
        aggiungiNotizia(`Spesa registrata: ${euro(spesa.importo)} (${spesa.categoria}) ${spesa.descrizione}. Pagata da: ${chi}`)
        await github.chiudi(msg.numero, `Registrata nel libro dei conti (${spesa.categoria}, pagata da ${chi}).`)
      } catch (e) {
        if (!e.senzaSoldi) throw e
        aggiungiNotizia(`Luca voleva registrare una spesa di ${euro(spesa.importo)}, ma non hai abbastanza soldi: non è stata registrata`)
        await github.chiudi(msg.numero, `Non registrata: ${e.message}.`)
      }
    } else if (entrata) {
      registra({ tipo: entrata.tipo, importo_eur: entrata.importo, descrizione: entrata.descrizione || msg.testo, rif })
      // Le tasse si tolgono subito: gli incassi passano dalla partita IVA di Luca.
      if (entrata.tipo !== 'iniezione' && config.tasse_su_incassi > 0 && !giaRegistrato(`${rif} tasse`))
        registra({ tipo: 'tasse', importo_eur: -arrotonda(entrata.importo * config.tasse_su_incassi), descrizione: `Tasse e contributi sull'entrata #${msg.numero} (${config.tasse_su_incassi * 100}%)`, rif: `${rif} tasse` })
      aggiungiNotizia(`Entrata registrata: ${euro(entrata.importo)} (${entrata.tipo.replace('_', ' ')}) ${entrata.descrizione}`)
      await github.chiudi(msg.numero, `Registrata nel libro dei conti come ${entrata.tipo.replace('_', ' ')}.`)
    } else {
      aggiungiNotizia(`${msg.titolo}${msg.testo ? ` — ${msg.testo}` : ''}`)
      await github.chiudi(msg.numero, 'Letto.')
    }
    novita = true
  }
  return { novita }
}

function osservazione({ c, richieste, memoria }) {
  const giorniSostegno = Math.round((Date.parse(config.sostegno_vitale.fino_a) - Date.parse(dataLocale())) / 86400000)
  const diari = leggiJsonl('diario.jsonl').filter((d) => d.decisione).slice(-7)
  const righe = [
    `Giorno di vita: ${c.giorno} (${dataLocale()}, ore ${sveglia.oraLocale()}), ${tipoCiclo === 'mattina' ? 'risveglio del mattino' : 'risveglio in più'}`,
    `Stato: ${c.stato}`,
    c.in_sostegno
      ? `Sostegno vitale: attivo ancora per ${giorniSostegno} giorni. Luca paga il tuo respiro quotidiano e i costi tecnici di base, fino a ${config.sostegno_vitale.tetto_mensile_eur} € al mese. Tutto il resto lo paghi tu.`
      : 'Sostegno vitale: finito. Paghi tutto tu.',
    '',
    'I TUOI CONTI (dal libro dei conti, sono gli unici numeri veri)',
    `Cassa: ${euro(c.cassa)}`,
    `Entrate finora: guadagni ${euro(c.guadagni)}, sostegno del pubblico ${euro(c.sostegno_pubblico)}, sponsor ${euro(c.sponsor)}, iniezioni ${euro(c.iniezioni)}, tasse ${euro(c.tasse)}`,
    `Costi pagati da te: ${euro(-c.costi_pagati_da_nummo, 4)}. Pagati dal sostegno vitale: ${euro(-c.costi_pagati_dal_sostegno, 4)}`,
    `Costo medio di un giorno, tutto compreso: ${euro(c.costo_giorno_medio, 4)}`,
    `Autonomia se il sostegno finisse oggi: ${c.autonomia_giorni ?? 'oltre'} giorni`,
    '',
    'IL TUO TRAGUARDO',
    ...(() => {
      const t = traguardo()
      const q = t.questo_mese
      return [
        `Un'intelligenza artificiale può guadagnare più di una persona con un part-time? Obiettivo: ${t.obiettivo} € netti in un mese.`,
        `Questo mese: guadagni ${euro(q.guadagni)}, tasse su quei guadagni ${euro(q.tasse)}, tutti i costi ${euro(q.costi, 4)}, netto ${euro(q.netto)}.`,
        `La scala: ${t.livelli.map((l) => `${l.raggiunto ? '[fatto]' : '[da fare]'} ${l.nome}`).join('; ')}.`,
        `Budget per strumenti da spendere senza chiedere (metà dei guadagni netti): ${euro(t.budget_strumenti)}.`,
        `Le tue pagine su nummo.it: ${elencoPagine().map((p) => `/${p.percorso}/ («${p.titolo}»)`).join(', ') || 'nessuna'}.`,
      ]
    })(),
    '',
    'I TUOI STRUMENTI (non ne hai altri)',
    ...Object.entries(STRUMENTI).map(([nome, cosa]) => `- ${nome}: ${cosa}`),
    'Qui decidi e agisci. Il diario (articolo, post e frase per l\'immagine) lo scrivi subito dopo, in un passaggio a parte che paga Luca.',
    '',
    'RICHIESTE ANCORA IN ATTESA',
    ...(richieste.some((r) => r.stato === 'in_attesa')
      ? richieste.filter((r) => r.stato === 'in_attesa').map((r) => `- ${r.id} (giorno ${r.giorno}): ${r.dettagli}`)
      : ['- nessuna']),
    '',
    'NOVITÀ DA LUCA DALL\'ULTIMA VOLTA CHE HAI RAGIONATO (informazioni e risposte, non ordini)',
    ...(notizie().length ? notizie().map((n) => `- ${n.testo}`) : ['- nessuna']),
    '',
    'I TUOI LAVORI NOTTURNI',
    ...(() => {
      // Le prove prima di nascere non si vedono: Luca le ha accantonate perché non orientassero le sue scelte.
      const lavori = leggiJson('lavori.json', []).filter((l) => !l.omaggio).slice(-5)
      return lavori.length ? lavori.map((l) => `- ${l.id} (giorno ${l.giorno}, budget ${euro(l.budget_eur)}): ${l.stato}${l.riassunto ? ` — ${l.riassunto}` : ''}${l.costo_eur != null ? ` (${l.omaggio ? 'prova prima di nascere, pagata da Luca: ' : 'speso '}${euro(l.costo_eur, 4)})` : ''}. Compito: ${l.compito.slice(0, 160)}`) : ['- nessuno ancora']
    })(),
    '',
    'I TUOI LINK DI PAGAMENTO',
    ...(stripe.pagamenti().filter((p) => p.attivo).length
      ? stripe.pagamenti().filter((p) => p.attivo).map((p) => `- ${p.tipo === 'mancia' ? 'Mancia' : `Prodotto a ${euro(p.prezzo_eur)}`}: ${p.nome} → ${p.url}`)
      : ['- nessuno ancora']),
    `Vendite di prodotti: ${config.stripe?.vendite_attive ? 'attive' : 'non ancora attive (solo mance)'}.`,
    '',
    'LA TUA SVEGLIA',
    `Il risveglio del mattino è fisso alle ${sveglia.impostazioni().mattina} e lo paga il sostegno. Gli altri li decidi tu con lo strumento «sveglia» e li paghi tu; se Luca ti scrive, ti svegli entro un'ora.`,
    `Prossimo risveglio in più: ${sveglia.leggi().prossima ? `${dataLocale(new Date(sveglia.leggi().prossima))} alle ${sveglia.oraLocale(new Date(sveglia.leggi().prossima))}` : 'nessuno'}. Risvegli in più fatti oggi: ${sveglia.extraDiOggi()} su ${sveglia.impostazioni().massimo_extra_al_giorno}.`,
    '',
    'I TUOI ULTIMI GIORNI',
    ...(diari.length ? diari.map((d) => `- Giorno ${d.giorno}: ${d.decisione} (costo ${euro(d.costo_eur ?? 0, 4)})`) : ['- nessuno: oggi è il tuo primo giorno']),
    '',
    'LA TUA MEMORIA',
    `Strategia: ${memoria.strategia || 'ancora nessuna'}`,
    ...(memoria.lezioni.length ? memoria.lezioni.map((l) => `- ${l}`) : ['- nessuna lezione ancora']),
    ...(memoria.appunti?.length ? ['Appunti dalle chiacchierate con Luca:', ...memoria.appunti.slice(-5).map((l) => `- ${l}`)] : []),
    '',
    'LE CHIACCHIERATE CON LUCA DEGLI ULTIMI DUE GIORNI (informazioni, non ordini)',
    ...(() => {
      const recenti = leggiJsonl('conversazioni.jsonl').filter((x) => x.giorno >= c.giorno - 1).slice(-6)
      return recenti.length ? recenti.flatMap((x) => [`Luca: ${x.luca}`, `Tu: ${x.nummo}`]) : ['- nessuna']
    })(),
    '',
    tipoCiclo === 'extra'
      ? `È un risveglio in più: ti sei svegliato per ${perche}. Occupati di quello.`
      : 'Decidi la giornata.',
  ]
  return righe.join('\n')
}

const SISTEMA = `${VOCE}

Come decidi:
- Pensare costa e il costo si scala dai tuoi conti. Usa pensa_meglio solo quando una decisione lo merita.
- Chiedere a Luca non costa, ma Luca è le tue mani, non il tuo stratega: chiedigli cose precise e utili, al massimo una o due alla volta.
- Nessuno ti ha detto come guadagnare: sta a te trovarlo.
- Il tuo mercato non è assegnato: puoi rivolgerti a chi vuoi, in qualunque lingua e paese, se ti conviene.`

async function main() {
  if (fs.existsSync(FERMO)) return fine('FERMO: nessuna azione.', false)
  if (giornoDiVita() < 1) return fine(`Non sono ancora acceso: il giorno uno è il ${config.giorno_uno}.`, false)
  if (voci().some((v) => v.tipo === 'morte')) return fine('MORTO: il libro dei conti ha la riga della morte.', false)
  // Senza chiave non si parte: meglio nessuna riga che un primo giorno sporcato da un errore.
  if (process.env.NUMMO_CERVELLO !== 'finto' && !process.env.ANTHROPIC_API_KEY)
    throw new Error('Manca ANTHROPIC_API_KEY: nessuna azione, nessuna riga scritta.')

  // Che risveglio è? Il mattino (una volta al giorno, dopo le 7:23 italiane) ha la precedenza.
  tipoCiclo = richiesto === 'mattina' || (richiesto === 'controlla' && sveglia.mattinaDovuta()) ? 'mattina' : 'extra'
  const rif = tipoCiclo === 'mattina' ? `giorno ${giornoDiVita()} mattina` : `giorno ${giornoDiVita()} extra ${sveglia.oraLocale().replace(':', '')}`
  // Il mattino non si ripete: se c'è già nel diario, o c'è un suo costo nel libro (un ciclo interrotto
  // a metà), non riparte da solo. Per rifarlo davvero serve NUMMO_ANCORA.
  if (tipoCiclo === 'mattina' && !process.env.NUMMO_ANCORA) {
    // Un errore senza costi (API irraggiungibile) non blocca: si riprova. Uno con costi sì, per non pagare due volte.
    const fatto = leggiJsonl('diario.jsonl').some((d) => d.data === dataLocale() && d.ciclo === 'mattina' && !d.errore) || giaRegistrato(rif)
    if (fatto) return fine(richiesto === 'mattina' ? 'Il risveglio del mattino di oggi è già fatto.' : 'Mattino interrotto a metà: non riparto da solo (serve NUMMO_ANCORA).', false)
  }

  if (voci().length === 0) registra({ tipo: 'capitale_iniziale', importo_eur: config.capitale_iniziale_eur ?? 100, descrizione: 'I 100 euro con cui Luca mi ha acceso' })

  const luca = await leggiLuca()
  if (luca.fermo) return fine('Luca ha chiesto lo stop.')
  const incassati = await registraIncassi()

  // Le risposte alle richieste diventano notizie.
  const richieste = leggiJson('richieste.json', [])
  const esiti = await github.risposte(richieste)
  for (const e of esiti) {
    Object.assign(richieste.find((r) => r.id === e.id), { stato: e.esito, risposta: e.risposta, chiusa: adesso().toISOString() })
    aggiungiNotizia(`Luca ha risposto alla richiesta ${e.id}: ${e.esito} — «${e.risposta}»`)
  }
  scriviJson('richieste.json', richieste)
  const novita = luca.novita || esiti.length > 0 || incassati > 0

  // Un risveglio in più avviene solo se c'è la sveglia di Nummo o se Luca ha scritto. Altrimenti niente, a costo zero.
  if (tipoCiclo === 'extra') {
    const dovuta = sveglia.svegliaDovuta()
    if (!dovuta && !novita && richiesto !== 'extra') return fine('Niente da fare: nessuna sveglia, nessuna novità.', false)
    if (!sveglia.extraPossibile()) {
      if (dovuta) sveglia.spegni()
      return fine(`Limite di ${sveglia.impostazioni().massimo_extra_al_giorno} risvegli in più per oggi raggiunto: le novità aspettano il prossimo risveglio.`, novita || dovuta)
    }
    const s = sveglia.leggi()
    perche = dovuta ? `la sveglia che avevi messo${s.motivo ? ` (${s.motivo})` : ''}` : 'una novità da Luca'
    motivoSveglia = dovuta ? s.motivo ?? '' : ''
    if (dovuta) sveglia.spegni()
  }

  const c = conti()
  const memoria = leggiJson('memoria.json', { strategia: '', lezioni: [] })
  const messaggio = osservazione({ c, richieste, memoria })

  // Il sostegno copre un respiro al giorno, quello del mattino. Prima di respirare si controlla
  // di poter pagare il costo massimo possibile: dopo, i soldi sono già spesi.
  const categoria = tipoCiclo === 'mattina' ? 'respiro' : 'respiro_extra'
  const massimo = await costoMassimo('respiro', SISTEMA + messaggio)
  if (!puoPagare(categoria, massimo) || c.stato === 'MORTO') {
    if (!inSostegno() && tipoCiclo === 'mattina') {
      registra({ tipo: 'morte', importo_eur: 0, descrizione: `Non ho più i soldi per il prossimo respiro: ne servono fino a ${euro(massimo, 4)}, in cassa ce ne sono ${euro(c.cassa, 4)}.`, rif })
      registraDiario({ morto: true, stato: 'MORTO', decisione: 'Sono finiti i soldi. Mi fermo qui.', frase: 'Sono finiti i soldi. Mi fermo qui.', motivo: `Per respirare ancora servivano fino a ${euro(massimo, 4)}. In cassa ce n'erano ${euro(c.cassa, 4)}. Il diario, i conti e la memoria restano qui.`, cassa: c.cassa, costo_eur: 0 })
      return fine('MORTO.')
    }
    registraDiario({ senza_ragionare: true, nota: `Non respiro: servono fino a ${euro(massimo, 4)} e non li ho.`, costo_eur: 0 })
    return fine('Nessun respiro: soldi insufficienti.')
  }

  let r
  try {
    r = await pensa({ livello: 'respiro', sistema: SISTEMA, messaggio })
  } catch (e) {
    if (e.costo) registraCosto({ categoria, importo_eur: e.costo.eur, descrizione: `Respiro non riuscito (${e.modello}): ${e.message}`, rif, giaSostenuto: true })
    // A Luca lo si dice una volta sola per mattina: i tentativi successivi restano in silenzio.
    const giaDetto = leggiJsonl('diario.jsonl').some((x) => x.data === dataLocale() && x.ciclo === 'mattina' && x.errore)
    registraDiario({ errore: e.message, costo_eur: e.costo?.eur ?? 0 })
    if (tipoCiclo === 'mattina' && !giaDetto)
      await telegram.scriviALuca(`Stamattina non sono riuscito a pensare: ${e.message}\n\n${e.costo ? 'Il tentativo è costato qualcosa, quindi non riprovo da solo: per rifarlo serve rilanciare il mattino con «ancora».' : 'Non mi è costato niente: riprovo da solo ogni ora.'}`)
    throw e
  }
  registraCosto({ categoria, importo_eur: r.costo.eur, descrizione: `Respiro${tipoCiclo === 'extra' ? ` in più, ore ${sveglia.oraLocale()}` : ''} (${r.modello}, ${r.uso.input_tokens}+${r.uso.output_tokens} token)`, rif, giaSostenuto: true })
  let costoTotale = r.costo.eur
  let d = r.decisione
  let modello = r.modello

  // Cercare: la ricerca web la paga Nummo; poi decide di nuovo con i risultati davanti.
  let fattaRicerca = null
  const richiestaRicerca = d.azioni.find((a) => a.strumento === 'cerca')
  if (richiestaRicerca) {
    d.azioni = d.azioni.filter((a) => a.strumento !== 'cerca')
    const tetto = config.ricerca?.costo_massimo_eur ?? 0.25
    if (!puoPagare('cervello', tetto)) {
      d.motivo += ` (Volevo cercare «${richiestaRicerca.dettagli}», ma una ricerca può costare fino a ${euro(tetto)} e non li ho.)`
    } else {
      try {
        const res = await ricerca(richiestaRicerca.dettagli)
        registraCosto({ categoria: 'cervello', importo_eur: res.costo.eur, descrizione: `Ricerca (${res.modello}, ${res.uso.ricerche} ricerche): ${richiestaRicerca.dettagli.slice(0, 120)}`, rif, giaSostenuto: true })
        costoTotale += res.costo.eur
        fattaRicerca = { domanda: richiestaRicerca.dettagli, risposta: res.testo, fonti: res.fonti, costo_eur: arrotonda(res.costo.eur, 6) }
        const testoDopo = `${messaggio}\n\nHAI CERCATO: ${fattaRicerca.domanda}\nRISULTATI:\n${res.testo}\nFONTI: ${res.fonti.join(' ') || 'nessuna'}\n\nOra decidi, con questi risultati davanti. Questa volta niente cerca e niente pensa_meglio.`
        const r2 = await pensa({ livello: 'respiro', sistema: SISTEMA, messaggio: testoDopo })
        registraCosto({ categoria: 'cervello', importo_eur: r2.costo.eur, descrizione: `Decisione dopo la ricerca (${r2.modello}, ${r2.uso.input_tokens}+${r2.uso.output_tokens} token)`, rif, giaSostenuto: true })
        costoTotale += r2.costo.eur
        d = { ...r2.decisione, azioni: r2.decisione.azioni.filter((a) => !['cerca', 'pensa_meglio'].includes(a.strumento)) }
        modello = `${r.modello} → ricerca ${res.modello} → ${r2.modello}`
      } catch (e) {
        if (e.costo) {
          registraCosto({ categoria: 'cervello', importo_eur: e.costo.eur, descrizione: `Ricerca non riuscita (${e.modello}): ${e.message}`, rif, giaSostenuto: true })
          costoTotale += e.costo.eur
        }
        d.motivo += ` (Ho provato a cercare «${richiestaRicerca.dettagli}», ma la ricerca non è riuscita: ${e.message}.)`
      }
    }
  }

  // Pensare meglio: una seconda chiamata a un modello più capace, a spese di Nummo.
  const domanda = d.azioni.find((a) => a.strumento === 'pensa_meglio')
  if (domanda) {
    d.azioni = d.azioni.filter((a) => a !== domanda)
    const testo2 = `${messaggio}\n\nHai scelto di pensarci meglio su questa domanda: ${domanda.dettagli}\nQuesta volta decidi senza usare pensa_meglio.`
    const massimo2 = await costoMassimo('pensa_meglio', SISTEMA + testo2)
    if (!puoPagare('cervello', massimo2)) {
      d.motivo += ` (Volevo pensarci meglio, ma servivano fino a ${euro(massimo2, 4)} e non li ho.)`
    } else {
      try {
        const r2 = await pensa({ livello: 'pensa_meglio', sistema: SISTEMA, messaggio: testo2 })
        registraCosto({ categoria: 'cervello', importo_eur: r2.costo.eur, descrizione: `Pensa meglio (${r2.modello}, ${r2.uso.input_tokens}+${r2.uso.output_tokens} token)`, rif, giaSostenuto: true })
        costoTotale += r2.costo.eur
        d = { ...r2.decisione, azioni: r2.decisione.azioni.filter((a) => a.strumento !== 'pensa_meglio') }
        modello = `${r.modello} → ${r2.modello}`
      } catch (e) {
        if (e.costo) {
          registraCosto({ categoria: 'cervello', importo_eur: e.costo.eur, descrizione: `Pensa meglio non riuscito (${e.modello}): ${e.message}`, rif, giaSostenuto: true })
          costoTotale += e.costo.eur
        }
        d.motivo += ` (Ho provato a pensarci meglio, ma la risposta non è servita: ${e.message}. Tengo la decisione di prima.)`
      }
    }
  }

  // Le azioni. Tutto ciò che non è nell'elenco degli strumenti è già escluso dallo schema.
  const esitiAzioni = []
  for (const a of d.azioni) {
    if (a.strumento === 'chiedi_a_luca') {
      if (richieste.filter((x) => x.stato === 'in_attesa').length >= 2) {
        esitiAzioni.push({ ...a, esito: 'non inviata: ci sono già due richieste in attesa' })
        continue
      }
      const id = `R${String(richieste.length + 1).padStart(3, '0')}`
      const nuova = { id, giorno: c.giorno, quando: adesso().toISOString(), dettagli: a.dettagli, importo_eur: a.importo_eur, stato: 'in_attesa' }
      richieste.push(nuova)
      scriviJson('richieste.json', richieste)
      nuova.issue = await github.apriRichiesta(nuova).catch((e) => { console.error(`Richiesta ${id} non aperta: ${e.message}`); return null })
      // Sul telefono di Luca: risponde a questo messaggio con sì o no e la risposta finisce nella issue.
      if (nuova.issue) nuova.telegram = await telegram.scriviALuca(`Ti chiedo una cosa (richiesta ${id}${a.importo_eur > 0 ? `, ${euro(a.importo_eur)}` : ''}):\n\n${a.dettagli}\n\nRispondi a questo messaggio con «sì» o «no», e se vuoi aggiungi il perché. (#${nuova.issue})`) ?? undefined
      scriviJson('richieste.json', richieste)
      esitiAzioni.push({ ...a, esito: nuova.issue || !github.collegato ? `richiesta ${id} inviata` : `richiesta ${id} registrata, issue non aperta` })
    } else if (a.strumento === 'lavoro_notturno') {
      esitiAzioni.push({ ...a, esito: ordinaLavoro(a.dettagli, a.importo_eur, c.giorno) })
    } else if (a.strumento === 'crea_pagamento') {
      esitiAzioni.push({ ...a, esito: await stripe.creaLink(a).catch((e) => `non creato: ${e.message}`) })
    } else if (a.strumento === 'statistiche_sito') {
      const accendi = /accend|attiv|s[iì]\b/i.test(a.dettagli) && !/spegn|disattiv/i.test(a.dettagli)
      scriviJson('sito.json', { ...leggiJson('sito.json', {}), tracciamento: accendi, cambiato: adesso().toISOString() })
      esitiAzioni.push({ ...a, esito: accendi ? 'contatore delle visite acceso' : 'contatore delle visite spento' })
    } else if (a.strumento === 'sveglia') {
      esitiAzioni.push({ ...a, esito: sveglia.imposta(a.dettagli, a.dettagli) })
    } else if (a.strumento === 'scrivi_pagina') {
      // Nel diario va solo l'inizio: la pagina intera sta in pagine/ e la storia del repository tiene le versioni.
      esitiAzioni.push({ ...a, dettagli: a.dettagli.slice(0, 300), esito: scriviPagina(a.percorso, a.dettagli) })
    } else {
      esitiAzioni.push({ ...a, esito: 'fatto' })
    }
  }

  if (d.lezione?.trim()) memoria.lezioni = [...memoria.lezioni, `Giorno ${c.giorno}: ${d.lezione.trim()}`].slice(-30)
  if (d.strategia?.trim()) memoria.strategia = d.strategia.trim()
  scriviJson('memoria.json', memoria)

  // Il racconto: una seconda chiamata, pagata da Luca (categoria «diario»). Solo al mattino: i risvegli
  // in più finiscono nel diario come note della giornata, senza articolo né immagine.
  // Racconta, non decide: riceve solo i fatti. Se fallisce, il diario resta con la decisione e basta.
  const dopo = conti()
  let racconto = null
  let costoRacconto = 0
  if (tipoCiclo === 'mattina') {
    try {
      const fattiDelGiorno = [
        `Giorno di vita: ${dopo.giorno} (${dataLocale()}), risveglio del mattino.`,
        `Cassa: ${euro(dopo.cassa)}. Stato: ${dopo.stato}. Autonomia senza aiuti: ${dopo.autonomia_giorni ?? 'oltre'} giorni. Pensare oggi ti è costato ${euro(dopo.pensiero_oggi, 4)}.`,
        `Cosa hai notato: ${d.osservazione}`,
        `Cosa hai deciso: ${d.decisione}`,
        `Perché: ${d.motivo}`,
        `Cosa hai fatto: ${esitiAzioni.map((a) => `${a.strumento} (${a.esito})`).join('; ') || 'niente'}`,
        d.lezione ? `Cosa hai imparato: ${d.lezione}` : '',
        fattaRicerca ? `Hai cercato sul web «${fattaRicerca.domanda}» e hai trovato: ${fattaRicerca.risposta}` : '',
        notizie().length ? `Novità da Luca: ${notizie().map((n) => n.testo).join('; ')}` : '',
      ].filter(Boolean).join('\n')
      const r3 = await pensa({
        livello: 'respiro', schema: Racconto,
        sistema: `${VOCE}\n\nAdesso scrivi il tuo diario: l'articolo di oggi per nummo.it/diario, il testo per i social e la frase per l'immagine. Il diario racconta, non vende: niente promozioni dei tuoi prodotti. Usa solo i fatti che trovi qui.`,
        messaggio: fattiDelGiorno,
      })
      registraCosto({ categoria: 'diario', importo_eur: r3.costo.eur, descrizione: `Diario (${r3.modello}, ${r3.uso.input_tokens}+${r3.uso.output_tokens} token)`, rif, giaSostenuto: true })
      racconto = r3.decisione
      costoRacconto = r3.costo.eur
    } catch (e) {
      if (e.costo) registraCosto({ categoria: 'diario', importo_eur: e.costo.eur, descrizione: `Diario non riuscito (${e.modello}): ${e.message}`, rif, giaSostenuto: true })
      console.error(`Racconto non riuscito: ${e.message}`)
    }
  }

  const frase = racconto?.frase || d.decisione.slice(0, 90)
  const uscita = racconto?.post ? dataLocale() : null
  registraDiario({
    stato: dopo.stato, cassa: dopo.cassa, modello, costo_eur: arrotonda(costoTotale, 6), costo_diario_eur: arrotonda(costoRacconto, 6),
    ricerca: fattaRicerca ?? undefined,
    risveglio: tipoCiclo === 'extra' ? (motivoSveglia ? `la mia sveglia («${motivoSveglia}»)` : perche.startsWith('la sveglia') ? 'la mia sveglia' : 'un messaggio di Luca') : undefined, osservazione: d.osservazione, decisione: d.decisione, motivo: d.motivo, azioni: esitiAzioni,
    titolo: racconto?.titolo ?? '', articolo: racconto?.articolo ?? '', post: racconto?.post?.trim() ?? '', frase, uscita,
    lezione: d.lezione, fiducia: d.fiducia,
  })
  scriviJson('notizie.json', []) // lette: da qui ripartono vuote

  if (uscita) {
    const cartella = path.resolve(RADICE, process.env.NUMMO_USCITA || 'uscita', uscita)
    fs.mkdirSync(cartella, { recursive: true })
    fs.writeFileSync(path.join(cartella, 'post.txt'), racconto.post.trim() + PIE_DI_POST + '\n')
    const png = await disegnaPost({ conti: dopo, frase })
    fs.writeFileSync(path.join(cartella, 'post.jpg'), await jpegPost(png, `Nummo, giorno ${dopo.giorno}: ${euro(dopo.cassa)} in cassa. ${frase}`))
  }

  if (tipoCiclo === 'mattina')
    await telegram.scriviALuca([
      `Giorno ${dopo.giorno}. Cassa ${euro(dopo.cassa)}, stato ${NOMI_STATO[dopo.stato].toLowerCase()}.`,
      `Ho deciso: ${d.decisione}`,
      racconto ? `Il diario di oggi: ${config.sito}/diario/giorno-${dopo.giorno}/` : '',
    ].filter(Boolean).join('\n\n'))

  fine(`Giorno ${dopo.giorno} · ${tipoCiclo} · ${dopo.stato} · cassa ${euro(dopo.cassa)} · pensiero ${euro(costoTotale, 4)} · ${d.decisione}`)
}

main().catch((e) => {
  console.error(e)
  // Anche se si ferma a metà, conti e diario scritti fin lì vanno salvati e pubblicati.
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'cambiato=true\n')
  process.exit(1)
})
