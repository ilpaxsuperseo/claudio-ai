// La pubblicazione del post del giorno su Metricool (brand Nummo), dal Mac di Luca.
//   node src/pubblica.mjs prepara   → scrive notte/da-pubblicare.json (o dice che non c'è niente da fare)
//   node src/pubblica.mjs fatto <id> → segna il post come programmato in dati/pubblicati.json
// La chiamata vera a Metricool la fa strumenti/pubblica.sh; il controllo notte/controlla-pubblicazione.mjs
// blocca qualsiasi chiamata diversa da quella preparata qui (altro brand, altro testo, altra data).
import fs from 'node:fs'
import path from 'node:path'
import { RADICE, config, leggiJsonl, leggiJson, scriviJson, adesso, dataLocale } from './base.mjs'

export const PAYLOAD = path.join(RADICE, 'notte', 'da-pubblicare.json')
const oggi = dataLocale()

function prepara() {
  const giaFatti = leggiJson('pubblicati.json', [])
  if (giaFatti.some((p) => p.data === oggi)) return console.log(`niente: il post di oggi (${oggi}) è già programmato`)
  const d = leggiJsonl('diario.jsonl').filter((x) => x.ciclo === 'mattina' && x.data === oggi && x.uscita).at(-1)
  if (!d) return console.log(`niente: oggi (${oggi}) non c'è ancora un post del mattino`)
  const testo = fs.readFileSync(path.join(RADICE, 'uscita', d.uscita, 'post.txt'), 'utf8').trim()
  const immagine = `${config.sito}/giorni/${d.uscita}.jpg`
  // Fra dieci minuti, in ora italiana: Metricool vuole una data futura.
  const quando = new Date(adesso().getTime() + 10 * 60000)
  const ora = new Intl.DateTimeFormat('sv-SE', { timeZone: config.fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(quando).replace(' ', 'T')
  const reti = config.metricool?.reti ?? ['instagram', 'facebook', 'tiktok']
  const dati = {
    instagram: { instagramData: { type: 'POST', isAiGenerated: true } },
    facebook: { facebookData: { type: 'POST' } },
    tiktok: { tiktokData: { privacyOption: 'PUBLIC_TO_EVERYONE', title: (d.frase ?? '').slice(0, 90), isAigc: true } },
    threads: { threadsData: {} },
  }
  const info = {
    autoPublish: true,
    draft: false,
    text: testo,
    media: [immagine],
    providers: reti.map((network) => ({ network })),
    publicationDate: { dateTime: ora, timezone: config.fuso },
    ...Object.assign({}, ...reti.map((r) => dati[r] ?? {})),
  }
  const payload = { blogId: String(config.metricool.blog_id), date: `${ora}${offset(quando)}`, info, giorno: d.giorno, data: oggi, immagine }
  fs.writeFileSync(PAYLOAD, JSON.stringify(payload, null, 2))
  console.log(`pronto: giorno ${d.giorno}, ${reti.join(', ')}, alle ${ora.slice(11, 16)}`)
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
else if (comando === 'fatto') fatto(argomento)
else console.log('uso: node src/pubblica.mjs prepara | fatto <id>')
