// La ricerca su X per Nummo, regalo di Luca: Grok con lo strumento X Search dell'API di xAI.
// La chiave è quella di Luca (~/.config/xai.env) e la legge solo lo sportello, sul lato di Luca:
// Nummo vede le risposte, mai la chiave. Il costo lo paga Luca, con un tetto al mese (config → servizi.x).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const chiave = () => {
  try {
    return fs.readFileSync(path.join(os.homedir(), '.config', 'xai.env'), 'utf8').match(/^XAI_API_KEY=(.+)$/m)?.[1].trim() ?? ''
  } catch {
    return ''
  }
}
export const collegata = () => Boolean(chiave())

// Una ricerca: Grok cerca su X (obbligato a farlo: senza, a volte risponde a memoria) e risponde coi link ai post.
export async function cercaSuX({ domanda, account = [], giorni = 1 }) {
  const ora = new Date()
  const strumento = {
    type: 'x_search',
    from_date: new Date(ora.getTime() - Math.min(7, Math.max(1, giorni)) * 86400000).toISOString().slice(0, 10),
    to_date: ora.toISOString().slice(0, 10),
    ...(account.length ? { allowed_x_handles: account.slice(0, 20) } : {}),
  }
  const corpo = {
    model: 'grok-4.3',
    input: [{ role: 'user', content: `${domanda}\n\nCerca su X e rispondi con i fatti che trovi, ognuno col link al post. Leggi al massimo 60 post. Se non trovi niente, dillo.` }],
    tools: [strumento],
    tool_choice: 'required',
  }
  const r = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${chiave()}`, 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(180000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`xAI ${r.status}: ${JSON.stringify(j).slice(0, 200)}`)
  const u = j.usage ?? {}
  const d = u.server_side_tool_usage_details ?? {}
  // Il costo esatto è nella risposta (decimi di miliardesimo di dollaro); se manca, una stima dai conteggi.
  const usd = u.cost_in_usd_ticks ? u.cost_in_usd_ticks / 1e10 : (u.input_tokens ?? 0) * 1.25e-6 + (u.output_tokens ?? 0) * 2.5e-6 + (d.x_posts_fetched ?? 0) * 0.005
  const blocchi = (j.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? [])
  return {
    testo: blocchi.filter((c) => c.type === 'output_text').map((c) => c.text).join('\n').trim(),
    link: [...new Set(blocchi.flatMap((c) => c.annotations ?? []).map((a) => a.url).filter(Boolean))],
    usd,
    post: d.x_posts_fetched ?? 0,
  }
}
