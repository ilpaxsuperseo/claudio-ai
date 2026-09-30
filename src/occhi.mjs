// Gli occhi di Nummo: fa girare casa/mente/occhi.mjs, il codice che si scrive da solo di notte.
// Gira su GitHub in un lavoro a parte, senza chiavi e senza poter scrivere nel repository (vedi il workflow).
// Stampa quello che il suo codice restituisce (al massimo 4000 caratteri), oppure l'errore: lo legge al risveglio.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.env.NUMMO_CASA || 'casa', 'mente', 'occhi.mjs')
const MAX = 4000
const SECONDI = 60

if (fs.existsSync(FILE)) {
  const tempo = new Promise((_, ko) => setTimeout(() => ko(new Error(`ci ha messo più di ${SECONDI} secondi`)), SECONDI * 1000))
  try {
    const m = await import(pathToFileURL(FILE).href)
    if (typeof m.default !== 'function') throw new Error('occhi.mjs deve esportare una funzione: export default async function () { … }')
    const r = await Promise.race([m.default(), tempo])
    const testo = typeof r === 'string' ? r : JSON.stringify(r, null, 1)
    console.log(testo.length > MAX ? `${testo.slice(0, MAX)}… (tagliato a ${MAX} caratteri)` : testo)
  } catch (e) {
    console.log(`ERRORE: ${e?.message ?? e}`)
  }
}
process.exit(0)
