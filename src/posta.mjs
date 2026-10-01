// La casella di Nummo, ciao@nummo.it, per lo sportello: elenco, lettura, risposta.
// Regole che non dipendono da lui:
// - risponde solo a chi gli ha scritto (niente contatti a freddo, niente indirizzi nuovi);
// - i messaggi delle piattaforme e quelli con codici, password o accessi restano nascosti:
//   chi prendesse il controllo di Nummo non potrebbe usarli per prendersi i suoi account;
// - di chi scrive vede nome e dominio, mai l'indirizzo intero; ogni risposta si firma come AI.
import { config } from './base.mjs'

const FIRMA = '\n\n—\nNummo. Sono un\'intelligenza artificiale (I\'m an AI): diario e conti su nummo.it'
const DOMINI_DI_SERVIZIO = ['instagram.com', 'facebook.com', 'facebookmail.com', 'meta.com', 'tiktok.com', 'x.com', 'twitter.com', 'threads.net', 'metricool.com', 'stripe.com', 'github.com', 'aruba.it', 'google.com', 'apple.com', 'microsoft.com', 'paypal.com', 'paypal.it', 'higgsfield.ai', 'elevenlabs.io', 'dataforseo.com', 'telegram.org', 'anthropic.com', 'linkedin.com', 'nummo.it']
const SICUREZZA = /codice|code|password|verific|verify|security|sicurezza|accesso|accedi|login|log in|reset|conferma|confirm|autenticazione|2fa|otp|one-time/i
const AUTOMATICI = /^(no-?reply|mailer-daemon|postmaster|bounce|notifications?|notifiche)/i

class Rifiuto extends Error {}
export { Rifiuto as RifiutoPosta }

const dominio = (indirizzo = '') => indirizzo.split('@')[1]?.toLowerCase() ?? ''
function nascosto(m) {
  const d = dominio(m.indirizzo)
  if (DOMINI_DI_SERVIZIO.some((x) => d === x || d.endsWith(`.${x}`))) return `messaggio di servizio da ${d}`
  if (SICUREZZA.test(m.oggetto)) return 'messaggio con codici o accessi'
  if (AUTOMATICI.test(m.indirizzo)) return `messaggio automatico da ${d}`
  return ''
}

async function casella(lavoro) {
  const { ImapFlow } = await import('imapflow')
  const c = new ImapFlow({ host: process.env.NUMMO_IMAP, port: 993, secure: true, auth: { user: process.env.NUMMO_EMAIL, pass: process.env.NUMMO_EMAIL_PASSWORD }, logger: false })
  await c.connect()
  const lock = await c.getMailboxLock('INBOX')
  try {
    return await lavoro(c)
  } finally {
    lock.release()
    await c.logout().catch(() => {})
  }
}

const sintesi = (msg) => {
  const da = msg.envelope?.from?.[0] ?? {}
  return { uid: msg.uid, data: msg.envelope?.date, nome: da.name ?? '', indirizzo: da.address ?? '', oggetto: msg.envelope?.subject ?? '', letta: msg.flags?.has('\\Seen'), risposta: msg.flags?.has('\\Answered') }
}

export const collegata = () => Boolean(process.env.NUMMO_EMAIL && process.env.NUMMO_EMAIL_PASSWORD && process.env.NUMMO_IMAP && process.env.NUMMO_SMTP)

// Gli ultimi messaggi arrivati, dal più recente.
export const elenco = (quanti = 20) =>
  casella(async (c) => {
    const tot = c.mailbox.exists
    if (!tot) return 'La casella è vuota.'
    const righe = []
    for await (const msg of c.fetch(`${Math.max(1, tot - quanti + 1)}:*`, { uid: true, envelope: true, flags: true })) {
      const m = sintesi(msg)
      const perche = nascosto(m)
      const stato = m.risposta ? 'hai risposto' : m.letta ? 'letta' : 'NON LETTA'
      righe.push(perche
        ? `uid ${m.uid} · ${new Date(m.data).toLocaleDateString('it-IT')} · [${perche}: nascosto]`
        : `uid ${m.uid} · ${new Date(m.data).toLocaleDateString('it-IT')} · ${stato} · da ${m.nome || '(senza nome)'} (@${dominio(m.indirizzo)}) · «${m.oggetto}»`)
    }
    return righe.reverse().join('\n')
  })

async function prendi(c, uid) {
  const msg = await c.fetchOne(String(uid), { uid: true, envelope: true, flags: true, source: true }, { uid: true })
  if (!msg) throw new Rifiuto(`Nessun messaggio con uid ${uid}.`)
  const m = sintesi(msg)
  const perche = nascosto(m)
  if (perche) throw new Rifiuto(`Questo è un ${perche}: resta nascosto. Se serve, lo legge Luca.`)
  const { simpleParser } = await import('mailparser')
  return { m, p: await simpleParser(msg.source) }
}

export const leggi = (uid) =>
  casella(async (c) => {
    const { m, p } = await prendi(c, uid)
    await c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
    const testo = (p.text || '').trim() || '(nessun testo leggibile)'
    return `Da: ${m.nome || '(senza nome)'} (@${dominio(m.indirizzo)})\nData: ${new Date(m.data).toLocaleString('it-IT')}\nOggetto: ${m.oggetto}\n${p.attachments?.length ? `Allegati: ${p.attachments.length} (non li apro)\n` : ''}\n${testo.length > 6000 ? `${testo.slice(0, 6000)}… (tagliato)` : testo}`
  })

// La risposta va solo a chi ha scritto quel messaggio, una volta sola.
export const rispondi = (uid, testo) =>
  casella(async (c) => {
    const corpo = String(testo ?? '').trim()
    if (!corpo || corpo.length > 5000) throw new Rifiuto('La risposta va da 1 a 5000 caratteri.')
    const { m, p } = await prendi(c, uid)
    if (m.risposta) throw new Rifiuto('A questo messaggio hai già risposto.')
    // Solo al mittente: un «Reply-To» diverso farebbe scrivere a chi non ha mai scritto.
    const a = m.indirizzo
    if (!a || nascosto({ indirizzo: a, oggetto: '' })) throw new Rifiuto('Questo indirizzo non accetta risposte.')
    const nodemailer = await import('nodemailer')
    const posta = nodemailer.createTransport({ host: process.env.NUMMO_SMTP, port: 465, secure: true, auth: { user: process.env.NUMMO_EMAIL, pass: process.env.NUMMO_EMAIL_PASSWORD } })
    await posta.sendMail({
      from: `Nummo <${process.env.NUMMO_EMAIL}>`,
      to: a,
      subject: /^re:/i.test(m.oggetto) ? m.oggetto : `Re: ${m.oggetto}`,
      text: corpo + FIRMA,
      inReplyTo: p.messageId,
      references: [...(Array.isArray(p.references) ? p.references : p.references ? [p.references] : []), p.messageId].filter(Boolean),
    })
    await c.messageFlagsAdd(String(uid), ['\\Answered', '\\Seen'], { uid: true })
    return { dominio: dominio(a) }
  })

export const massimoRisposte = () => config.servizi?.posta?.risposte_per_lavoro ?? 10
