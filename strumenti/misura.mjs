// Giro di misure del sito a 390, 768, 1280 e 1680 px con Chrome vero (protocollo CDP).
// Prima: il sito servito su una porta e Chrome con --remote-debugging-port=9333 (vedi LEGGIMI).
// Uso: node strumenti/misura.mjs http://127.0.0.1:8844/ cartella-foto
import fs from 'node:fs'
import path from 'node:path'
import { collega, dormi } from './cdp.mjs'

const [indirizzo, cartella = 'foto'] = process.argv.slice(2)
fs.mkdirSync(cartella, { recursive: true })
const lista = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const c = await collega(lista.find((t) => t.type === 'page').webSocketDebuggerUrl)
await c.chiama('Page.enable'); await c.chiama('Runtime.enable')
await c.chiama('Network.enable'); await c.chiama('Network.setCacheDisabled', { cacheDisabled: true })

const CONTROLLO = `(() => {
  const L = innerWidth, guai = []
  if (document.documentElement.scrollWidth > L) guai.push('scorrimento orizzontale: ' + document.documentElement.scrollWidth + ' > ' + L)
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el)
    if (!r.width || s.visibility === 'hidden') continue
    if (r.right > L + 1 && !el.closest('.tabella')) guai.push('esce a destra: ' + el.tagName + '.' + el.className + ' ' + Math.round(r.right))
    if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(s.fontSize) < 12) guai.push('testo piccolo: ' + el.tagName + '.' + el.className + ' ' + s.fontSize)
    if (s.overflow === 'hidden' && el.scrollWidth > el.clientWidth + 1) guai.push('tagliato: ' + el.tagName + '.' + el.className)
  }
  return { altezza: document.documentElement.scrollHeight, guai: [...new Set(guai)].slice(0, 15) }
})()`

for (const larghezza of [390, 768, 1280, 1680]) {
  await c.chiama('Emulation.setDeviceMetricsOverride', { width: larghezza, height: 900, deviceScaleFactor: 1, mobile: larghezza < 700 })
  await c.chiama('Page.navigate', { url: indirizzo })
  await dormi(3500)
  const { result } = await c.chiama('Runtime.evaluate', { expression: CONTROLLO, returnByValue: true })
  console.log(larghezza, 'px · altezza', result.value.altezza, result.value.guai.length ? '\n  ' + result.value.guai.join('\n  ') : '· nessun problema')
  const foto = await c.chiama('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: larghezza, height: Math.min(result.value.altezza, 2400), scale: larghezza > 1000 ? 0.5 : 0.8 } })
  fs.writeFileSync(path.join(cartella, `${larghezza}.png`), Buffer.from(foto.data, 'base64'))
}
process.exit(0)
