// Controlla che la chiave API funzioni con una chiamata che non costa niente (l'elenco dei modelli).
// Uso: set -a; . ./.env; set +a; node strumenti/verifica-chiave.mjs
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../src/base.mjs'

const client = new Anthropic()
for (const livello of Object.keys(config.modelli)) {
  try {
    const m = await client.models.retrieve(config.modelli[livello].id)
    console.log(`${livello}: ${m.id} disponibile (${m.display_name})`)
  } catch (e) {
    console.log(`${livello}: ${config.modelli[livello].id} NON disponibile (${e.status ?? ''} ${e.message})`)
    process.exitCode = 1
  }
}
