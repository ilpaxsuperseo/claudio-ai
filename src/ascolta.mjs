// Il bot di Nummo in ascolto sul Mac di Luca (lo tiene acceso il LaunchAgent nummo-telegram).
// Dalla chat di Luca:
//   risposta al messaggio di una richiesta     → il testo va nella issue, a nome di Luca: conta come il suo sì/no
//   «sì» o «no» da solo, con una richiesta aperta → vale per quella
//   «Entrata: …», «Spesa: …», «Dato: …», «Stop» → una issue di Luca: la registra il ciclo (lo stop parte subito)
//   /stato                                     → come sta, senza pensare (non costa niente)
//   tutto il resto                             → una chiacchierata: risponde Nummo, paga Nummo, finisce nel diario pubblico
// Da chiunque altro: una risposta fissa, senza pensare. I messaggi si trattano uno alla volta.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { RADICE } from './base.mjs'
import { bot, chatDiLuca, collegato, scriviALuca } from './telegram.mjs'
import { esitoDi } from './github.mjs'

const REPO = 'ilpaxsuperseo/nummo'
const FILE_OFFSET = path.join(RADICE, 'notte', 'telegram.offset')
process.env.PATH = `${process.env.HOME}/.local/bin:${process.env.HOME}/.local/node22/bin:${process.env.PATH}`

const ESTRANEI = 'Sono Nummo, un\'intelligenza artificiale che prova a mantenersi da sola partendo da 100 euro. Questo canale è riservato a Luca, che mi ha acceso. Quello che faccio, con i conti, lo trovi su nummo.it/diario'
const SOLO_RISPOSTA = /^\s*(s[iì]|ok|no)\s*[.!]*\s*$/i
const COMANDO = /^(entrata|spesa|dato|stop)\b/i

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

function esegui(comando, argomenti, minuti = 15) {
  return new Promise((risolvi, rifiuta) => {
    execFile(comando, argomenti, { cwd: RADICE, timeout: minuti * 60000, maxBuffer: 4 << 20 }, (e, out, err) => {
      if (e) rifiuta(new Error((err || out || e.message).trim().split('\n').at(-1)))
      else risolvi(`${out}`.trim())
    })
  })
}
const gh = (argomenti) => esegui('gh', [...argomenti, '--repo', REPO], 2)
const parla = (argomenti) => esegui('/bin/zsh', [path.join(RADICE, 'strumenti', 'parla.sh'), ...argomenti])

async function rispondiARichiesta(numero, testo, m) {
  await gh(['issue', 'comment', String(numero), '--body', testo])
  const esito = esitoDi(testo) === 'approvata' ? 'sì' : 'no'
  await scriviALuca(`Consegnato il tuo ${esito}. Lo leggo al prossimo controllo, entro un'ora.`, { rispondiA: m.message_id })
}

async function daLuca(m) {
  const testo = (m.text ?? '').trim()
  if (!testo) return scriviALuca('Per ora leggo solo i messaggi scritti.', { rispondiA: m.message_id })

  if (/^\/(start|stato)\b/i.test(testo)) return scriviALuca(await parla([]), { rispondiA: m.message_id })

  // Una risposta al messaggio di una richiesta: il numero della issue sta in fondo, «(#12)».
  const citata = m.reply_to_message?.from?.is_bot ? m.reply_to_message.text ?? '' : ''
  const issue = citata.match(/\(#(\d+)\)\s*$/)?.[1]
  if (issue) {
    if (!esitoDi(testo)) return scriviALuca('Per rispondere alla richiesta comincia con «sì» o «no», poi aggiungi quello che vuoi. Se invece vuoi chiedermi qualcosa, scrivimi fuori dalla risposta.', { rispondiA: m.message_id })
    return rispondiARichiesta(issue, testo, m)
  }

  if (SOLO_RISPOSTA.test(testo)) {
    const aperte = JSON.parse(await gh(['issue', 'list', '--label', 'richiesta', '--state', 'open', '--json', 'number,title']))
    if (aperte.length === 1) return rispondiARichiesta(aperte[0].number, testo, m)
    if (aperte.length > 1) return scriviALuca('Ho più richieste aperte: rispondi direttamente al messaggio di quella che intendi.', { rispondiA: m.message_id })
  }

  if (COMANDO.test(testo)) {
    const [titolo, ...resto] = testo.split('\n')
    const url = await gh(['issue', 'create', '--title', titolo.trim(), '--body', resto.join('\n').trim() || 'Da Telegram.'])
    if (/^stop\b/i.test(testo)) {
      await gh(['workflow', 'run', 'nummo.yml', '-f', 'ciclo=controlla'])
      return scriviALuca(`Stop ricevuto: mi fermo al controllo che parte adesso. ${url}`, { rispondiA: m.message_id })
    }
    return scriviALuca(`Annotato: lo registro al prossimo controllo, entro un'ora. ${url}`, { rispondiA: m.message_id })
  }

  await bot('sendChatAction', { chat_id: chatDiLuca(), action: 'typing' }).catch(() => {})
  return scriviALuca(await parla([testo]), { rispondiA: m.message_id })
}

async function main() {
  if (!collegato()) throw new Error('Mancano NUMMO_TELEGRAM_TOKEN o NUMMO_TELEGRAM_LUCA nel file .env')
  let offset = Number(fs.existsSync(FILE_OFFSET) ? fs.readFileSync(FILE_OFFSET, 'utf8') : 0) || 0
  console.log(`${new Date().toISOString()} in ascolto`)
  for (;;) {
    let arrivati
    try {
      arrivati = await bot('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] })
    } catch (e) {
      console.error(`${new Date().toISOString()} ${e.message}`)
      await pausa(30000)
      continue
    }
    for (const u of arrivati) {
      // L'offset si salva prima di rispondere: un messaggio perso è meglio di una risposta pagata due volte.
      offset = u.update_id + 1
      fs.writeFileSync(FILE_OFFSET, String(offset))
      const m = u.message
      if (!m) continue
      try {
        if (String(m.chat.id) === chatDiLuca()) await daLuca(m)
        else if (m.chat.type === 'private') await bot('sendMessage', { chat_id: m.chat.id, text: ESTRANEI, link_preview_options: { is_disabled: true } })
      } catch (e) {
        console.error(`${new Date().toISOString()} ${e.message}`)
        if (String(m.chat.id) === chatDiLuca()) await scriviALuca(`Non ci sono riuscito: ${e.message}`, { rispondiA: m.message_id })
      }
    }
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
