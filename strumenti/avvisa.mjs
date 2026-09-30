// Un avviso a Luca su Telegram, dagli script del Mac: node strumenti/avvisa.mjs "testo"
// Serve quando qualcosa si ferma e nessuno lo guarderebbe (pubblicazione, numeri).
import { scriviALuca } from '../src/telegram.mjs'
await scriviALuca(process.argv.slice(2).join(' '))
