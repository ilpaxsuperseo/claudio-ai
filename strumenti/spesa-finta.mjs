// Solo per le simulazioni: registra una spesa creativa inventata, per vedere scendere la cassa.
// Uso: NUMMO_DATI=simulazione/dati node strumenti/spesa-finta.mjs 7.5
import { registraCosto, conti } from '../src/registro.mjs'
if (!process.env.NUMMO_DATI?.startsWith('simulazione')) throw new Error('Solo in simulazione')
registraCosto({ categoria: 'creativo', importo_eur: Math.min(Number(process.argv[2]), Math.max(0, conti().cassa - 0.5)), descrizione: 'Spesa di prova (simulazione)', rif: 'simulazione' })
