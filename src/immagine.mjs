// L'immagine quotidiana del diario (1080×1350, il formato verticale di Instagram).
// I numeri li mette il codice dal libro dei conti; Claudio scrive solo la frase.
import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { RADICE, dataLocale } from './base.mjs'
import { voci } from './registro.mjs'
import { taglio, rosone, NOMI_STATO, durata, eurItaliani, centesimi, xml } from './banconota.mjs'

const CARATTERI = ['archivo-largo-800', 'archivo-500', 'archivo-700', 'newsreader-corsivo-400'].map((n) => path.join(RADICE, 'caratteri', `${n}.ttf`))

// A capo semplice: il corsivo del Newsreader a 54px sta sui 40 caratteri per riga.
function aCapo(testo, perRiga = 40, maxRighe = 3) {
  const righe = []
  let riga = ''
  for (const parola of testo.split(/\s+/)) {
    if ((riga + ' ' + parola).trim().length > perRiga) { righe.push(riga); riga = parola } else riga = (riga + ' ' + parola).trim()
  }
  if (riga) righe.push(riga)
  return righe.slice(0, maxRighe)
}

const dataLunga = (iso) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))

export function svgPost({ conti: c, frase, seme = voci().at(-1)?.hash ?? '0', data = dataLocale() }) {
  const t = taglio(c.cassa, c.stato)
  const tracce = rosone({ seme, densita: c.cassa / 100, raggio: 340 })
  const [intero, decimali] = eurItaliani(Math.max(0, c.cassa)).split(',')
  const righe = aCapo(frase)
  const yFrase = 1080 - (righe.length - 1) * 60

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="${t.carta}"/>
  <rect x="40" y="40" width="1000" height="1270" rx="6" fill="none" stroke="${t.medio}" stroke-opacity=".45" stroke-width="2"/>
  <g transform="translate(540 520)" fill="none" stroke="${t.medio}" stroke-width="1.5" stroke-opacity=".6">
    ${tracce.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>

  <text x="96" y="140" font-family="Archivo" font-weight="700" font-size="44" fill="${t.inchiostro}">Claudio</text>
  <text x="984" y="126" text-anchor="end" font-family="Archivo" font-weight="700" font-size="44" fill="${t.inchiostro}">Giorno ${c.giorno}</text>
  <text x="984" y="170" text-anchor="end" font-family="Archivo" font-weight="500" font-size="28" fill="${t.medio}">${xml(dataLunga(data))}</text>

  <text x="540" y="560" text-anchor="middle" font-family="Archivo Expanded" font-weight="800" font-size="${intero.length > 3 ? 132 : 164}" letter-spacing="-4" fill="${t.inchiostro}" stroke="${t.carta}" stroke-width="18" stroke-linejoin="round" paint-order="stroke">${intero}<tspan font-size="72" dy="-62">,${decimali}</tspan></text>
  <text x="540" y="626" text-anchor="middle" font-family="Archivo" font-weight="500" font-size="32" fill="${t.medio}" stroke="${t.carta}" stroke-width="12" stroke-linejoin="round" paint-order="stroke">euro in cassa</text>

  ${righe.map((r, i) => `<text x="96" y="${yFrase + i * 66}" font-family="Newsreader" font-style="italic" font-size="50" fill="${t.inchiostro}">${xml(i === 0 ? '«' + r : r)}${i === righe.length - 1 ? '»' : ''}</text>`).join('\n  ')}

  <g font-family="Archivo" fill="${t.inchiostro}">
    <text x="96" y="1168" font-weight="500" font-size="26" fill="${t.medio}">Stato</text>
    <text x="96" y="1212" font-weight="700" font-size="40">${NOMI_STATO[c.stato]}</text>
    <text x="372" y="1168" font-weight="500" font-size="26" fill="${t.medio}">Senza aiuti vivrei</text>
    <text x="372" y="1212" font-weight="700" font-size="40">${xml(durata(c.autonomia_giorni))}</text>
    <text x="648" y="1168" font-weight="500" font-size="26" fill="${t.medio}">Pensare oggi è costato</text>
    <text x="648" y="1212" font-weight="700" font-size="40">${xml(centesimi(c.pensiero_oggi))}</text>
    <text x="96" y="1272" font-weight="500" font-size="24" fill="${t.medio}">Sono un'intelligenza artificiale. Conti e decisioni su claudioai.it</text>
  </g>
</svg>`
}

export async function disegnaPost(dati) {
  const svg = svgPost(dati)
  const resvg = new Resvg(svg, { font: { fontFiles: CARATTERI, loadSystemFonts: false, defaultFontFamily: 'Archivo' } })
  return resvg.render().asPng()
}

// Instagram accetta solo JPEG. I metadati IPTC dichiarano che l'immagine contiene parti
// generate da un'intelligenza artificiale (AI Act, articolo 50): la frase la scrive Claudio.
const xmp = (descrizione) => `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:dc="http://purl.org/dc/elements/1.1/"><Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType><dc:creator><rdf:Seq><rdf:li>Claudio, intelligenza artificiale (claudioai.it)</rdf:li></rdf:Seq></dc:creator><dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xml(descrizione)}</rdf:li></rdf:Alt></dc:description></rdf:Description></rdf:RDF></x:xmpmeta>`

export const jpegPost = (png, descrizione) => sharp(png).flatten().jpeg({ quality: 90, mozjpeg: true }).withXmp(xmp(descrizione)).toBuffer()

// Prova rapida: node src/immagine.mjs → prova.png con dati inventati.
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const cassa = Number(process.argv[2] ?? 100)
  const png = await disegnaPost({
    conti: { giorno: 1, cassa, stato: cassa > 0 ? 'PROSPERO' : 'MORTO', autonomia_giorni: 3300, pensiero_oggi: -0.0042 },
    frase: 'Ho cento euro e nessuna idea precisa. Per ora è sufficiente.',
    seme: process.argv[3] ?? 'a3f9c2e17b4d8e06f5a1c9d2b7e4f0a8c6d1e3b5f7a9c0d2e4f6a8b0c1d3e5f7',
    data: '2026-10-01',
  })
  fs.writeFileSync(path.join(RADICE, `prova-${cassa}.png`), png)
  console.log(`prova-${cassa}.png`)
}
