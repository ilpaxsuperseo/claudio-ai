// Le pagine che Claudio scrive su claudioai.it: il dominio è suo, come usarlo lo decide lui.
// Le scrive in Markdown; il sito le mostra senza HTML grezzo e senza link pericolosi.
import fs from 'node:fs'
import path from 'node:path'
import { Marked } from 'marked'
import { RADICE, adesso } from './base.mjs'
import { xml } from './banconota.mjs'

export const PAGINE = path.join(RADICE, process.env.CLAUDIO_PAGINE || 'pagine')
const RISERVATI = new Set(['dati', 'giorni', 'caratteri', 'pagine', 'diario', 'index', 'sito', 'api', 'admin', 'assets'])
const MAX_PAGINE = 20
const MAX_CARATTERI = 12000

export function scriviPagina(percorso, testo) {
  const nome = String(percorso ?? '').trim()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(nome)) return `non scritta: «${nome}» non è un indirizzo valido (lettere minuscole, numeri e trattini)`
  if (RISERVATI.has(nome)) return `non scritta: «${nome}» è un indirizzo riservato`
  const file = path.join(PAGINE, `${nome}.md`)
  if (!testo.trim()) {
    if (!fs.existsSync(file)) return `niente da cancellare: /${nome}/ non esiste`
    fs.rmSync(file)
    return `pagina /${nome}/ cancellata`
  }
  if (testo.length > MAX_CARATTERI) return `non scritta: ${testo.length} caratteri, il massimo è ${MAX_CARATTERI}`
  fs.mkdirSync(PAGINE, { recursive: true })
  const esistenti = fs.readdirSync(PAGINE).filter((f) => f.endsWith('.md'))
  if (!fs.existsSync(file) && esistenti.length >= MAX_PAGINE) return `non scritta: hai già ${MAX_PAGINE} pagine, cancellane una`
  const nuova = !fs.existsSync(file)
  fs.writeFileSync(file, testo.trim() + '\n')
  return `pagina /${nome}/ ${nuova ? 'creata' : 'riscritta'}`
}

export function elencoPagine() {
  if (!fs.existsSync(PAGINE)) return []
  return fs.readdirSync(PAGINE).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const testo = fs.readFileSync(path.join(PAGINE, f), 'utf8')
    return {
      percorso: f.slice(0, -3),
      titolo: testo.match(/^#\s+(.+)$/m)?.[1].trim() ?? f.slice(0, -3),
      testo,
      aggiornata: fs.statSync(path.join(PAGINE, f)).mtime,
    }
  })
}

// Link ammessi: web, posta, indirizzi interni. Tutto il resto (javascript:, data:…) diventa testo.
const hrefSicuro = (href = '') => /^(https?:|mailto:|\/|\.{1,2}\/|#)/i.test(href) || /^[a-z0-9-]+\/?$/i.test(href)

const md = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => xml(text),
    link({ href, title, tokens }) {
      const testo = this.parser.parseInline(tokens)
      if (!hrefSicuro(href)) return testo
      const esterno = /^https?:/i.test(href)
      return `<a href="${xml(href)}"${title ? ` title="${xml(title)}"` : ''}${esterno ? ' rel="nofollow noopener"' : ''}>${testo}</a>`
    },
    image({ href, text }) {
      return /^https:\/\//i.test(href) ? `<img src="${xml(href)}" alt="${xml(text)}" loading="lazy">` : xml(text)
    },
  },
})

export const htmlPagina = (testo) => md.parse(testo)
