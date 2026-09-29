// Controlla la chiave limitata di Stripe: cosa può fare e cosa no. Non stampa mai dati di clienti.
// Uso: set -a; . ./.env; set +a; node strumenti/verifica-stripe.mjs
const chiave = process.env.NUMMO_STRIPE_KEY
const prova = async (nome, percorso) => {
  const r = await fetch(`https://api.stripe.com/v1/${percorso}`, { headers: { authorization: `Bearer ${chiave}` } })
  const j = await r.json()
  console.log(`${r.ok ? 'PERMESSO' : 'NEGATO  '}  ${nome}${r.ok && Array.isArray(j.data) ? ` (${j.data.length} elementi)` : ''}`)
}
await prova('leggere i prodotti', 'products?limit=5')
await prova('leggere i prezzi', 'prices?limit=5')
await prova('leggere i link di pagamento', 'payment_links?limit=5')
await prova('leggere i pagamenti (checkout)', 'checkout/sessions?limit=5')
await prova('leggere il saldo', 'balance')
await prova('vedere i clienti', 'customers?limit=1')
await prova('vedere i bonifici in uscita', 'payouts?limit=1')
await prova('vedere le contestazioni', 'disputes?limit=1')
