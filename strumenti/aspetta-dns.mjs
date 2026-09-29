// Aspetta che nummo.it punti a GitHub Pages (visto dal DNS pubblico, non da quello di casa),
// poi collega il dominio al sito e, quando il certificato è pronto, attiva l'HTTPS obbligatorio.
// Uso: node strumenti/aspetta-dns.mjs [minuti massimi, predefinito 120]
import { execFileSync } from 'node:child_process'

const DOMINIO = 'nummo.it'
const REPO = 'ilpaxsuperseo/nummo'
const GITHUB = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153']
const fineAlle = Date.now() + Number(process.argv[2] ?? 120) * 60000
const dormi = (ms) => new Promise((r) => setTimeout(r, ms))
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim()

async function indirizzi(nome) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${nome}&type=A`, { headers: { accept: 'application/dns-json' } })
  return ((await r.json()).Answer ?? []).filter((a) => a.type === 1).map((a) => a.data).sort()
}

let ultimo = ''
while (Date.now() < fineAlle) {
  const a = await indirizzi(DOMINIO)
  const stato = a.join(', ') || '(niente)'
  if (stato !== ultimo) { console.log(`${new Date().toLocaleTimeString('it-IT')}  ${DOMINIO} → ${stato}`); ultimo = stato }
  if (GITHUB.every((ip) => a.includes(ip)) && a.every((ip) => GITHUB.includes(ip))) {
    console.log('I DNS puntano a GitHub: collego il dominio al sito.')
    gh('api', '-X', 'PUT', `repos/${REPO}/pages`, '-f', `cname=${DOMINIO}`)
    // Il certificato arriva da solo; quando è pronto, l'HTTPS diventa obbligatorio.
    while (Date.now() < fineAlle) {
      const cert = JSON.parse(gh('api', `repos/${REPO}/pages`)).https_certificate?.state ?? 'in attesa'
      if (cert === 'approved') {
        gh('api', '-X', 'PUT', `repos/${REPO}/pages`, '-f', `cname=${DOMINIO}`, '-F', 'https_enforced=true')
        console.log(`Fatto: https://${DOMINIO} è online, con HTTPS obbligatorio.`)
        process.exit(0)
      }
      console.log(`Certificato: ${cert}…`)
      await dormi(60000)
    }
    console.log('Dominio collegato, ma il certificato non è arrivato in tempo: si riprova più tardi.')
    process.exit(2)
  }
  await dormi(60000)
}
console.log(`Tempo scaduto: ${DOMINIO} punta ancora a ${ultimo}. Controllare i record su Aruba.`)
process.exit(1)
