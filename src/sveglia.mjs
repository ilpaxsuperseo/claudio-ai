// La sveglia: il risveglio del mattino è fisso (lo paga il sostegno), gli altri li decide Nummo.
// GitHub controlla ogni ora; qui si decide se è il momento. Gli orari sono sempre in ora italiana.
import { config, leggiJson, scriviJson, leggiJsonl, adesso, dataLocale } from './base.mjs'

const S = () => ({ mattina: '07:23', min_intervallo_ore: 1, massimo_extra_al_giorno: 6, ...(config.sveglia ?? {}) })

// Le parti della data e dell'ora in Italia.
function partiLocali(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: config.fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]))
  return p
}

export const oraLocale = (d = adesso()) => {
  const p = partiLocali(d)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

// Da «2026-10-25» + «03:30» (ora italiana) all'istante vero, anche nei giorni del cambio d'ora.
export function daLocale(data, ora) {
  const [y, m, d] = data.split('-').map(Number)
  const [h, mi] = ora.split(':').map(Number)
  const voluto = Date.UTC(y, m - 1, d, h, mi)
  let t = voluto
  for (let i = 0; i < 3; i++) {
    const p = partiLocali(new Date(t))
    t += voluto - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  }
  return new Date(t)
}

const domani = (data) => new Date(Date.parse(`${data}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)

// Nummo scrive «15:00», «domani 03:30» o «2026-10-02 03:30». Torna { prossima } oppure { errore }.
export function interpreta(testo, ora = adesso()) {
  const t = String(testo ?? '').trim().toLowerCase()
  const oggi = dataLocale(ora)
  let data, hhmm
  let m = t.match(/(\d{4}-\d{2}-\d{2})[ t]+(\d{1,2})[:.](\d{2})/)
  if (m) { data = m[1]; hhmm = `${m[2]}:${m[3]}` }
  else if ((m = t.match(/(domani\s+)?(?:alle\s+)?(\d{1,2})[:.](\d{2})/))) {
    hhmm = `${m[2]}:${m[3]}`
    data = m[1] ? domani(oggi) : oggi
    if (!m[1] && daLocale(data, hhmm) <= ora) data = domani(oggi) // un'ora già passata vuol dire domani
  } else return { errore: `non capisco l'ora «${testo}»: scrivi per esempio «15:00» o «domani 03:30»` }
  const [h, mi] = hhmm.split(':').map(Number)
  if (h > 23 || mi > 59) return { errore: `«${hhmm}» non è un'ora valida` }
  const prossima = daLocale(data, hhmm.padStart(5, '0'))
  const ore = (prossima - ora) / 3600000
  if (ore < S().min_intervallo_ore) return { errore: `troppo presto: fra un risveglio e l'altro serve almeno ${S().min_intervallo_ore} ora` }
  if (ore > 48) return { errore: 'troppo lontano: la sveglia si mette al massimo 48 ore avanti' }
  return { prossima }
}

export const leggi = () => leggiJson('sveglia.json', { prossima: null })

export function imposta(testo, motivo = '') {
  const r = interpreta(testo)
  if (r.errore) return `sveglia non impostata: ${r.errore}`
  scriviJson('sveglia.json', { prossima: r.prossima.toISOString(), motivo, impostata: adesso().toISOString() })
  return `sveglia impostata: ${dataLocale(r.prossima) === dataLocale() ? 'oggi' : dataLocale(r.prossima)} alle ${oraLocale(r.prossima)}`
}

export const spegni = () => scriviJson('sveglia.json', { prossima: null })

// Il risveglio del mattino è dovuto se sono passate le 7:23 italiane e oggi non c'è ancora stato.
export function mattinaDovuta(ora = adesso()) {
  if (oraLocale(ora) < S().mattina) return false
  // Un tentativo finito in errore senza costi non conta: si riprova al controllo dell'ora dopo.
  return !leggiJsonl('diario.jsonl').some((d) => d.data === dataLocale(ora) && d.ciclo === 'mattina' && !d.errore)
}

// I risvegli in più già fatti oggi (quelli in cui ha ragionato).
export const extraDiOggi = (ora = adesso()) =>
  leggiJsonl('diario.jsonl').filter((d) => d.data === dataLocale(ora) && d.ciclo === 'extra' && d.decisione).length

export const extraPossibile = (ora = adesso()) => extraDiOggi(ora) < S().massimo_extra_al_giorno

export const svegliaDovuta = (ora = adesso()) => {
  const s = leggi()
  return Boolean(s.prossima && new Date(s.prossima) <= ora)
}

export const impostazioni = S
