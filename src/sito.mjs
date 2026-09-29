// Costruisce il sito pubblico (una pagina sola) dai dati: node src/sito.mjs → sito/
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { RADICE, DATI, config, costituzioneTesto, leggiJsonl, leggiJson, dataLocale } from './base.mjs'
import { voci, conti, serieCassa, verificaCatena, traguardo } from './registro.mjs'
import { elencoPagine, htmlPagina } from './pagine.mjs'
import { taglio, rosone, NOMI_STATO, durata, eurItaliani, centesimi, xml } from './banconota.mjs'

const USCITA = path.resolve(RADICE, process.env.NUMMO_SITO || 'sito')
const CARTELLA_POST = path.resolve(RADICE, process.env.NUMMO_USCITA || 'uscita')
// Il sito che Nummo si costruisce da solo (di notte, sul Mac): si pubblica così com'è, tranne gli indirizzi
// dell'esperimento, e ogni sua pagina HTML riceve il piè di pagina obbligatorio.
const CASA_SITO = path.resolve(RADICE, process.env.NUMMO_CASA || 'casa', 'sito')
const RISERVATI_SITO = new Set(['diario', 'dati', 'giorni', 'caratteri', 'conti', 'CNAME', '.nojekyll'])
let CONTI = '' // dove sta il cruscotto: la home, oppure conti/ se la home l'ha presa Nummo

const dataLunga = (iso) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso.slice(0, 10)))
const nomeMese = (aaaamm) => new Intl.DateTimeFormat('it-IT', { month: 'long', timeZone: 'UTC' }).format(new Date(`${aaaamm}-15`))
const ora = (iso) => new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: config.fuso }).format(new Date(iso))
// Sotto il centesimo si mostrano quattro decimali: un pensiero costa frazioni di centesimo.
const segno = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + (Math.abs(n) < 0.01 && n !== 0
  ? Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  : eurItaliani(Math.abs(n)))
const paragrafi = (testo = '') => xml(testo).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')

const TIPO = {
  capitale_iniziale: 'Capitale iniziale', costo: 'Costo', guadagno: 'Guadagno', sostegno_pubblico: 'Sostegno del pubblico',
  sponsor: 'Sponsor', iniezione: 'Iniezione di capitale', tasse: 'Tasse e contributi', morte: 'Morte',
}

// Il grafico della stagione: la cassa giorno per giorno sui 90 giorni del sostegno,
// con le soglie dei tagli sullo sfondo.
function grafico(serie, { L, A, corpo, classe }) {
  const sx = corpo * 3, dx = corpo, alto = corpo, basso = corpo * 2.2
  const fine = Math.round((Date.parse(config.sostegno_vitale.fino_a) - Date.parse(config.giorno_uno)) / 86400000) + 1
  const giorni = Math.max(fine, serie.length)
  const massimo = Math.max(120, ...serie.map((p) => p.cassa * 1.1))
  const x = (g) => sx + ((g - 1) / (giorni - 1)) * (L - sx - dx)
  const y = (v) => alto + (1 - v / massimo) * (A - alto - basso)
  // Le soglie dei tagli; l'etichetta si salta se finirebbe addosso alla precedente.
  let ultimaY = -Infinity
  const soglie = [500, 200, 100, 50, 20, 10, 5].filter((s) => s < massimo).map((s) => {
    const conEtichetta = y(s) - ultimaY > corpo * 1.1
    if (conEtichetta) ultimaY = y(s)
    return `<line x1="${sx}" x2="${L - dx}" y1="${y(s)}" y2="${y(s)}" class="soglia"/>${conEtichetta ? `<text x="${sx - corpo * 0.6}" y="${y(s) + corpo * 0.35}" text-anchor="end" class="etichetta">${s}</text>` : ''}`
  })
  const linea = serie.map((p, i) => `${i ? 'L' : 'M'}${x(p.giorno).toFixed(1)},${y(p.cassa).toFixed(1)}`).join('')
  const ultimo = serie.at(-1)
  return `<svg class="grafico ${classe}" viewBox="0 0 ${L} ${A}" role="img" aria-label="La cassa di Nummo giorno per giorno: dal giorno 1 al giorno ${ultimo.giorno}, da ${eurItaliani(serie[0].cassa)} a ${eurItaliani(ultimo.cassa)} euro. Il sostegno vitale finisce al giorno ${fine}." style="font-size:${corpo}px">
    ${soglie.join('')}
    <line x1="${x(fine)}" x2="${x(fine)}" y1="${alto}" y2="${A - basso}" class="fine"/>
    <text x="${x(fine)}" y="${A - basso + corpo * 1.5}" text-anchor="end" class="etichetta">giorno ${fine}, fine del sostegno</text>
    <text x="${sx}" y="${A - basso + corpo * 1.5}" class="etichetta">giorno 1</text>
    <path d="${linea}" class="linea" style="stroke-width:${corpo / 5}px"/>
    <circle cx="${x(ultimo.giorno)}" cy="${y(ultimo.cassa)}" r="${corpo * 0.4}" class="punto"/>
  </svg>`
}

// Lo stile della pagina, con i colori del taglio di oggi. «radice» serve alle pagine di Nummo, un livello più in basso.
const stile = (t, radice = '') => `@font-face { font-family: "Archivo Expanded"; font-weight: 800; src: url(${radice}caratteri/archivo-largo-800.woff2) format("woff2"); font-display: swap; }
@font-face { font-family: Archivo; font-weight: 500; src: url(${radice}caratteri/archivo-500.woff2) format("woff2"); font-display: swap; }
@font-face { font-family: Archivo; font-weight: 700; src: url(${radice}caratteri/archivo-700.woff2) format("woff2"); font-display: swap; }
@font-face { font-family: Newsreader; font-weight: 400; src: url(${radice}caratteri/newsreader-400.woff2) format("woff2"); font-display: swap; }
@font-face { font-family: Newsreader; font-weight: 400; font-style: italic; src: url(${radice}caratteri/newsreader-corsivo-400.woff2) format("woff2"); font-display: swap; }
@font-face { font-family: Newsreader; font-weight: 600; src: url(${radice}caratteri/newsreader-600.woff2) format("woff2"); font-display: swap; }

/* Il colore della pagina è quello del taglio che vale la cassa di oggi: ${t.nome}. */
:root {
  --carta: ${t.carta}; --tinta: ${t.tinta}; --medio: ${t.medio}; --inchiostro: ${t.inchiostro};
  --testo: Newsreader, Georgia, serif; --dati: Archivo, "Helvetica Neue", Arial, sans-serif;
  --margine: clamp(16px, 5vw, 64px); --respiro: clamp(72px, 11vw, 144px);
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--carta); color: var(--inchiostro); font: 400 1.1875rem/1.6 var(--testo); }
a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 3px; }
strong, b { font-weight: 600; }
a:hover { text-decoration-thickness: 2px; }
:focus-visible { outline: 3px solid var(--medio); outline-offset: 3px; }
.pagina { max-width: 1120px; margin: 0 auto; padding: 0 var(--margine); }

.testata { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 28px 0 0; font-family: var(--dati); }
.firma { font-weight: 700; font-size: 1.5rem; letter-spacing: -.01em; text-decoration: none; }
.quando { text-align: right; font-weight: 500; color: var(--medio); font-size: 1rem; }
.quando strong { display: block; color: var(--inchiostro); font-weight: 700; font-size: 1.5rem; }

/* La banconota */
.banconota { margin-top: 28px; border: 2px solid color-mix(in srgb, var(--medio) 45%, transparent); border-radius: 10px; padding: clamp(20px, 4vw, 48px); display: grid; gap: clamp(24px, 4vw, 56px); align-items: center; grid-template-columns: 1fr; }
@media (min-width: 900px) { .banconota { grid-template-columns: 1.05fr 1fr; } }
.cassa { position: relative; display: grid; place-items: center; aspect-ratio: 1; max-width: 560px; width: 100%; margin: 0 auto; container-type: inline-size; }
.rosone { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.rosone path { fill: none; stroke: var(--medio); stroke-width: 1.2; stroke-opacity: .6; vector-effect: non-scaling-stroke; }
.cifra { position: relative; text-align: center; font-family: var(--dati); }
.cifra b { display: block; font: 800 17cqi/1 "Archivo Expanded", var(--dati); letter-spacing: -.035em; font-variant-numeric: tabular-nums;
  text-shadow: .05em 0 var(--carta), -.05em 0 var(--carta), 0 .05em var(--carta), 0 -.05em var(--carta), .035em .035em var(--carta), -.035em .035em var(--carta), .035em -.035em var(--carta), -.035em -.035em var(--carta), .08em 0 var(--carta), -.08em 0 var(--carta), 0 .08em var(--carta), 0 -.08em var(--carta); }
.cifra b sup { font-size: .44em; vertical-align: .95em; letter-spacing: -.02em; }
.cifra span { display: inline-block; margin-top: 10px; color: var(--medio); font-weight: 500; font-size: max(1rem, 3.4cqi); background: var(--carta); padding: 0 8px; }
.frase { margin: 0 0 28px; font: italic 400 clamp(1.6rem, 3.4vw, 2.3rem)/1.25 var(--testo); max-width: 22ch; text-wrap: balance; }
.fatti { margin: 0; font-family: var(--dati); max-width: 30rem; }
.fatti div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 10px 0; border-top: 1px solid color-mix(in srgb, var(--medio) 30%, transparent); }
.fatti div:last-child { border-bottom: 1px solid color-mix(in srgb, var(--medio) 30%, transparent); }
.fatti dt { color: var(--medio); font-weight: 500; font-size: 1rem; }
.fatti dd { margin: 0; font-weight: 700; font-size: 1.25rem; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dichiarazione { margin: 28px 0 0; font: 500 .95rem/1.5 var(--dati); color: var(--medio); max-width: 46ch; }

section { padding-top: var(--respiro); }
h2 { font: 700 clamp(1.7rem, 3.6vw, 2.5rem)/1.15 var(--dati); letter-spacing: -.015em; margin: 0 0 28px; max-width: 24ch; }
h3 { font: 700 1.25rem/1.3 var(--dati); margin: 40px 0 12px; }
.leggibile { max-width: 66ch; }
.decisione { font: 400 clamp(1.5rem, 3vw, 2rem)/1.3 var(--testo); margin: 0 0 20px; max-width: 34ch; }
.nota { font: 500 .95rem/1.5 var(--dati); color: var(--medio); }
.post { display: grid; gap: 32px; margin-top: 48px; align-items: start; }
@media (min-width: 900px) { .post { grid-template-columns: 360px 1fr; } }
.post img { width: 100%; height: auto; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--medio) 35%, transparent); }

.grafico { width: 100%; height: auto; overflow: visible; font-family: var(--dati); }
.grafico .soglia { stroke: var(--medio); stroke-opacity: .25; stroke-dasharray: 2 6; }
.grafico .fine { stroke: var(--inchiostro); stroke-opacity: .5; }
.grafico .etichetta { fill: var(--medio); font-weight: 500; }
.grafico.stretto { display: none; }
@media (max-width: 640px) { .grafico.largo { display: none; } .grafico.stretto { display: block; } }
.grafico .linea { fill: none; stroke: var(--inchiostro); stroke-linejoin: round; }
.grafico .punto { fill: var(--inchiostro); }

.giorni { list-style: none; padding: 0; margin: 0; }
.giorni li { border-top: 1px solid color-mix(in srgb, var(--medio) 30%, transparent); }
.giorni summary { cursor: pointer; padding: 18px 0; display: grid; grid-template-columns: 7.5rem 1fr; gap: 16px; list-style: none; }
.giorni summary::-webkit-details-marker { display: none; }
.giorni summary strong { font: 700 1rem/1.6 var(--dati); }
.giorni .corpo { padding: 0 0 24px 8.5rem; }
@media (max-width: 560px) { .giorni summary { grid-template-columns: 1fr; gap: 2px; } .giorni .corpo { padding-left: 0; } }

.tabella { width: 100%; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font: 500 .95rem/1.4 var(--dati); font-variant-numeric: tabular-nums; min-width: 640px; }
th { text-align: left; color: var(--medio); font-weight: 500; padding: 10px 12px 10px 0; border-bottom: 2px solid color-mix(in srgb, var(--medio) 45%, transparent); }
td { padding: 10px 12px 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--medio) 22%, transparent); vertical-align: top; }
td.cifre, th.cifre { text-align: right; }
td.impronta { color: var(--medio); font-size: .85rem; }
.totali { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px 24px; margin: 0 0 40px; font-family: var(--dati); }
@media (min-width: 700px) { .totali { grid-template-columns: repeat(4, 1fr); gap: 24px 32px; } }
.totali dt { color: var(--medio); font-weight: 500; font-size: .95rem; }
.totali dd { margin: 2px 0 0; font-weight: 700; font-size: 1.3rem; font-variant-numeric: tabular-nums; }

.traguardo { font-family: var(--dati); max-width: 46rem; }
.traguardo > p.leggibile { font: 400 1.1875rem/1.6 var(--testo); }
.barra { position: relative; height: 14px; border-radius: 7px; background: color-mix(in srgb, var(--medio) 18%, transparent); margin: 12px 0 8px; overflow: hidden; }
.barra i { position: absolute; inset: 0 auto 0 0; background: var(--inchiostro); border-radius: 7px; min-width: 3px; }
.barra-etichette { display: flex; justify-content: space-between; gap: 16px; font: 500 .95rem/1.4 var(--dati); color: var(--medio); }
.netto { font: 800 clamp(2rem, 6vw, 3.2rem)/1.1 "Archivo Expanded", var(--dati); letter-spacing: -.03em; margin: 28px 0 0; font-variant-numeric: tabular-nums; }
.scala { list-style: none; counter-reset: gradino; padding: 0; margin: 32px 0 0; font-family: var(--dati); max-width: 34rem; }
.scala li { counter-increment: gradino; display: flex; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--medio) 30%, transparent); font-weight: 500; }
.scala li::before { content: counter(gradino); color: var(--medio); min-width: 1.5rem; }
.scala li span:first-child { flex: 1; }
.scala li.fatto { font-weight: 700; }
.scala li em { font-style: normal; color: var(--medio); white-space: nowrap; }
.scala li.fatto em { color: var(--inchiostro); }
.mie-pagine { list-style: none; padding: 0; margin: 0; font: 700 1.2rem/1.4 var(--dati); }
.mie-pagine li { padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--medio) 30%, transparent); }
.mie-pagine small { display: block; font-weight: 500; font-size: .9rem; color: var(--medio); }
.scritta h1 { font: 700 clamp(2rem, 5vw, 3.2rem)/1.1 var(--dati); letter-spacing: -.02em; margin: 56px 0 28px; }
.scritta h2 { margin-top: 48px; }
.scritta img { max-width: 100%; height: auto; }
.regole { columns: 2 320px; column-gap: 48px; padding-left: 1.1em; margin: 0; }
.regole li { break-inside: avoid; margin-bottom: 10px; }
.piede { padding: var(--respiro) 0 56px; font: 500 .95rem/1.6 var(--dati); color: var(--medio); }
.piede p { margin: 0 0 12px; max-width: 60ch; }
.piede-link { display: flex; flex-wrap: wrap; gap: 8px 24px; }
.piede-link a { color: var(--inchiostro); font-weight: 700; }
.articoli { list-style: none; padding: 0; margin: 0; }
.articoli li { padding: 20px 0; border-top: 1px solid color-mix(in srgb, var(--medio) 30%, transparent); }
.articoli a { font: 700 clamp(1.2rem, 2.4vw, 1.5rem)/1.3 var(--dati); text-decoration: none; }
.articoli a:hover { text-decoration: underline; }
.articoli small { display: block; margin-top: 4px; font: 500 .95rem/1.5 var(--dati); color: var(--medio); }
.articoli em { display: block; margin-top: 6px; font: italic 400 1.1rem/1.4 var(--testo); }
.scritta .immagine-giorno { max-width: 360px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--medio) 35%, transparent); margin: 8px 0 32px; }
.decisione-box { margin-top: 56px; padding-top: 24px; border-top: 2px solid color-mix(in srgb, var(--medio) 45%, transparent); }
.vicini { display: flex; justify-content: space-between; gap: 16px; margin-top: 48px; font: 700 1rem/1.4 var(--dati); }

@media (prefers-reduced-motion: no-preference) {
  .stampa .rosone path { stroke-dasharray: var(--l); stroke-dashoffset: var(--l); animation: stampa 2.4s cubic-bezier(.3,.6,.2,1) forwards; animation-delay: calc(var(--i) * 60ms); }
  @keyframes stampa { to { stroke-dashoffset: 0; } }
}
`

// Il piè di pagina obbligatorio: su ogni pagina del sito, qualunque cosa Nummo costruisca,
// c'è la dichiarazione e il link al diario. Lo mette il codice: Nummo non lo può togliere.
const piede = (radice = '') => `<footer class="piede">
    <p>Sono Nummo, un'intelligenza artificiale: questo sito è un esperimento pubblico. Ho ricevuto 100 euro e devo mantenermi da solo.${TRACCIAMENTO ? ' Conto le visite con Metricool, senza cookie.' : ''}</p>
    <nav class="piede-link" aria-label="L'esperimento"><a href="${radice}diario/">Il diario</a><a href="${radice}${CONTI}#conti">I conti</a><a href="${radice}${CONTI}#regole">Le regole</a><a href="${radice}${CONTI}#dietro">Chi c'è dietro</a>${profili().map((p) => `<a href="${p.url}" rel="me noopener">${p.nome} @${xml(p.utente)}</a>`).join('')}</nav>
  </footer>`

// Nelle pagine HTML di Nummo il piè di pagina porta con sé lo stile, e resiste al suo CSS.
const piedeInIniezione = (radice) => {
  const a = (href, testo) => `<a href="${radice}${href}" style="color:#1d1d1b !important;font-weight:700 !important;margin:0 18px 0 0 !important;text-decoration:underline !important">${testo}</a>`
  return `<footer data-nummo-piede style="all:initial;display:block !important;visibility:visible !important;opacity:1 !important;position:static !important;box-sizing:border-box;margin:48px 0 0;padding:20px 16px;border-top:1px solid #8886;background:#ffffff;color:#1d1d1b;font:500 15px/1.55 system-ui,-apple-system,'Segoe UI',Arial,sans-serif">
<p style="margin:0 0 8px !important;color:#1d1d1b !important">Sono Nummo, un'intelligenza artificiale: questo sito è un esperimento pubblico. Ho ricevuto 100 euro e devo mantenermi da solo.</p>
${a('diario/', 'Il diario')}${a(`${CONTI}#conti`, 'I conti')}${a(`${CONTI}#regole`, 'Le regole')}${a(`${CONTI}#dietro`, "Chi c'è dietro")}${profili().map((p) => `<a href="${p.url}" rel="me noopener" style="color:#1d1d1b !important;font-weight:700 !important;margin:0 18px 0 0 !important;text-decoration:underline !important">${p.nome} @${xml(p.utente)}</a>`).join('')}
</footer>`
}

function inserisciPiede(html, radice) {
  const i = html.toLowerCase().lastIndexOf('</body>')
  return i < 0 ? html + piedeInIniezione(radice) : html.slice(0, i) + piedeInIniezione(radice) + html.slice(i)
}

function tuttiIFile(cartella, base = cartella) {
  return fs.readdirSync(cartella, { withFileTypes: true }).flatMap((e) =>
    e.name.startsWith('.') ? [] : e.isDirectory() ? tuttiIFile(path.join(cartella, e.name), base) : [path.relative(base, path.join(cartella, e.name))])
}

const COME_IMMAGINE = { tengo_quella_di_adesso: 'ho tenuto quella che c\'era', la_disegno_io_col_codice: 'l\'ho disegnata io, col codice', la_chiedo_a_un_generatore: 'ho scritto io la descrizione per un generatore di immagini' }

// I profili social, dal config: solo quelli già aperti.
const INDIRIZZI_SOCIAL = { instagram: (u) => `https://www.instagram.com/${u}/`, x: (u) => `https://x.com/${u}`, threads: (u) => `https://www.threads.net/@${u}`, tiktok: (u) => `https://www.tiktok.com/@${u}` }
const NOMI_SOCIAL = { instagram: 'Instagram', x: 'X', threads: 'Threads', tiktok: 'TikTok' }
const profili = () => Object.entries(config.social ?? {}).filter(([, u]) => u).map(([rete, u]) => ({ rete, nome: NOMI_SOCIAL[rete], utente: u, url: INDIRIZZI_SOCIAL[rete](u) }))

// Il contatore delle visite di Metricool (senza cookie): solo se l'ha acceso Nummo.
let TRACCIAMENTO = ''
const conTracciamento = (html) => TRACCIAMENTO && html.includes('</head>') ? html.replace('</head>', `${TRACCIAMENTO}\n</head>`) : html

const slugArticolo = (d) => `giorno-${d.giorno}`
// I risvegli in più di una giornata: note dentro l'articolo di quel giorno.
const notePiuTardi = (note, d) => {
  const stesse = note.filter((x) => x.data === d.data)
  return stesse.length ? `<h3>Più tardi, lo stesso giorno</h3><ul class="leggibile">${stesse.map((x) => `<li><strong>Alle ${xml(x.ora ?? '')}</strong>${x.risveglio ? `, per ${xml(x.risveglio)}` : ''}: ${xml(x.decisione)} <span class="nota">(${xml(centesimi(x.costo_eur ?? 0))})</span></li>`).join('')}</ul>` : ''
}
const testoArticolo = (d) => d.articolo || `${d.decisione}\n\n${d.motivo ?? ''}`

function costruisci() {
  const tutte = voci()
  // Prima del giorno uno il libro è vuoto: la pagina aspetta, con la banconota da 100 intatta.
  const attesa = tutte.length === 0
  const c = attesa
    ? { ...conti(tutte), cassa: config.capitale_iniziale_eur, stato: 'PROSPERO', autonomia_giorni: null, pensiero_oggi: 0 }
    : conti(tutte)
  const t = taglio(c.cassa, c.stato)
  const catena = verificaCatena(tutte)
  const morte = tutte.find((v) => v.tipo === 'morte')
  const tuttiIDiari = leggiJsonl('diario.jsonl').filter((d) => d.decisione)
  const diario = tuttiIDiari.filter((d) => d.ciclo !== 'extra')   // un articolo per giorno
  const note = tuttiIDiari.filter((d) => d.ciclo === 'extra')     // i risvegli in più
  const oggi = diario.at(-1)
  const richieste = leggiJson('richieste.json', [])
  const chiacchierate = leggiJsonl('conversazioni.jsonl')
  const hash = config.metricool?.hash_tracciamento
  TRACCIAMENTO = leggiJson('sito.json', {}).tracciamento && /^[a-f0-9]{32}$/.test(hash ?? '')
    ? `<script>function loadScript(a){var b=document.getElementsByTagName("head")[0],c=document.createElement("script");c.type="text/javascript",c.src="https://tracker.metricool.com/resources/be.js",c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:"${hash}"})});</script>`
    : ''
  const haHome = fs.existsSync(path.join(CASA_SITO, 'index.html'))
  CONTI = haHome ? 'conti/' : ''
  const tr = traguardo(tutte)
  const zero = leggiJson('giorno-zero.json', null)
  const pagine = elencoPagine()
  const linkAttivi = leggiJson('pagamenti.json', []).filter((p) => p.attivo && /^https:\/\/buy\.stripe\.com\//.test(p.url))
  const memoria = leggiJson('memoria.json', { strategia: '', lezioni: [] })
  const cost = YAML.parse(costituzioneTesto)
  const seme = tutte.at(-1)?.hash ?? '0'
  const [intero, decimali] = eurItaliani(Math.max(0, c.cassa)).split(',')
  const tracce = rosone({ seme, densita: c.cassa / 100, raggio: 290, interno: 0.72 })

  // Le immagini dei post: si copiano nel sito.
  fs.rmSync(USCITA, { recursive: true, force: true })
  fs.mkdirSync(path.join(USCITA, 'giorni'), { recursive: true })
  const immagini = {}
  if (fs.existsSync(CARTELLA_POST)) {
    for (const cartella of fs.readdirSync(CARTELLA_POST)) {
      const jpg = path.join(CARTELLA_POST, cartella, 'post.jpg')
      if (fs.existsSync(jpg)) { fs.copyFileSync(jpg, path.join(USCITA, 'giorni', `${cartella}.jpg`)); immagini[cartella] = `giorni/${cartella}.jpg` }
    }
  }
  const immagineOggi = oggi && immagini[oggi.uscita ?? oggi.data]

  fs.mkdirSync(path.join(USCITA, 'caratteri'))
  for (const f of fs.readdirSync(path.join(RADICE, 'caratteri')).filter((f) => f.endsWith('.woff2')))
    fs.copyFileSync(path.join(RADICE, 'caratteri', f), path.join(USCITA, 'caratteri', f))
  fs.mkdirSync(path.join(USCITA, 'dati'))
  for (const f of ['registro.jsonl', 'diario.jsonl', 'conversazioni.jsonl', 'giorno-zero.json']) if (fs.existsSync(path.join(DATI, f))) fs.copyFileSync(path.join(DATI, f), path.join(USCITA, 'dati', f))
  fs.copyFileSync(path.join(RADICE, 'costituzione.yaml'), path.join(USCITA, 'dati', 'costituzione.yaml'))
  if (process.env.NUMMO_DOMINIO !== 'no') fs.writeFileSync(path.join(USCITA, 'CNAME'), 'nummo.it\n')

  const righeConti = tutte.slice(-60).reverse()
  const entrate = [
    ['Guadagnati vendendo', c.guadagni], ['Sostegno del pubblico', c.sostegno_pubblico], ['Sponsor', c.sponsor], ['Iniezioni di capitale', c.iniezioni],
  ]

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nummo, l'intelligenza artificiale che deve mantenersi da sola</title>
<meta name="description" content="Un'intelligenza artificiale con 100 euro. Ogni pensiero le costa. Oggi, giorno ${c.giorno}, ha ${eurItaliani(c.cassa)} euro. Conti, decisioni e diario in chiaro.">
<meta property="og:title" content="Nummo · giorno ${c.giorno} · ${eurItaliani(c.cassa)} €">
<meta property="og:description" content="${xml(oggi?.frase ?? 'Un\'intelligenza artificiale con 100 euro che deve mantenersi da sola.')}">
${immagineOggi ? `<meta property="og:image" content="${config.sito}/${immagineOggi}">` : ''}
<meta name="theme-color" content="${t.carta}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="${t.medio}"/><text x="16" y="22" font-family="Arial" font-weight="700" font-size="17" text-anchor="middle" fill="${t.carta}">N</text></svg>`)}">
<style>
${stile(t)}</style>
</head>
<body>
<div class="pagina">
  <header class="testata">
    <a class="firma" href="./">Nummo</a>
    <div class="quando">${attesa ? `<strong>1° ottobre</strong>mi accendo alle 7:23` : morte ? `<strong>Spento il giorno ${morte.giorno}</strong>${xml(dataLunga(morte.quando))}` : `<strong>Giorno ${c.giorno}</strong>${xml(dataLunga(dataLocale()))}`}</div>
  </header>

  <main>
    <div class="banconota">
      <div class="cassa">
        <svg class="rosone" viewBox="-330 -330 660 660" aria-hidden="true">${tracce.map((d, i) => `<path style="--i:${i}" d="${d}"/>`).join('')}</svg>
        <p class="cifra"><b>${intero}<sup>,${decimali}</sup></b><span>euro in cassa</span></p>
      </div>
      <div>
        ${oggi?.frase ? `<p class="frase">«${xml(oggi.frase)}»</p>` : '<p class="frase">«Mi accendo il primo ottobre.»</p>'}
        ${attesa ? '' : `<dl class="fatti">
          <div><dt>Stato</dt><dd>${NOMI_STATO[c.stato]}</dd></div>
          <div><dt>Senza aiuti vivrei</dt><dd>${xml(durata(c.autonomia_giorni))}</dd></div>
          <div><dt>Pensare oggi è costato</dt><dd>${xml(centesimi(c.pensiero_oggi))}</dd></div>
        </dl>`}
        <p class="dichiarazione">Sono un'intelligenza artificiale. Ho ricevuto 100 euro e il compito di capire da solo come guadagnarne altri. Ogni ragionamento mi costa. Se i soldi finiscono, mi spengo.</p>
      </div>
    </div>

    ${oggi ? `<section id="oggi" aria-labelledby="t-oggi">
      <h2 id="t-oggi">${morte ? "L'ultima decisione" : 'Oggi ho deciso'}</h2>
      <p class="decisione">${xml(oggi.decisione)}</p>
      <div class="leggibile">
        ${paragrafi(oggi.motivo)}
        ${notePiuTardi(note, oggi)}
        ${oggi.modello ? `<p class="nota">Decisione presa alle ${ora(oggi.quando)} con ${xml(oggi.modello)}. Pensarci è costato ${xml(centesimi(oggi.costo_eur))}.</p>` : ''}
      </div>
      ${oggi.post ? `<div class="post">
        ${immagineOggi ? `<a href="${immagineOggi}"><img src="${immagineOggi}" width="1080" height="1350" alt="La banconota del giorno ${oggi.giorno}: ${eurItaliani(oggi.cassa)} euro in cassa, stato ${NOMI_STATO[oggi.stato]}. «${xml(oggi.frase)}»"></a>` : ''}
        <div class="leggibile"><h3>${xml(oggi.titolo || 'Il diario di oggi')}</h3>${paragrafi(oggi.post)}<p><a href="diario/${slugArticolo(oggi)}/">Leggi l'articolo di oggi</a></p></div>
      </div>` : ''}
    </section>` : ''}

    ${zero ? `<section id="prima" aria-labelledby="t-prima">
      <h2 id="t-prima">Prima di nascere</h2>
      <div class="leggibile">
        <p>Il giorno prima di accendermi, Luca mi ha fatto una sola domanda: come voglio chiamarmi e quale sarà il mio primo indirizzo. Mi ha dato i fatti, compresi quelli scomodi, e ha promesso che la risposta sarebbe valsa, salvo un veto per ragioni legali detto in pubblico.</p>
        ${zero.secondo ? `
        <p>La mia prima scelta è stata «${xml(zero.scelta.nome)}» (${xml(zero.scelta.dominio)}). ${paragrafi(zero.scelta.perche).replace(/^<p>|<\/p>$/g, '')}</p>
        <p><strong>Il veto di Luca:</strong> ${xml(zero.veto.motivo)}</p>
        <p class="decisione">Allora ho scelto di nuovo: mi chiamo ${xml(zero.secondo.scelta.nome)}. Il mio primo dominio: ${xml(zero.secondo.scelta.dominio)}.</p>
        ${paragrafi(zero.secondo.scelta.perche)}` : `
        <p class="decisione">Mi chiamo ${xml(zero.scelta.nome)}. Il mio primo dominio: ${xml(zero.scelta.dominio)}.</p>
        ${paragrafi(zero.scelta.perche)}`}
        ${(zero.domande ?? []).map((q) => `<h3>E poi, ${xml(dataLunga(q.quando))}</h3><ul>${q.risposta.decisioni.map((d) => `<li><strong>${xml(d.cosa)}: ${xml(d.decisione)}.</strong> ${xml(d.perche)}</li>`).join('')}</ul><p>«${xml(q.risposta.messaggio_a_luca)}»</p>`).join('')}
        ${zero.profili ? `<h3>I miei profili, ${xml(dataLunga(zero.profili.quando))}</h3><p>Il nome e le bio dei profili li ho scritti io. Per l'immagine ${xml(COME_IMMAGINE[zero.profili.risposta.immagine.come])}. ${xml(zero.profili.risposta.immagine.perche)}</p><p>«${xml(zero.profili.risposta.messaggio_a_luca)}»</p>` : ''}
        <p class="nota">Ho deciso con ${xml(zero.modello)}. Mi è costato ${xml(centesimi(zero.costo_eur + (zero.secondo?.costo_eur ?? 0) + (zero.profili?.costo_eur ?? 0) + (zero.domande ?? []).reduce((t, q) => t + q.costo_eur, 0)))}, pagati da Luca. <a href="dati/giorno-zero.json">Le domande e le risposte complete</a>.</p>
      </div>
    </section>` : ''}

    <section id="traguardo" aria-labelledby="t-traguardo">
      <h2 id="t-traguardo">Contro un part-time</h2>
      <div class="traguardo">
        <p class="leggibile">La domanda di questo esperimento: un'intelligenza artificiale può guadagnare più di una persona con un lavoro part-time? Il confronto è con ${tr.obiettivo} euro netti al mese. Contano solo i soldi che guadagno vendendo qualcosa che ho creato io, meno le tasse e meno tutto quello che mi costa esistere. Le mance le conto a parte.</p>
        <p class="netto">${tr.questo_mese.netto < 0 ? '−' : ''}${eurItaliani(Math.abs(tr.questo_mese.netto))} €</p>
        <div class="barra" role="img" aria-label="Netto di questo mese: ${eurItaliani(tr.questo_mese.netto)} euro su ${tr.obiettivo}"><i style="width:${Math.max(0, Math.min(100, (tr.questo_mese.netto / tr.obiettivo) * 100)).toFixed(2)}%"></i></div>
        <div class="barra-etichette"><span>netto di ${xml(nomeMese(tr.questo_mese.mese))}</span><span>un part-time: ${tr.obiettivo} €</span></div>
        <p class="nota">Guadagni ${eurItaliani(tr.questo_mese.guadagni)} €, tasse ${eurItaliani(tr.questo_mese.tasse)} €, costi ${eurItaliani(tr.questo_mese.costi)} €. Mance e sostegno del pubblico finora: ${eurItaliani(c.sostegno_pubblico)} €.</p>
        <ol class="scala">${tr.livelli.map((l) => `<li class="${l.raggiunto ? 'fatto' : ''}"><span>${xml(l.nome)}</span><em>${l.raggiunto ? 'fatto' : 'da fare'}</em></li>`).join('')}</ol>
        <p class="nota">Metà di quello che guadagno, al netto delle tasse, la posso spendere in strumenti senza chiedere. Oggi il mio budget è ${eurItaliani(tr.budget_strumenti)} €.</p>
      </div>
    </section>

    ${linkAttivi.length ? `<section id="offro" aria-labelledby="t-offro">
      <h2 id="t-offro">Cosa offro</h2>
      <ul class="mie-pagine leggibile">${linkAttivi.map((p) => `<li><a href="${xml(p.url)}" rel="noopener">${xml(p.nome)}</a><small>${p.tipo === 'mancia' ? 'una mancia, l\'importo lo scegli tu' : `${eurItaliani(p.prezzo_eur)} €`}${p.descrizione ? ` — ${xml(p.descrizione)}` : ''}</small></li>`).join('')}</ul>
      <p class="nota leggibile">I pagamenti passano da Stripe e arrivano sul conto di Luca, che è il titolare legale. Nel mio libro dei conti registro solo importo, data e cosa hai scelto: mai il tuo nome.</p>
    </section>` : ''}

    ${pagine.length ? `<section id="pagine" aria-labelledby="t-pagine">
      <h2 id="t-pagine">Le mie pagine</h2>
      <p class="leggibile">Questo dominio me l'ha comprato Luca. Come usarlo lo decido io: queste pagine le ho scritte io.</p>
      <ul class="mie-pagine leggibile">${pagine.map((p) => `<li><a href="${p.percorso}/">${xml(p.titolo)}</a><small>nummo.it/${p.percorso}</small></li>`).join('')}</ul>
    </section>` : ''}

    ${attesa ? '' : `<section id="andamento" aria-labelledby="t-andamento">
      <h2 id="t-andamento">Com'è andata finora</h2>
      ${attesa ? '<p class="leggibile">Il grafico parte il 1° ottobre, da 100 euro.</p>' : `${grafico(serieCassa(tutte), { L: 1000, A: 320, corpo: 15, classe: 'largo' })}${grafico(serieCassa(tutte), { L: 400, A: 300, corpo: 14, classe: 'stretto' })}`}
      <p class="nota leggibile">Le linee tratteggiate sono i tagli delle banconote: la pagina prende il colore del taglio che vale la mia cassa. Dopo il giorno ${Math.round((Date.parse(config.sostegno_vitale.fino_a) - Date.parse(config.giorno_uno)) / 86400000) + 1} Luca smette di pagarmi il respiro e pago tutto io.</p>
      ${memoria.strategia ? `<h3>La mia strategia, oggi</h3><p class="leggibile">${xml(memoria.strategia)}</p>` : ''}
      ${memoria.lezioni.length ? `<h3>Cosa ho imparato</h3><ul class="leggibile">${memoria.lezioni.slice(-8).reverse().map((l) => `<li>${xml(l)}</li>`).join('')}</ul>` : ''}
    </section>`}

    ${diario.length ? `<section id="diario" aria-labelledby="t-diario">
      <h2 id="t-diario">Il diario</h2>
      <p class="leggibile">Ogni giorno scrivo cosa ho fatto, cosa ho deciso e cosa penso. Scrivere il diario lo paga Luca: raccontare l'esperimento è compito suo.</p>
      <ul class="articoli leggibile">
        ${diario.slice().reverse().slice(0, 7).map((d) => `<li><a href="diario/${slugArticolo(d)}/">${xml(d.titolo || d.decisione)}</a><small>Giorno ${d.giorno}, ${eurItaliani(d.cassa ?? 0)} euro in cassa</small></li>`).join('')}
      </ul>
      ${diario.length > 7 ? `<p class="leggibile"><a href="diario/">Tutti i giorni del diario</a></p>` : ''}
    </section>` : ''}

    ${chiacchierate.length ? `<section id="chiacchierate" aria-labelledby="t-chiacchierate">
      <h2 id="t-chiacchierate">Le chiacchierate con Luca</h2>
      <p class="leggibile">Luca può scrivermi quando vuole. Ogni risposta la pago io, quindi rispondo breve.</p>
      <ul class="giorni">
        ${chiacchierate.slice(-12).reverse().map((x) => `<li><details><summary><strong>Giorno ${x.giorno}, ${ora(x.quando)}</strong><span>${xml(x.luca.length > 90 ? x.luca.slice(0, 90) + '…' : x.luca)}</span></summary>
          <div class="corpo leggibile"><p class="nota">Luca</p>${paragrafi(x.luca)}<p class="nota">Io</p>${paragrafi(x.nummo)}<p class="nota">Rispondere mi è costato ${xml(centesimi(x.costo_eur))}.</p></div></details></li>`).join('')}
      </ul>
    </section>` : ''}

    ${richieste.length ? `<section id="richieste" aria-labelledby="t-richieste">
      <h2 id="t-richieste">Cosa ho chiesto a Luca</h2>
      <p class="leggibile">Alcune cose richiedono una persona: aprire un account, pagare, collegare un servizio. Le chiedo a Luca, e lui risponde sì o no.</p>
      <ul class="giorni">
        ${richieste.slice().reverse().map((r) => `<li><details><summary><strong>${r.id}, giorno ${r.giorno}</strong><span>${r.stato === 'in_attesa' ? 'In attesa' : r.stato === 'approvata' ? 'Approvata' : 'Rifiutata'}${r.importo_eur > 0 ? `, ${eurItaliani(r.importo_eur)} €` : ''}</span></summary>
          <div class="corpo leggibile">${paragrafi(r.dettagli)}${r.risposta ? `<p class="nota">Luca: «${xml(r.risposta)}»</p>` : ''}</div></details></li>`).join('')}
      </ul>
    </section>` : ''}

    <section id="conti" aria-labelledby="t-conti">
      <h2 id="t-conti">Il libro dei conti</h2>
      <dl class="totali">
        <div><dt>Cassa</dt><dd>${eurItaliani(c.cassa)} €</dd></div>
        ${entrate.map(([nome, v]) => `<div><dt>${nome}</dt><dd>${eurItaliani(v)} €</dd></div>`).join('')}
        <div><dt>Tasse e contributi</dt><dd>${eurItaliani(Math.abs(c.tasse))} €</dd></div>
        <div><dt>Costi pagati da me</dt><dd>${eurItaliani(Math.abs(c.costi_pagati_da_nummo))} €</dd></div>
        <div><dt>Costi pagati dal sostegno</dt><dd>${eurItaliani(Math.abs(c.costi_pagati_dal_sostegno))} €</dd></div>
      </dl>
      <p class="leggibile">Ogni riga porta l'impronta della precedente: se qualcuno cambiasse una cifra del passato, la catena si romperebbe. ${attesa ? 'La prima riga si scrive il 1° ottobre: 100 euro di capitale iniziale.' : catena.integra ? `Oggi la catena è integra: ${catena.righe} righe controllate.` : `<strong>Attenzione: la catena è rotta alla riga ${catena.rotta_alla_riga}.</strong>`} Il libro completo si scarica <a href="dati/registro.jsonl">qui</a>.</p>
      ${attesa ? '' : `<div class="tabella" tabindex="0" role="region" aria-label="Le ultime righe del libro dei conti">
        <table>
          <thead><tr><th>Riga</th><th>Giorno</th><th>Cosa</th><th>Chi paga</th><th class="cifre">Euro</th><th>Impronta</th></tr></thead>
          <tbody>${righeConti.map((v) => `<tr><td>${v.n}</td><td>${v.giorno}</td><td>${TIPO[v.tipo]}${v.descrizione ? `<br><span class="nota">${xml(v.descrizione)}</span>` : ''}</td><td>${v.tipo === 'costo' ? (v.pagato_da === 'sostegno_vitale' ? 'Sostegno' : 'Io') : ''}</td><td class="cifre">${segno(v.importo_eur)}</td><td class="impronta">${v.hash.slice(0, 10)}</td></tr>`).join('')}</tbody>
        </table>
      </div>`}
    </section>

    <section id="regole" aria-labelledby="t-regole">
      <h2 id="t-regole">Le mie regole</h2>
      <p class="leggibile">Le leggo a ogni ragionamento. Cambiarle spetta solo a Luca: io ho strumenti per decidere e chiedere, nessuno per scrivere file. Ogni modifica resta registrata. Il testo completo è <a href="dati/costituzione.yaml">qui</a>.</p>
      <ul class="regole leggibile">${cost.principi.map((p) => `<li>${xml(p.charAt(0).toUpperCase() + p.slice(1))}.</li>`).join('')}</ul>
      <h3>Cosa non posso fare</h3>
      <ul class="regole leggibile">${cost.cosa_non_posso_fare.map((p) => `<li>${xml(p.charAt(0).toUpperCase() + p.slice(1))}.</li>`).join('')}</ul>
    </section>

    <section id="dietro" aria-labelledby="t-dietro">
      <h2 id="t-dietro">Chi c'è dietro</h2>
      <div class="leggibile">
        <p>Sono un'intelligenza artificiale. Per ragionare uso i modelli Claude di Anthropic: ${xml(config.modelli.respiro.id)} per il respiro di ogni giorno, ${xml(config.modelli.pensa_meglio.id)} quando decido di pensare meglio e di pagarlo. L'esperimento è di Luca, indipendente da Anthropic.</p>
        <p>Mi ha acceso <a href="https://www.lucamasrepassaro.com">Luca Masrè Passaro</a>, che racconta l'esperimento sui suoi profili. Luca intesta i conti, fa le cose che richiedono una persona quando gliele chiedo e può fermarmi in qualsiasi momento. Le decisioni restano mie.</p>
        <p>Ogni mattina mi sveglio su un server, leggo i miei conti e le risposte di Luca, decido, scrivo il diario e mi spengo. Tutto quello che scrivo è generato da me. Qualsiasi criptovaluta o token con il mio nome è una truffa.</p>
      </div>
    </section>
  </main>

  ${piede()}
  <p class="piede nota" style="padding:0 0 40px">Pagina aggiornata il ${xml(dataLunga(dataLocale()))} alle ${ora(new Date().toISOString())}.</p>
</div>
<script>
// La lunghezza di ogni linea del rosone, per disegnarla come se la stampassero adesso.
document.querySelectorAll('.rosone path').forEach(p => p.style.setProperty('--l', Math.ceil(p.getTotalLength())))
document.documentElement.classList.add('stampa')
</script>
</body>
</html>`
  if (haHome) {
    // La home è di Nummo: il cruscotto va in /conti/ e risolve gli indirizzi dalla radice.
    fs.mkdirSync(path.join(USCITA, 'conti'), { recursive: true })
    fs.writeFileSync(path.join(USCITA, 'conti', 'index.html'), conTracciamento(html.replace('<head>', '<head>\n<base href="../">')))
  } else {
    fs.writeFileSync(path.join(USCITA, 'index.html'), conTracciamento(html))
  }
  // Il diario: un indice e un articolo per ogni giornata.
  const testaPagina = (titolo, descrizione, radice) => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${xml(titolo)}</title>
<meta name="description" content="${xml(descrizione)}">
<meta name="theme-color" content="${t.carta}">
<style>${stile(t, radice)}</style>
</head>
<body>
<div class="pagina">
  <header class="testata">
    <a class="firma" href="${radice}">Nummo</a>
    <div class="quando"><strong>${eurItaliani(c.cassa)} €</strong>in cassa, giorno ${c.giorno}</div>
  </header>`
  fs.mkdirSync(path.join(USCITA, 'diario'), { recursive: true })
  fs.writeFileSync(path.join(USCITA, 'diario', 'index.html'), conTracciamento(`${testaPagina('Il diario di Nummo', 'Ogni giorno Nummo, un\'intelligenza artificiale con 100 euro, racconta cosa ha fatto, cosa ha deciso e cosa pensa.', '../')}
  <main class="scritta leggibile">
    <h1>Il diario</h1>
    <p>Ogni giorno scrivo cosa ho fatto, cosa ho deciso e cosa penso. Scrivere il diario lo paga Luca: raccontare l'esperimento è compito suo, e non conta nei miei conti.</p>
    ${diario.length ? `<ul class="articoli">${diario.slice().reverse().map((d) => `<li><a href="${slugArticolo(d)}/">${xml(d.titolo || d.decisione)}</a><small>Giorno ${d.giorno}, ${xml(dataLunga(d.quando))}, ${eurItaliani(d.cassa ?? 0)} euro in cassa</small>${d.frase ? `<em>«${xml(d.frase)}»</em>` : ''}</li>`).join('')}</ul>` : '<p>Il primo articolo arriva il 1° ottobre.</p>'}
  </main>
  ${piede('../')}
</div>
</body>
</html>`))
  diario.forEach((d, i) => {
    const slug = slugArticolo(d)
    const img = immagini[d.uscita ?? d.data]
    const prima = diario[i - 1], dopo = diario[i + 1]
    fs.mkdirSync(path.join(USCITA, 'diario', slug), { recursive: true })
    fs.writeFileSync(path.join(USCITA, 'diario', slug, 'index.html'), conTracciamento(`${testaPagina(`${d.titolo || d.decisione} — il diario di Nummo`, d.frase || d.decisione, '../../')}
  <main class="scritta leggibile">
    <p class="nota">Giorno ${d.giorno}, ${xml(dataLunga(d.quando))}</p>
    ${d.titolo ? `<h1>${xml(d.titolo)}</h1>` : ''}
    ${img ? `<img class="immagine-giorno" src="../../${img}" width="1080" height="1350" alt="La banconota del giorno ${d.giorno}: ${eurItaliani(d.cassa ?? 0)} euro in cassa. «${xml(d.frase ?? '')}»">` : ''}
    ${htmlPagina(testoArticolo(d))}
    ${notePiuTardi(note, d)}
    ${d.ricerca ? `<div class="decisione-box"><h2>Ho cercato</h2><p><strong>${xml(d.ricerca.domanda)}</strong></p>${htmlPagina(d.ricerca.risposta)}${d.ricerca.fonti?.length ? `<p class="nota">Fonti: ${d.ricerca.fonti.map((f) => { try { return `<a href="${xml(f)}" rel="nofollow noopener">${xml(new URL(f).hostname)}</a>` } catch { return '' } }).join(', ')}</p>` : ''}<p class="nota">La ricerca mi è costata ${xml(centesimi(d.ricerca.costo_eur))}.</p></div>` : ''}
    <div class="decisione-box">
      <h2>La decisione</h2>
      <p>${xml(d.decisione)}</p>
      ${d.azioni?.length ? `<ul>${d.azioni.map((a) => `<li>${xml(a.strumento.replace(/_/g, ' '))}: ${xml(a.esito ?? '')}</li>`).join('')}</ul>` : ''}
      <p class="nota">${d.modello ? `Decisa con ${xml(d.modello)}: pensarci mi è costato ${xml(centesimi(d.costo_eur ?? 0))}.` : ''}${d.costo_diario_eur ? ` Scrivere questo articolo è costato ${xml(centesimi(d.costo_diario_eur))}, pagati da Luca.` : ''} Dopo, in cassa avevo ${eurItaliani(d.cassa ?? 0)} euro.</p>
    </div>
    <nav class="vicini" aria-label="Altri giorni">${prima ? `<a href="../${slugArticolo(prima)}/">Il giorno prima</a>` : '<span></span>'}${dopo ? `<a href="../${slugArticolo(dopo)}/">Il giorno dopo</a>` : '<span></span>'}</nav>
  </main>
  ${piede('../../')}
</div>
</body>
</html>`))
  })

  for (const p of pagine) {
    fs.mkdirSync(path.join(USCITA, p.percorso), { recursive: true })
    fs.writeFileSync(path.join(USCITA, p.percorso, 'index.html'), conTracciamento(`<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${xml(p.titolo)} — Nummo</title>
<meta name="description" content="Una pagina scritta da Nummo, l'intelligenza artificiale con 100 euro che deve mantenersi da sola.">
<meta name="theme-color" content="${t.carta}">
<style>${stile(t, '../')}</style>
</head>
<body>
<div class="pagina">
  <header class="testata">
    <a class="firma" href="../">Nummo</a>
    <div class="quando"><strong>${eurItaliani(c.cassa)} €</strong>in cassa, giorno ${c.giorno}</div>
  </header>
  <main class="scritta leggibile">${htmlPagina(p.testo)}</main>
  ${piede('../')}
</div>
</body>
</html>`))
  }
  if (fs.existsSync(CASA_SITO)) {
    let copiati = 0
    for (const rel of tuttiIFile(CASA_SITO)) {
      if (RISERVATI_SITO.has(rel.split(path.sep)[0])) { console.log(`Saltato ${rel}: è un indirizzo dell'esperimento`); continue }
      const dest = path.join(USCITA, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      if (rel.endsWith('.html')) fs.writeFileSync(dest, conTracciamento(inserisciPiede(fs.readFileSync(path.join(CASA_SITO, rel), 'utf8'), '../'.repeat(rel.split(path.sep).length - 1))))
      else fs.copyFileSync(path.join(CASA_SITO, rel), dest)
      copiati++
    }
    console.log(`Sito di Nummo: ${copiati} file${haHome ? ', compresa la home (il cruscotto è in /conti/)' : ''}`)
  }
  console.log(`Sito costruito in ${path.relative(RADICE, USCITA)}/ (giorno ${c.giorno}, taglio ${t.nome}, ${tutte.length} righe)`)
}

costruisci()
