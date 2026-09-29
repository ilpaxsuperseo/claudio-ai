// Riprova la chiave API di Nummo ogni 3 minuti (chiamata gratuita) finché torna a funzionare.
// Uso: set -a; . ./.env; set +a; node strumenti/aspetta-chiave.mjs [minuti massimi, predefinito 60]
import Anthropic from '@anthropic-ai/sdk'

const fine = Date.now() + Number(process.argv[2] ?? 60) * 60000
const client = new Anthropic({ maxRetries: 0 })
while (Date.now() < fine) {
  try {
    await client.models.retrieve('claude-haiku-4-5')
    console.log(`${new Date().toLocaleTimeString('it-IT')}  la chiave funziona di nuovo`)
    process.exit(0)
  } catch (e) {
    console.log(`${new Date().toLocaleTimeString('it-IT')}  ancora no: ${e.status ?? ''} ${e.message.slice(0, 80)}`)
  }
  await new Promise((r) => setTimeout(r, 180000))
}
process.exit(1)
