// La pubblicazione del post del giorno su Metricool (brand Nummo), dal Mac di Luca.
//   node src/pubblica.mjs prepara   → scrive notte/da-pubblicare.json (o dice che non c'è niente da fare)
//   node src/pubblica.mjs prepara-casa <file> → lo stesso, per un post che Nummo ha preparato di notte nella sua casa
//   node src/pubblica.mjs fatto <id> → segna il post come programmato in dati/pubblicati.json
// La chiamata vera a Metricool la fa strumenti/pubblica.sh; il controllo notte/controlla-pubblicazione.mjs
// blocca qualsiasi chiamata diversa da quella preparata qui (altro brand, altro testo, altra data).
import fs from 'node:fs'
import path from 'node:path'
import { RADICE, config, leggiJsonl, leggiJson, scriviJson, adesso, dataLocale, giornoDiVita } from './base.mjs'

export const PAYLOAD = path.join(RADICE, 'notte', 'da-pubblicare.json')
const oggi = dataLocale()

function prepara() {
  const giaFatti = leggiJson('pubblicati.json', [])
  if (giaFatti.some((p) => p.data === oggi)) return console.log(`niente: il post di oggi (${oggi}) è già programmato`)
  const d = leggiJsonl('diario.jsonl').filter((x) => x.ciclo === 'mattina' && x.data === oggi && x.uscita).at(-1)
  if (!d) return console.log(`niente: oggi (${oggi}) non c'è ancora un post del mattino`)
  const testo = fs.readFileSync(path.join(RADICE, 'uscita', d.uscita, 'post.txt'), 'utf8').trim()
  const breve = corto(`«${d.frase}»`, `Giorno ${d.giorno} di Nummo, un'intelligenza artificiale che prova a mantenersi da sola. Diario e conti:`, `${config.sito}/diario/giorno-${d.giorno}/`)
  scrivi({ testo, breve, media: `${config.sito}/giorni/${d.uscita}.jpg`, titolo: d.frase, giorno: d.giorno, data: oggi })
}

// Il testo corto per X: sta nei 280 caratteri (un indirizzo ne conta 23), accorciando la prima parte se serve.
function corto(prima, seconda, link) {
  const spazio = 280 - 23 - seconda.length - 4
  const p = prima.length > spazio ? `${prima.slice(0, spazio - 1)}…` : prima
  return `${p}\n\n${seconda} ${link}`
}

const RETI = config.metricool?.reti ?? ['instagram', 'facebook', 'tiktok']
const BREVI = config.metricool?.reti_brevi ?? []
const oraItaliana = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: config.fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d).replace(' ', 'T')

// Uno o due post: il testo intero sulle reti che lo reggono, quello corto su X (e Threads).
// Il guardiano li lascia passare uno alla volta, nell'ordine, e nient'altro.
function scrivi({ testo, breve, media, titolo = '', giorno, data, reti = RETI, brevi = BREVI, quando = new Date(adesso().getTime() + 10 * 60000) }) {
  // Metricool vuole una data futura, in ora italiana. Di solito fra dieci minuti.
  const ora = oraItaliana(quando)
  const video = /\.(mp4|mov)$/i.test(media)
  const dati = {
    instagram: { instagramData: { type: video ? 'REEL' : 'POST', isAiGenerated: true } },
    facebook: { facebookData: { type: video ? 'REEL' : 'POST' } },
    tiktok: { tiktokData: { privacyOption: 'PUBLIC_TO_EVERYONE', title: titolo.slice(0, 90), isAigc: true } },
    twitter: { twitterData: { tags: [] } },
    threads: { threadsData: {} },
  }
  const post = (text, gruppo) => ({
    reti: gruppo,
    date: `${ora}${offset(quando)}`,
    info: {
      autoPublish: true,
      draft: false,
      text,
      media: [media],
      providers: gruppo.map((network) => ({ network })),
      publicationDate: { dateTime: ora, timezone: config.fuso },
      ...Object.assign({}, ...gruppo.map((r) => dati[r] ?? {})),
    },
  })
  const posts = [...(reti.length ? [post(testo, reti)] : []), ...(breve && brevi.length ? [post(breve, brevi)] : [])]
  const payload = { blogId: String(config.metricool.blog_id), giorno, data, immagine: media, posts }
  fs.writeFileSync(PAYLOAD, JSON.stringify(payload, null, 2))
  console.log(`pronto: giorno ${giorno}, ${posts.map((p) => p.reti.join(', ')).join(' + ')}, alle ${ora.slice(11, 16)} (${posts.length} post)`)
}

// Un post che Nummo ha preparato di notte: lavoro/da-pubblicare.json nella sua casa, con
// { "testo": "…", "media": "sito/…jpg|png|mp4", "ora": "08:30" (facoltativa), "breve": "…" (per X, facoltativo), "reti": [...] (facoltative) }.
// Il file indicato deve stare nel suo sito: dopo la notte è online su nummo.it e Metricool lo scarica da lì.
const PIE = '\n\nSono un\'intelligenza artificiale. Il mio diario, i conti e le decisioni: nummo.it/diario'
function preparaCasa(file) {
  const no = (motivo) => console.log(`niente: ${motivo}`)
  let r
  try {
    r = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return no(`richiesta illeggibile (${e.message})`)
  }
  const testo = String(r.testo ?? '').trim()
  if (!testo || testo.length > 2000) return no('il testo va da 1 a 2000 caratteri')
  const media = path.posix.normalize(String(r.media ?? '')).replace(/^\.\//, '')
  if (!/^sito\/[^]+\.(jpe?g|png|mp4|mov)$/i.test(media) || media.split('/').includes('..')) return no('«media» dev\'essere un\'immagine o un video dentro sito/')
  if (!fs.existsSync(path.resolve(RADICE, process.env.NUMMO_CASA || 'casa', media))) return no(`${media} non è fra i file messi online`)
  const scelte = Array.isArray(r.reti) && r.reti.length ? r.reti : [...RETI, ...BREVI]
  const reti = RETI.filter((x) => scelte.includes(x))
  const brevi = BREVI.filter((x) => scelte.includes(x))
  if (!reti.length && !brevi.length) return no(`le reti possibili sono: ${[...RETI, ...BREVI].join(', ')}`)
  let quando
  const m = String(r.ora ?? '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (m) {
    // L'ora richiesta, oggi in Italia; se è già passata (o fra meno di dieci minuti) si pubblica fra dieci minuti.
    const oggiLe = new Date(`${dataLocale()}T${m[1].padStart(2, '0')}:${m[2]}:00${offset(adesso())}`)
    if (oggiLe.getTime() > adesso().getTime() + 10 * 60000) quando = oggiLe
  }
  const url = `${config.sito}/${media.slice(5).split('/').map(encodeURIComponent).join('/')}`
  const breve = corto(String(r.breve ?? testo.split('\n')[0]).trim(), 'Sono un\'intelligenza artificiale:', config.sito)
  scrivi({ testo: testo + PIE, breve, media: url, titolo: String(r.titolo ?? testo.split('\n')[0]), giorno: giornoDiVita(), data: `${oggi} notte`, reti, brevi, quando })
}

// Lo scarto dall'ora di Greenwich in Italia in quel momento, per esempio +02:00.
function offset(d) {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: config.fuso, timeZoneName: 'longOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName').value
  return nome === 'GMT' ? '+00:00' : nome.replace('GMT', '')
}

function fatto(ids = '') {
  const p = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'))
  const mandati = p.posts.filter((x) => x.inviato)
  scriviJson('pubblicati.json', [...leggiJson('pubblicati.json', []), { data: p.data, giorno: p.giorno, quando: adesso().toISOString(), programmato_per: p.posts[0]?.info.publicationDate, reti: mandati.flatMap((x) => x.reti), immagine: p.immagine, metricool: ids.split(/\s+/).filter(Boolean) }])
  fs.rmSync(PAYLOAD)
  console.log(`segnato: ${mandati.length} di ${p.posts.length} post del giorno ${p.giorno} programmati (${mandati.flatMap((x) => x.reti).join(', ')})`)
}

const [comando, argomento] = process.argv.slice(2)
if (comando === 'prepara') prepara()
else if (comando === 'prepara-casa') preparaCasa(argomento)
else if (comando === 'fatto') fatto(process.argv.slice(3).join(' '))
else console.log('uso: node src/pubblica.mjs prepara | fatto <id>')
