// Higgsfield per lo sportello: immagini e video generati con i crediti di Luca, pagati dalla cassa di Nummo.
// Passa da una sessione di Claude Code col connettore Higgsfield dell'account di Luca; il guardiano
// notte/controlla-higgsfield.mjs lascia fare solo tre cose: il prezzo, una generazione dentro il tetto, l'attesa.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { RADICE } from './base.mjs'

export const MODELLI = { immagine: ['gpt_image_2_5', 'soul_2'], video: ['kling3_0', 'seedance_2_5', 'minimax_h3'] }
export const FORMATI = ['1:1', '4:5', '9:16', '16:9']

// Claude Code: il più recente fra quelli dell'estensione di VS Code.
function claude() {
  const cartella = path.join(process.env.HOME, '.vscode/extensions')
  const versioni = fs.readdirSync(cartella).filter((d) => /^anthropic\.claude-code-.+-darwin-arm64$/.test(d)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return path.join(cartella, versioni.at(-1) ?? '-', 'resources/native-binary/claude')
}

// Restituisce quello che il guardiano ha annotato: { prezzo, lavoro, url, errore }.
export async function genera({ tipo, prompt, modello, formato, secondi, tettoCrediti }) {
  const params = {
    model: modello,
    prompt: String(prompt).slice(0, 2000),
    aspect_ratio: FORMATI.includes(formato) ? formato : tipo === 'video' ? '9:16' : '1:1',
    ...(tipo === 'video' ? { duration: Number(secondi) === 10 ? 10 : 5 } : {}),
  }
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'nummo-higgsfield-'))
  const richiesta = path.join(cartella, 'richiesta.json')
  const impostazioni = path.join(cartella, 'impostazioni.json')
  fs.writeFileSync(richiesta, JSON.stringify({ tipo, params, tetto_crediti: tettoCrediti }, null, 2))
  const guardiano = [{ matcher: 'mcp__claude_ai_higgsfield_ai__.*', hooks: [{ type: 'command', command: `node ${path.join(RADICE, 'notte', 'controlla-higgsfield.mjs')}` }] }]
  fs.writeFileSync(impostazioni, JSON.stringify({ hooks: { PreToolUse: guardiano, PostToolUse: guardiano } }))

  const strumento = `mcp__claude_ai_higgsfield_ai__generate_${tipo === 'video' ? 'video' : 'image'}`
  const passi = `Esegui questi passi e nient'altro. Gli argomenti li completa da sé il sistema: passa pure argomenti provvisori.
1) Chiama ${strumento}: la prima volta il sistema chiede solo il prezzo.
2) Chiama di nuovo ${strumento} per generare davvero.
3) Chiama mcp__claude_ai_higgsfield_ai__jobs_wait finché il risultato non è pronto (all_terminal vero), al massimo 40 volte.
Poi rispondi soltanto FATTO. Se un passo viene bloccato, fermati e rispondi BLOCCATO.`
  // La sessione usa l'account di Luca (è lì il connettore Higgsfield), non la chiave API di Nummo.
  const ambiente = { ...process.env, HIGGSFIELD_RICHIESTA: richiesta }
  delete ambiente.ANTHROPIC_API_KEY
  await new Promise((ok) => {
    const f = spawn(claude(), ['-p', passi, '--allowedTools', `${strumento},mcp__claude_ai_higgsfield_ai__jobs_wait`, '--permission-mode', 'dontAsk', '--settings', impostazioni, '--model', 'claude-haiku-4-5', '--output-format', 'json'], { cwd: cartella, env: ambiente, stdio: 'ignore' })
    const tempo = setTimeout(() => f.kill('SIGTERM'), 15 * 60000)
    f.on('close', () => { clearTimeout(tempo); ok() })
  })
  const esito = JSON.parse(fs.readFileSync(richiesta, 'utf8'))
  fs.rmSync(cartella, { recursive: true, force: true })
  return esito
}
