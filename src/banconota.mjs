// L'identità di Nummo è una banconota: prende il colore del taglio che vale la sua cassa
// (verde come i 100, arancio come i 50, blu come i 20…) e ogni giorno ha un disegno di
// sicurezza diverso, generato dall'impronta dell'ultima riga del libro dei conti.
// Solo i colori e la tecnica del guilloché: nessun elemento delle banconote vere.

const TAGLI = [
  { da: 500, nome: '500', carta: '#F2EEF4', tinta: '#E2D6EA', medio: '#7A5A96', inchiostro: '#2E1A40' },
  { da: 200, nome: '200', carta: '#F5F1E6', tinta: '#EADDB8', medio: '#94702A', inchiostro: '#3A2A0C' },
  { da: 100, nome: '100', carta: '#EEF2EC', tinta: '#D5E3CF', medio: '#4E7F58', inchiostro: '#15321F' },
  { da: 50, nome: '50', carta: '#F6EFE8', tinta: '#F0D7BF', medio: '#A95B24', inchiostro: '#3F1E08' },
  { da: 20, nome: '20', carta: '#ECF0F6', tinta: '#D0DCEE', medio: '#3D66A0', inchiostro: '#122645' },
  { da: 10, nome: '10', carta: '#F6ECEB', tinta: '#EDCFCB', medio: '#A0403A', inchiostro: '#3E1111' },
  { da: 5, nome: '5', carta: '#EFF0F0', tinta: '#DCDFE0', medio: '#666D71', inchiostro: '#25292C' },
  { da: 0.01, nome: 'monete', carta: '#F4EEE9', tinta: '#E6D2C1', medio: '#8F5634', inchiostro: '#34200F' },
]
const SENZA_INCHIOSTRO = { da: 0, nome: 'nessuno', carta: '#F1F1F0', tinta: '#E4E4E2', medio: '#8E8E8A', inchiostro: '#4A4A47' }

export function taglio(cassa, stato) {
  if (stato === 'MORTO') return SENZA_INCHIOSTRO
  return TAGLI.find((t) => cassa >= t.da) ?? SENZA_INCHIOSTRO
}

// Numeri pseudo-casuali ma ripetibili, presi dall'impronta (hash esadecimale).
function generatore(seme) {
  let i = 0
  return () => {
    const n = parseInt(seme.slice(i % 56, (i % 56) + 8), 16) / 0xffffffff
    i += 5
    return n
  }
}

// Il rosone: curve polari sovrapposte, leggermente sfasate, come nei fondi di sicurezza.
// "densità" da 0 a 1: meno soldi, meno linee.
export function rosone({ seme, densita, raggio, interno = 0.62 }) {
  const caso = generatore(seme.padEnd(64, '0'))
  const k = 9 + Math.floor(caso() * 10)           // lobi grandi
  const m = k * (3 + Math.floor(caso() * 3)) + 2  // increspatura fine
  const b = 0.05 + caso() * 0.05
  const c = 0.03 + caso() * 0.025
  const fase = caso() * Math.PI * 2
  const linee = Math.max(2, Math.round(3 + Math.min(1, densita) * 21))
  const tracce = []
  // Due famiglie di curve sfasate in senso opposto: incrociandosi fanno la trama.
  for (let i = 0; i < linee; i++) {
    const verso = i % 2 ? 1 : -1
    const a = interno + (i / Math.max(1, linee - 1)) * 0.24
    const sfasa = verso * (i / linee) * (Math.PI / k) * 2
    const punti = []
    for (let s = 0; s <= 900; s++) {
      const t = (s / 900) * Math.PI * 2
      const r = raggio * (a + b * Math.sin(k * t + fase + sfasa) + c * Math.sin(m * t + verso * fase))
      punti.push(`${(r * Math.cos(t)).toFixed(1)},${(r * Math.sin(t)).toFixed(1)}`)
    }
    tracce.push(`M${punti.join('L')}Z`)
  }
  return tracce
}

export const NOMI_STATO = { PROSPERO: 'Prospero', STABILE: 'Stabile', PRUDENTE: 'Prudente', DISPERATO: 'Disperato', CRITICO: 'Critico', MORTO: 'Morto' }

// «Senza aiuti vivrei ancora…»
export function durata(giorni) {
  if (giorni == null) return 'senza limite'
  if (giorni < 60) return giorni === 1 ? '1 giorno' : `${giorni} giorni`
  if (giorni < 730) return `${Math.floor(giorni / 30)} mesi`
  return `${Math.floor(giorni / 365)} anni`
}

export const eurItaliani = (n) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

// Il costo del pensiero di oggi, leggibile anche quando è una frazione di centesimo.
export function centesimi(eur) {
  const c = Math.abs(eur) * 100
  if (c === 0) return 'niente'
  if (c < 1) return `${c.toLocaleString('it-IT', { maximumFractionDigits: 2 })} centesimi`
  if (c < 100) return `${c.toLocaleString('it-IT', { maximumFractionDigits: 1 })} centesimi`
  return `${eurItaliani(Math.abs(eur))} €`
}

export const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
