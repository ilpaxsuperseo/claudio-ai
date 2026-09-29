import fs from 'node:fs'

// Il telefono di Nummo: il bot @nummoai_bot. Parla con una sola chat, quella di Luca.
// Scrivere è una cortesia: se Telegram non risponde, il ciclo va avanti lo stesso.
const token = () => process.env.NUMMO_TELEGRAM_TOKEN || process.env.TELEGRAM_TOKEN
export const chatDiLuca = () => String(process.env.NUMMO_TELEGRAM_LUCA || process.env.TELEGRAM_LUCA || '')
export const collegato = () => Boolean(token() && chatDiLuca())

export async function bot(metodo, parametri = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token()}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parametri),
  })
  const j = await r.json()
  if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description ?? r.status}`)
  return j.result
}

// Telegram accetta al massimo 4096 caratteri per messaggio.
export const taglia = (testo) => (testo.length > 4000 ? `${testo.slice(0, 3990)}…` : testo)

// Un messaggio a Luca. Restituisce il numero del messaggio (serve a riconoscere le risposte), o null.
export async function scriviALuca(testo, { rispondiA, silenzioso = false } = {}) {
  if (!collegato()) return null
  try {
    const m = await bot('sendMessage', {
      chat_id: chatDiLuca(), text: taglia(testo), link_preview_options: { is_disabled: true }, disable_notification: silenzioso,
      ...(rispondiA ? { reply_parameters: { message_id: rispondiA, allow_sending_without_reply: true } } : {}),
    })
    return m.message_id
  } catch (e) {
    console.error(`Messaggio a Luca non inviato: ${e.message}`)
    return null
  }
}

// Un file a Luca (come documento: arriva senza compressione, pronto da caricare sui profili).
export async function fileALuca(percorso, didascalia = '') {
  if (!collegato()) return null
  try {
    const corpo = new FormData()
    corpo.append('chat_id', chatDiLuca())
    if (didascalia) corpo.append('caption', didascalia.slice(0, 1000))
    corpo.append('document', new Blob([fs.readFileSync(percorso)]), percorso.split('/').pop())
    const j = await (await fetch(`https://api.telegram.org/bot${token()}/sendDocument`, { method: 'POST', body: corpo })).json()
    if (!j.ok) throw new Error(j.description)
    return j.result.message_id
  } catch (e) {
    console.error(`File a Luca non inviato: ${e.message}`)
    return null
  }
}
