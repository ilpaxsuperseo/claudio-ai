// Come si leggono i messaggi che Luca apre su GitHub:
//   «Entrata: 5 sostegno Ko-fi di Mario»        → soldi arrivati
//   «Spesa: 12,50 infrastruttura dominio»         → soldi spesi per Nummo
// La prima parola dopo la cifra, se è un tipo conosciuto, dice di che soldi si tratta.

// «1.234,50» e «12,50» all'italiana, ma anche «12.50» scritto di fretta.
export function leggiImporto(testo) {
  const t = testo.trim()
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^\d+\.\d{1,2}$/.test(t)) return Number(t)
  return Number(t.replace(/\./g, ''))
}

function scomponi(titolo, parola) {
  const m = titolo.match(new RegExp(`^${parola}\\s*:?\\s*([\\d.,]+)\\s*(?:€|euro)?\\s*(.*)$`, 'i'))
  if (!m) return null
  const importo = leggiImporto(m[1])
  const resto = m[2].trim()
  const prima = resto.split(/\s+/)[0]?.toLowerCase() ?? ''
  return importo > 0 && Number.isFinite(importo) ? { importo, resto, prima } : null
}

const TIPI_ENTRATA = { guadagno: 'guadagno', vendita: 'guadagno', sostegno: 'sostegno_pubblico', mancia: 'sostegno_pubblico', sponsor: 'sponsor', iniezione: 'iniezione', dono: 'iniezione' }

export function leggiEntrata(titolo) {
  const s = scomponi(titolo, 'entrata')
  if (!s) return null
  const tipo = TIPI_ENTRATA[s.prima]
  return { importo: s.importo, tipo: tipo ?? 'sostegno_pubblico', descrizione: tipo ? s.resto.slice(s.prima.length).trim() : s.resto }
}

const CATEGORIE = ['infrastruttura', 'creativo', 'servizi', 'cervello']

export function leggiSpesa(titolo) {
  const s = scomponi(titolo, 'spesa')
  if (!s) return null
  const nota = CATEGORIE.includes(s.prima)
  return { importo: s.importo, categoria: nota ? s.prima : 'servizi', descrizione: nota ? s.resto.slice(s.prima.length).trim() : s.resto }
}
