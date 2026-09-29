// Chi ha scritto al bot di Nummo: serve una volta sola, per riconoscere Luca (il suo numero di chat).
// Uso: set -a; . ./.env; set +a; node strumenti/telegram-chi.mjs
const t = process.env.NUMMO_TELEGRAM_TOKEN
const io = await (await fetch(`https://api.telegram.org/bot${t}/getMe`)).json()
console.log('bot:', io.ok ? `@${io.result.username}` : io.description)
const r = await (await fetch(`https://api.telegram.org/bot${t}/getUpdates`)).json()
const visti = new Map()
for (const u of r.result ?? []) { const m = u.message; if (m) visti.set(m.chat.id, `${m.from.first_name ?? ''} ${m.from.last_name ?? ''} (@${m.from.username ?? '-'}) → «${(m.text ?? '').slice(0, 30)}»`) }
console.log(visti.size ? [...visti].map(([id, chi]) => `chat ${id}: ${chi}`).join('\n') : 'ancora nessun messaggio al bot')
