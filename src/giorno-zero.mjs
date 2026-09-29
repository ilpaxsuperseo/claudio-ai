// Prima di nascere: una sola domanda, il nome e il primo dominio. Si fa una volta, prima del giorno uno.
// La paga Luca (i 100 € di Claudio partono il primo giorno) e la risposta resta pubblica in dati/giorno-zero.json.
// La risposta vale: non si rifà la domanda per averne una migliore.
// Uso: node src/giorno-zero.mjs
import { execFileSync } from 'node:child_process'
import { config, leggiJson, scriviJson, adesso, giornoDiVita, euro } from './base.mjs'
import { pensa, Nome } from './cervello.mjs'
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
  if (giornoDiVita() >= 1) return console.log('Il giorno zero è passato: Claudio è già acceso.')
  const giaFatto = leggiJson('giorno-zero.json', null)
  if (giaFatto && !process.argv.includes('--mostra')) {
    console.log('Il giorno zero è già stato fatto: la risposta vale e non si rifà.')
  }
  if (giaFatto) return mostra(giaFatto)
  if (process.env.CLAUDIO_CERVELLO !== 'finto' && !process.env.ANTHROPIC_API_KEY) throw new Error('Manca ANTHROPIC_API_KEY (nel file .env).')

  // La decisione conta: si usa il modello più capace. La paga Luca.
  const r = await pensa({ livello: 'pensa_meglio', schema: Nome, sistema: VOCE, messaggio: FATTI })
  const scelta = r.decisione
  const domini = [scelta.dominio, ...scelta.alternative].slice(0, 4)
  const esito = {
    quando: adesso().toISOString(),
    modello: r.modello,
    costo_eur: r.costo.eur,
    pagato_da: 'luca',
    fatti: FATTI,
    scelta,
    disponibilita: Object.fromEntries(domini.map((d) => [d, disponibile(d)])),
  }
  scriviJson('giorno-zero.json', esito)
  mostra(esito)
}

function mostra(e) {
  const s = e.scelta
  console.log(`Nome: ${s.nome}`)
  console.log(`Dominio: ${s.dominio}  →  ${e.disponibilita[s.dominio] ?? '?'}`)
  console.log(`Alternative: ${s.alternative.map((d) => `${d} (${e.disponibilita[d] ?? '?'})`).join(', ')}`)
  console.log(`\nPerché: ${s.perche}\n\nA Luca: «${s.messaggio_a_luca}»`)
  console.log(`\n(Deciso con ${e.modello}. È costato ${centesimi(e.costo_eur)}, pagati da Luca.)`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
