// Ogni modulo deve almeno caricarsi: un apostrofo fuori posto in una stringa ha fermato una notte intera
// (29/9), perché «node --check» su un file non controlla quelli che importa.
import { test } from 'node:test'

for (const nome of ['base', 'registro', 'cervello', 'voce', 'banconota', 'immagine', 'pagine', 'sveglia', 'github', 'stripe', 'messaggi', 'telegram', 'sportello']) {
  test(`il modulo ${nome} si carica`, async () => {
    await import(`../src/${nome}.mjs`)
  })
}
