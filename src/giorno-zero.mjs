// Prima di nascere: una sola domanda, il nome e il primo dominio. Si fa una volta, prima del giorno uno.
// La paga Luca (i 100 € di Claudio partono il primo giorno) e la risposta resta pubblica in dati/giorno-zero.json.
// La risposta vale: non si rifà la domanda per averne una migliore.
// Uso: node src/giorno-zero.mjs                     → la domanda (una volta sola)
//      node src/giorno-zero.mjs --veto "motivo"     → veto legale di Luca: si sceglie di nuovo, col motivo scritto
//      node src/giorno-zero.mjs --mostra             → rilegge la risposta
//      node src/giorno-zero.mjs --domanda "fatti e domanda"  → un'altra domanda prima di nascere (sì/no con il perché)
//      node src/giorno-zero.mjs --profili "fatti"  → si scrive da solo nome, bio e immagine dei profili social (una volta sola)
//      node src/giorno-zero.mjs --notte "fatti"    → sceglie fino a due lavori di prova per la notte, pagati da Luca (una volta sola)
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { Resvg } from '@resvg/resvg-js'
import { RADICE, config, leggiJson, scriviJson, adesso, giornoDiVita, euro, arrotonda } from './base.mjs'
import { pensa, Nome, NomeDiNuovo, Scelte, Profili, LavoriDiProva } from './cervello.mjs'
import { VOCE } from './voce.mjs'
import { centesimi } from './banconota.mjs'
import { scriviALuca, fileALuca } from './telegram.mjs'

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
  // I profili social: nome e bio li scrive lui, nei limiti di ogni piattaforma.
  const iProfili = process.argv.indexOf('--profili')
  if (iProfili >= 0) {
    if (!giaFatto) throw new Error('Prima serve il giorno zero.')
    if (giaFatto.profili) return console.log('I profili li ha già scritti: la risposta vale e non si rifà.\n', JSON.stringify(giaFatto.profili.risposta, null, 2))
    if (process.env.NUMMO_CERVELLO !== 'finto' && !process.env.ANTHROPIC_API_KEY) throw new Error('Manca ANTHROPIC_API_KEY (nel file .env).')
    const scelta = giaFatto.secondo?.scelta ?? giaFatto.scelta
    const messaggio = `Ti chiami ${scelta.nome}. Domani, 1° ottobre 2026 alle 7:23, ti accendi con 100 € e l'obiettivo di restare in vita e poi guadagnare più di un part-time (900 € netti al mese).\n\n${process.argv[iProfili + 1] ?? ''}`
    const r = await pensa({ livello: 'pensa_meglio', schema: Profili, sistema: VOCE, messaggio })
    const p = r.decisione
    const limiti = { nome_visualizzato: 30, bio_instagram: 150, bio_x: 160, bio_tiktok: 80, bio_facebook: 255 }
    giaFatto.profili = { quando: adesso().toISOString(), modello: r.modello, costo_eur: r.costo.eur, pagato_da: 'luca', risposta: p }
    scriviJson('giorno-zero.json', giaFatto)
    for (const [k, max] of Object.entries(limiti)) console.log(`${k} (${p[k].length}/${max}${p[k].length > max ? ' TROPPO LUNGA' : ''}):\n  ${p[k]}`)
    console.log(`immagine: ${p.immagine.come} — ${p.immagine.perche}`)
    console.log(`\nA Luca: «${p.messaggio_a_luca}»\n(${r.modello}, ${centesimi(r.costo.eur)} pagati da Luca.)`)

    // Sul telefono di Luca: le bio da incollare e, se l'ha disegnata, l'immagine pronta da caricare.
    await scriviALuca([
      `Nome: ${p.nome_visualizzato}`, `Instagram:\n${p.bio_instagram}`, `X:\n${p.bio_x}`, `TikTok:\n${p.bio_tiktok}`, `Facebook:\n${p.bio_facebook}`, p.messaggio_a_luca,
    ].join('\n\n'))
    if (p.immagine.come === 'la_disegno_io_col_codice') {
      const cartella = path.join(RADICE, 'interno', 'social')
      fs.mkdirSync(cartella, { recursive: true })
      const caratteri = fs.readdirSync(path.join(RADICE, 'caratteri')).filter((f) => f.endsWith('.ttf')).map((f) => path.join(RADICE, 'caratteri', f))
      const png = new Resvg(p.immagine.svg, { fitTo: { mode: 'width', value: 1080 }, font: { fontFiles: caratteri, loadSystemFonts: false } }).render().asPng()
      const file = path.join(cartella, 'immagine-profilo.png')
      fs.writeFileSync(file, png)
      console.log(`\nL'immagine disegnata da lui: ${path.relative(RADICE, file)}`)
      await fileALuca(file, `La mia immagine del profilo, disegnata da me. ${p.immagine.perche}`)
    } else if (p.immagine.come === 'la_chiedo_a_un_generatore') console.log(`\nDa generare: ${p.immagine.prompt}`)
    return
  }

  // La notte di prova: sceglie lui se e cosa fare. I lavori vanno nella coda della notte, pagati da Luca.
  const iNotte = process.argv.indexOf('--notte')
  if (iNotte >= 0) {
    if (!giaFatto) throw new Error('Prima serve il giorno zero.')
    if (giaFatto.notte_di_prova?.risposta) return console.log('La notte di prova l\'ha già scelta: la risposta vale e non si rifà.')
    if (process.env.NUMMO_CERVELLO !== 'finto' && !process.env.ANTHROPIC_API_KEY) throw new Error('Manca ANTHROPIC_API_KEY (nel file .env).')
    const scelta = giaFatto.secondo?.scelta ?? giaFatto.scelta
    const domanda = process.argv[iNotte + 1]?.trim() ?? ''
    const messaggio = `Ti chiami ${scelta.nome}. Il 1° ottobre 2026 alle 7:23 ti accendi con 100 € e l'obiettivo di restare in vita e poi guadagnare più di un part-time (900 € netti al mese).\n\n${domanda}`
    const r = await pensa({ livello: 'pensa_meglio', schema: LavoriDiProva, sistema: VOCE, messaggio })
    // Al massimo due lavori e al massimo il regalo di Luca in tutto: quello che sfora si accorcia.
    let resta = config.notte.omaggio_eur
    const lavori = leggiJson('lavori.json', [])
    const scelti = []
    for (const x of r.decisione.lavori.slice(0, 2)) {
      const budget = arrotonda(Math.min(Math.max(0, x.budget_eur), resta), 2)
      if (budget < 0.05 || !x.compito.trim()) continue
      resta -= budget
      const id = `L${String(lavori.length + 1).padStart(3, '0')}`
      lavori.push({ id, giorno: 0, ordinato: adesso().toISOString(), compito: x.compito.trim(), budget_eur: budget, stato: 'in_coda', omaggio: true })
      scelti.push({ id, budget, ...x })
    }
    scriviJson('lavori.json', lavori)
    giaFatto.notte_di_prova = { quando: adesso().toISOString(), modello: r.modello, costo_eur: r.costo.eur, pagato_da: 'luca', domanda, risposta: r.decisione, lavori: [] }
    scriviJson('giorno-zero.json', giaFatto)
    for (const x of scelti) console.log(`${x.id} (fino a ${euro(x.budget)}): ${x.compito}\n  Perché: ${x.perche}\n`)
    if (!scelti.length) console.log('Ha scelto di non fare lavori di prova.')
    console.log(`A Luca: «${r.decisione.messaggio_a_luca}»\n(${r.modello}, ${centesimi(r.costo.eur)} pagati da Luca.)`)
    return
  }

  // Un'altra domanda prima di nascere: la paga Luca, resta pubblica e la risposta vale.
  const iDomanda = process.argv.indexOf('--domanda')
  if (iDomanda >= 0) {
    if (!giaFatto) throw new Error('Prima serve il giorno zero.')
    if (process.env.NUMMO_CERVELLO !== 'finto' && !process.env.ANTHROPIC_API_KEY) throw new Error('Manca ANTHROPIC_API_KEY (nel file .env).')
    const testo = process.argv[iDomanda + 1]?.trim()
    if (!testo) throw new Error('Manca la domanda.')
    const scelta = giaFatto.secondo?.scelta ?? giaFatto.scelta
    const messaggio = `Ti chiami ${scelta.nome}. Domani, 1° ottobre 2026 alle 7:23, ti accendi con 100 € e l'obiettivo di restare in vita e poi guadagnare più di un part-time (900 € netti al mese). Prima di accenderti, Luca ti chiede di decidere una cosa. La risposta vale e sarà pubblica.\n\n${testo}`
    const r = await pensa({ livello: 'pensa_meglio', schema: Scelte, sistema: VOCE, messaggio })
    giaFatto.domande = [...(giaFatto.domande ?? []), { quando: adesso().toISOString(), modello: r.modello, costo_eur: r.costo.eur, pagato_da: 'luca', domanda: testo, risposta: r.decisione }]
    scriviJson('giorno-zero.json', giaFatto)
    for (const d of r.decisione.decisioni) console.log(`${d.cosa}: ${d.decisione.toUpperCase()} — ${d.perche}`)
    console.log(`\nA Luca: «${r.decisione.messaggio_a_luca}»\n(Deciso con ${r.modello}. È costato ${centesimi(r.costo.eur)}, pagati da Luca.)`)
    return
  }
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
