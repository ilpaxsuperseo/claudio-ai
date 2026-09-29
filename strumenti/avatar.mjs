// L'immagine del profilo di Nummo: il suo rosone verde (il taglio da 100) con la N al centro.
// Tutto dentro il cerchio, perché i social la ritagliano tonda. Uso: node strumenti/avatar.mjs → interno/social/avatar.png
import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { RADICE } from '../src/base.mjs'
import { taglio, rosone } from '../src/banconota.mjs'

const t = taglio(100, 'PROSPERO')
// Il seme è l'impronta del giorno zero, quando si è dato il nome.
const seme = JSON.parse(fs.readFileSync(path.join(RADICE, 'dati/giorno-zero.json'), 'utf8')).quando.replace(/\D/g, '').padEnd(64, 'a')
const tracce = rosone({ seme, densita: 1, raggio: 420, interno: 0.62 })
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="${t.carta}"/>
  <g transform="translate(540 540)" fill="none" stroke="${t.medio}" stroke-width="2.2" stroke-opacity=".7">${tracce.map((d) => `<path d="${d}"/>`).join('')}</g>
  <circle cx="540" cy="540" r="215" fill="${t.carta}"/>
  <text x="540" y="642" text-anchor="middle" font-family="Archivo Expanded" font-weight="800" font-size="290" fill="${t.inchiostro}">N</text>
</svg>`
const cartella = path.join(RADICE, 'interno', 'social')
fs.mkdirSync(cartella, { recursive: true })
const png = new Resvg(svg, { font: { fontFiles: [path.join(RADICE, 'caratteri/archivo-largo-800.ttf')], loadSystemFonts: false } }).render().asPng()
fs.writeFileSync(path.join(cartella, 'avatar.png'), png)
console.log(path.relative(RADICE, path.join(cartella, 'avatar.png')))
