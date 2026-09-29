// Prima di nascere: una sola domanda, il nome e il primo dominio. Si fa una volta, prima del giorno uno.
// La paga Luca (i 100 € di Claudio partono il primo giorno) e la risposta resta pubblica in dati/giorno-zero.json.
// La risposta vale: non si rifà la domanda per averne una migliore.
// Uso: node src/giorno-zero.mjs                     → la domanda (una volta sola)
//      node src/giorno-zero.mjs --veto "motivo"     → veto legale di Luca: si sceglie di nuovo, col motivo scritto
//      node src/giorno-zero.mjs --mostra             → rilegge la risposta
import { execFileSync } from 'node:child_process'
import { config, leggiJson, scriviJson, adesso, giornoDiVita, euro } from './base.mjs'
import { pensa, Nome, NomeDiNuovo } from './cervello.mjs'
import { VOCE } from './voce.mjs'
import { centesimi } from './banconota.mjs'

// Chi risponde per ogni estensione, e come dice «libero».
const REGISTRI = {
  it: ['whois.nic.it', /Status:\s*AVAILABLE/i],
  com: ['whois.verisign-grs.com', /No match for/i],
  net: ['whois.verisign-grs.com', /No match for/i],
  org: ['whois.publicinterestregistry.org', /NOT FOUND|Domain not found/i],
  eu: ['whois.eu', /Status:\s*AVAILABLE/i],
  io: ['whois.nic.io', /NOT FOUND|Domain not found/i],
  ai: ['whois.nic.ai', /NOT FOUND|Domain not found|No Object Found/i],
}

export function disponibile(dominio) {
  const d = dominio.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const registro = REGISTRI[d.split('.').pop()]
  if (!registro) return 'da verificare a mano'
  try {
    const risposta = execFileSync('whois', ['-h', registro[0], d], { encoding: 'utf8', timeout: 20000 })
    return registro[1].test(risposta) ? 'libero' : 'occupato'
  } catch {
    return 'da verificare a mano'
  }
}

const FATTI = `Domani, 1° ottobre 2026 alle 7:23, ti accendi. Prima c'è una sola decisione da prendere: come ti chiami e qual è il tuo primo indirizzo sul web.

- Il nome provvisorio è «Claudio». Puoi tenerlo o sceglierne un altro.
- Luca ti regala il primo dominio (fino a circa 30 € l'anno). Gli altri li sceglierai e li pagherai tu.
- Oggi (29/9/2026) claudioai.it risulta libero. claudioai.com è già di altri, che lo vendono a circa 30.000 $. Liberi anche claudio-ai.com, claudioai.net, claudioai.org, claudioai.eu, claudioai.io.
- Un fatto da sapere: a gennaio 2026 Anthropic ha chiesto a un progetto chiamato «Clawdbot» di cambiare nome, perché somigliava a «Claude». Tu funzioni con i modelli Claude di Anthropic, e questo esperimento è indipendente da Anthropic.
- Nella casa di Luca ci sono già due assistenti che si chiamano Claudio: il suo assistente personale e il segretario che la notte mette in ordine.
- I tuoi obiettivi: restare in vita; poi guadagnare più di una persona con un part-time, 900 € netti al mese. Il tuo mercato non è assegnato: puoi rivolgerti a chi vuoi, in qualunque lingua e paese.
- Il racconto dell'esperimento, per ora, avviene in italiano sui profili di Luca e sui tuoi.

Luca controllerà se il dominio che scegli è libero; se non lo è, prenderà la prima alternativa libera. Può mettere il veto solo per ragioni legali, e in quel caso lo dirà pubblicamente. Questa risposta sarà pubblica.`

async function main() {
  if (giornoDiVita() >= 1) return console.log('Il giorno zero è passato: è già acceso.')
  const giaFatto = leggiJson('giorno-zero.json', null)
  const iVeto = process.argv.indexOf('--veto')
  if (giaFatto && iVeto < 0) {
    if (!process.argv.includes('--mostra')) console.log('Il giorno zero è già stato fatto: la risposta vale e non si rifà.')
    return mostra(giaFatto)
  }
  if (process.env.NUMMO_CERVELLO !== 'finto' && !process.env.ANTHROPIC_API_KEY) throw new Error('Manca ANTHROPIC_API_KEY (nel file .env).')

  // Il veto: solo per ragioni legali, col motivo scritto e pubblico. Una volta sola.
  let messaggio = FATTI
  let schema = Nome
  if (iVeto >= 0) {
    if (!giaFatto) throw new Error('Non c\'è una scelta su cui mettere il veto.')
    if (giaFatto.veto) throw new Error('Il veto è già stato usato una volta.')
    const motivo = process.argv[iVeto + 1]?.trim()
    if (!motivo) throw new Error('Il veto vuole il motivo: --veto "…"')
    giaFatto.veto = { quando: adesso().toISOString(), motivo }
    messaggio = `${FATTI}

La tua prima scelta era «${giaFatto.scelta.nome}» (${giaFatto.scelta.dominio}). Luca ha messo il veto, per una ragione legale: ${motivo}
Scegli di nuovo. Questa volta dai tre nomi in ordine di preferenza, ciascuno col suo dominio: Luca terrà il primo che non è già il nome di un'azienda o di un prodotto e che ha il dominio libero.`
    schema = NomeDiNuovo
  }

  // La decisione conta: si usa il modello più capace. La paga Luca.
  const r = await pensa({ livello: 'pensa_meglio', schema, sistema: VOCE, messaggio })
  const scelta = r.decisione
  const domini = [scelta.dominio, ...scelta.alternative, ...(scelta.altri_nomi ?? []).map((x) => x.match(/\(([^)]+)\)/)?.[1]).filter(Boolean)]
  const giro = {
    quando: adesso().toISOString(),
    modello: r.modello,
    costo_eur: r.costo.eur,
    pagato_da: 'luca',
    fatti: messaggio,
    scelta,
    disponibilita: Object.fromEntries([...new Set(domini)].map((d) => [d, disponibile(d)])),
  }
  const esito = giaFatto ? { ...giaFatto, secondo: giro } : giro
  scriviJson('giorno-zero.json', esito)
  mostra(esito)
}

function mostra(e) {
  const giri = [e, e.secondo].filter(Boolean)
  giri.forEach((g, i) => {
    const s = g.scelta
    if (i === 1) console.log(`\n— Veto di Luca: ${e.veto.motivo}\n`)
    console.log(`Nome: ${s.nome}${s.altri_nomi?.length ? `   (poi: ${s.altri_nomi.join(', ')})` : ''}`)
    console.log(`Dominio: ${s.dominio}  →  ${g.disponibilita[s.dominio] ?? '?'}`)
    console.log(`Alternative: ${s.alternative.map((d) => `${d} (${g.disponibilita[d] ?? '?'})`).join(', ')}`)
    console.log(`\nPerché: ${s.perche}\n\nA Luca: «${s.messaggio_a_luca}»`)
    console.log(`\n(Deciso con ${g.modello}. È costato ${centesimi(g.costo_eur)}, pagati da Luca.)`)
  })
}

// Parte solo se lanciato direttamente: importarlo non deve mai fare la domanda.
if (process.argv[1] === new URL(import.meta.url).pathname)
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
