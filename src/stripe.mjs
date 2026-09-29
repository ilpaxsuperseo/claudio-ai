// I pagamenti di Nummo su Stripe (account di Luca, chiave limitata: prodotti, prezzi, link; letture).
// Nummo crea i suoi link; ogni mattina il ciclo legge i pagamenti SOLO di quei link e li registra.
// Di chi paga non si tiene niente: solo importo, data, commissione e cosa ha comprato.
import { config, leggiJson, scriviJson, adesso } from './base.mjs'

const chiave = () => process.env.NUMMO_STRIPE_KEY || process.env.STRIPE_KEY
export const collegato = () => Boolean(chiave())

async function stripe(metodo, percorso, parametri = {}) {
  const corpo = new URLSearchParams()
  const aggiungi = (prefisso, valore) => {
    if (valore && typeof valore === 'object') for (const [k, v] of Object.entries(valore)) aggiungi(`${prefisso}[${k}]`, v)
    else if (valore !== undefined) corpo.append(prefisso, String(valore))
  }
  for (const [k, v] of Object.entries(parametri)) aggiungi(k, v)
  const url = `https://api.stripe.com/v1/${percorso}${metodo === 'GET' && corpo.size ? `?${corpo}` : ''}`
  const r = await fetch(url, {
    method: metodo,
    headers: { authorization: `Bearer ${chiave()}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: metodo === 'GET' ? undefined : corpo,
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`Stripe ${metodo} ${percorso}: ${j.error?.message ?? r.status}`)
  return j
}

export const pagamenti = () => leggiJson('pagamenti.json', [])

// «mancia»: importo libero (da 1 € in su) → sostegno del pubblico. Altrimenti un prodotto a prezzo fisso → guadagno.
export async function creaLink({ dettagli, importo_eur }) {
  if (!collegato()) return 'non creato: Stripe non è collegato'
  const righe = String(dettagli ?? '').trim().split('\n')
  const mancia = /mancia/i.test(righe[0])
  const nome = righe[0].replace(/^\s*(mancia|prodotto)\s*[:\-]\s*/i, '').trim().slice(0, 120) || (mancia ? 'Una mancia per il diario di Nummo' : '')
  const descrizione = righe.slice(1).join(' ').trim().slice(0, 500)
  if (!nome) return 'non creato: manca il nome'
  if (!mancia) {
    if (!config.stripe?.vendite_attive) return 'non creato: le vendite di prodotti non sono ancora attive (Luca aspetta il via del commercialista); le mance sì'
    if (!(importo_eur >= 1)) return 'non creato: un prodotto vuole un prezzo di almeno 1 €'
  }
  if (pagamenti().filter((p) => p.attivo).length >= 10) return 'non creato: hai già 10 link attivi'
  const meta = { progetto: 'nummo', tipo: mancia ? 'mancia' : 'prodotto' }
  const prodotto = await stripe('POST', 'products', { name: mancia ? `${nome} (mancia)` : nome, description: descrizione || undefined, metadata: meta })
  const prezzo = await stripe('POST', 'prices', {
    product: prodotto.id, currency: 'eur', metadata: meta,
    ...(mancia ? { custom_unit_amount: { enabled: true, minimum: 100, preset: 300 } } : { unit_amount: Math.round(importo_eur * 100) }),
  })
  const link = await stripe('POST', 'payment_links', {
    line_items: { 0: { price: prezzo.id, quantity: 1 } }, metadata: meta,
    after_completion: { type: 'hosted_confirmation', hosted_confirmation: { custom_message: mancia ? 'Grazie. Nummo registrerà la tua mancia nel suo libro dei conti (senza il tuo nome).' : 'Grazie. Nummo registrerà la vendita nel suo libro dei conti (senza il tuo nome).' } },
  })
  const voce = { id: link.id, url: link.url, tipo: meta.tipo, nome, descrizione, prezzo_eur: mancia ? null : importo_eur, creato: adesso().toISOString(), attivo: true }
  scriviJson('pagamenti.json', [...pagamenti(), voce])
  return `link creato (${meta.tipo}): ${link.url}`
}

// I pagamenti completati sui link di Nummo, con la commissione vera di Stripe.
export async function incassi() {
  if (!collegato()) return []
  const nuovi = []
  for (const p of pagamenti()) {
    const elenco = await stripe('GET', 'checkout/sessions', { payment_link: p.id, status: 'complete', limit: 100, 'expand[]': 'data.payment_intent.latest_charge.balance_transaction' })
    for (const s of elenco.data) {
      if (s.payment_status !== 'paid' || s.currency !== 'eur') continue
      const bt = s.payment_intent?.latest_charge?.balance_transaction
      nuovi.push({ sessione: s.id, link: p.id, tipo: p.tipo, nome: p.nome, importo_eur: s.amount_total / 100, commissione_eur: bt?.fee != null ? bt.fee / 100 : null, quando: new Date(s.created * 1000).toISOString() })
    }
  }
  return nuovi
}
