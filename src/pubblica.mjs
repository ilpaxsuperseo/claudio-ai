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
  scrivi({ testo, media: `${config.sito}/giorni/${d.uscita}.jpg`, titolo: d.frase, giorno: d.giorno, data: oggi })
}

const RETI = config.metricool?.reti ?? ['instagram', 'facebook', 'tiktok']
const oraItaliana = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: config.fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d).replace(' ', 'T')

function scrivi({ testo, media, titolo = '', giorno, data, reti = RETI, quando = new Date(adesso().getTime() + 10 * 60000) }) {
  // Metricool vuole una data futura, in ora italiana. Di solito fra dieci minuti.
  const ora = oraItaliana(quando)
  const video = /\.(mp4|mov)$/i.test(media)
  const dati = {
    instagram: { instagramData: { type: video ? 'REEL' : 'POST', isAiGenerated: true } },
    facebook: { facebookData: { type: video ? 'REEL' : 'POST' } },
    tiktok: { tiktokData: { privacyOption: 'PUBLIC_TO_EVERYONE', title: titolo.slice(0, 90), isAigc: true } },
    threads: { threadsData: {} },
  }
  const info = {
    autoPublish: true,
    draft: false,
    text: testo,
    media: [media],
    providers: reti.map((network) => ({ network })),
    publicationDate: { dateTime: ora, timezone: config.fuso },
    ...Object.assign({}, ...reti.map((r) => dati[r] ?? {})),
  }
  const payload = { blogId: String(config.metricool.blog_id), date: `${ora}${offset(quando)}`, info, giorno, data, immagine: media }
  fs.writeFileSync(PAYLOAD, JSON.stringify(payload, null, 2))
  console.log(`pronto: giorno ${giorno}, ${reti.join(', ')}, alle ${ora.slice(11, 16)}`)
}

// Un post che Nummo ha preparato di notte: lavoro/da-pubblicare.json nella sua casa, con
// { "testo": "…", "media": "sito/…jpg|png|mp4", "ora": "08:30" (facoltativa), "reti": [...] (facoltative) }.
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
  if (!fs.existsSync(path.join(RADICE, 'casa', media))) return no(`${media} non è fra i file messi online`)
  const reti = Array.isArray(r.reti) && r.reti.length ? r.reti.filter((x) => RETI.includes(x)) : RETI
  if (!reti.length) return no(`le reti possibili sono: ${RETI.join(', ')}`)
  let quando
  const m = String(r.ora ?? '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (m) {
    // L'ora richiesta, oggi in Italia; se è già passata (o fra meno di dieci minuti) si pubblica fra dieci minuti.
    const oggiLe = new Date(`${dataLocale()}T${m[1].padStart(2, '0')}:${m[2]}:00${offset(adesso())}`)
    if (oggiLe.getTime() > adesso().getTime() + 10 * 60000) quando = oggiLe
  }
  const url = `${config.sito}/${media.slice(5).split('/').map(encodeURIComponent).join('/')}`
  scrivi({ testo: testo + PIE, media: url, titolo: String(r.titolo ?? testo.split('\n')[0]), giorno: giornoDiVita(), data: `${oggi} notte`, reti, quando })
}

// Lo scarto dall'ora di Greenwich in Italia in quel momento, per esempio +02:00.
function offset(d) {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: config.fuso, timeZoneName: 'longOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName').value
  return nome === 'GMT' ? '+00:00' : nome.replace('GMT', '')
}

function fatto(id) {
  const p = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'))
  scriviJson('pubblicati.json', [...leggiJson('pubblicati.json', []), { data: p.data, giorno: p.giorno, quando: adesso().toISOString(), programmato_per: p.info.publicationDate, reti: p.info.providers.map((x) => x.network), immagine: p.immagine, metricool: id ?? null }])
  fs.rmSync(PAYLOAD)
  console.log(`segnato: post del giorno ${p.giorno} programmato`)
}

const [comando, argomento] = process.argv.slice(2)
if (comando === 'prepara') prepara()
else if (comando === 'prepara-casa') preparaCasa(argomento)
else if (comando === 'fatto') fatto(argomento)
else console.log('uso: node src/pubblica.mjs prepara | fatto <id>')
