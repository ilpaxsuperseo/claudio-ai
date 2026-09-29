// Cose comuni: percorsi, impostazioni, date, file JSONL, soldi.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

export const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// In simulazione i dati stanno altrove, così il libro dei conti vero resta pulito.
export const DATI = path.resolve(RADICE, process.env.CLAUDIO_DATI || 'dati')

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

// "Adesso" si può spostare con CLAUDIO_ADESSO per le simulazioni.
export const adesso = () => (process.env.CLAUDIO_ADESSO ? new Date(process.env.CLAUDIO_ADESSO) : new Date())

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
