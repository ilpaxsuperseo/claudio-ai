// Scarica da Google Fonts le istanze fisse dei due caratteri (servono in TTF all'immagine
// del diario e in WOFF2 al sito, che li ospita da sé invece di chiamare Google).
// Uso: node strumenti/scarica-caratteri.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cartella = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../caratteri')
fs.mkdirSync(cartella, { recursive: true })

const VECCHIO = 'curl/8.7.1' // a un programma qualunque Google risponde in TrueType
const NUOVO = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

const voci = {
  'archivo-largo-800': 'Archivo:wdth,wght@125,800',
  'archivo-500': 'Archivo:wght@500',
  'archivo-700': 'Archivo:wght@700',
  'newsreader-400': 'Newsreader:opsz,wght@16,400',
  'newsreader-corsivo-400': 'Newsreader:ital,opsz,wght@1,16,400',
}

for (const [nome, famiglia] of Object.entries(voci)) {
  for (const [ua, formato] of [[VECCHIO, 'ttf'], [NUOVO, 'woff2']]) {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${famiglia}`, { headers: { 'user-agent': ua } })).text()
    // Per il latino serve l'ultimo blocco (latin), non i sottoinsiemi cirillici o vietnamiti.
    const blocchi = [...css.matchAll(/\/\* ([\w-]+) \*\/[^}]*?url\((https:[^)]+)\)/g)]
    const url = (blocchi.find((b) => b[1] === 'latin') ?? [])[2] ?? css.match(/url\((https:[^)]+)\)/)?.[1]
    if (!url) { console.log(nome, formato, 'NESSUN INDIRIZZO'); continue }
    const dati = Buffer.from(await (await fetch(url)).arrayBuffer())
    fs.writeFileSync(path.join(cartella, `${nome}.${formato}`), dati)
    console.log(nome, formato, dati.length)
  }
}
