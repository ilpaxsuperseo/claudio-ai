// Cose comuni: percorsi, impostazioni, date, file JSONL, soldi.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import YAML from 'yaml'

export const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// In simulazione i dati stanno altrove, così il libro dei conti vero resta pulito.
export const DATI = path.resolve(RADICE, process.env.NUMMO_DATI || 'dati')

export const config = YAML.parse(fs.readFileSync(path.join(RADICE, 'config.yaml'), 'utf8'))
export const costituzioneTesto = fs.readFileSync(path.join(RADICE, 'costituzione.yaml'), 'utf8')

export const file = (nome) => path.join(DATI, nome)

export function leggiJsonl(nome) {
  const p = file(nome)
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r))
}

export function aggiungiJsonl(nome, oggetto) {
  fs.mkdirSync(DATI, { recursive: true })
  fs.appendFileSync(file(nome), JSON.stringify(oggetto) + '\n')
}

export function leggiJson(nome, predefinito) {
  const p = file(nome)
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : predefinito
}

export function scriviJson(nome, oggetto) {
  fs.mkdirSync(DATI, { recursive: true })
  fs.writeFileSync(file(nome), JSON.stringify(oggetto, null, 2) + '\n')
}

// "Adesso" si può spostare con NUMMO_ADESSO per le simulazioni.
export const adesso = () => (process.env.NUMMO_ADESSO ? new Date(process.env.NUMMO_ADESSO) : new Date())

// La data di calendario in Italia, AAAA-MM-GG.
export const dataLocale = (d = adesso()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: config.fuso }).format(d)

const giorniFra = (da, a) => Math.round((Date.parse(a) - Date.parse(da)) / 86400000)

// Giorno 1 è il primo giorno di vita.
export const giornoDiVita = (d = adesso()) => giorniFra(config.giorno_uno, dataLocale(d)) + 1

export const inSostegno = (d = adesso()) => dataLocale(d) <= config.sostegno_vitale.fino_a

export const arrotonda = (n, cifre = 4) => Math.round(n * 10 ** cifre) / 10 ** cifre

export const euro = (n, cifre = 2) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: cifre, maximumFractionDigits: cifre }).format(n)

// Un file lasciato da Nummo nella sua casa, letto dal lato di Luca (che ha permessi più ampi dei suoi).
// Si apre senza seguire collegamenti e si accetta solo un file vero, suo, con un solo nome: altrimenti
// Nummo potrebbe far leggere a Luca, per lui, un file di Luca.
export function leggiFileDiNummo(file, massimo = 1_000_000) {
  const cartella = path.dirname(path.resolve(file))
  if (fs.realpathSync(cartella) !== cartella) throw new Error(`${file}: percorso con collegamenti`)
  const suo = Number(execFileSync('id', ['-u', 'nummo'], { encoding: 'utf8' }))
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const s = fs.fstatSync(fd)
    if (!s.isFile() || s.nlink !== 1 || s.uid !== suo || s.size > massimo) throw new Error(`${file}: non è un file di Nummo`)
    return fs.readFileSync(fd, 'utf8')
  } finally {
    fs.closeSync(fd)
  }
}
