# Claudio AI

Un'intelligenza artificiale con 100 euro che deve mantenersi da sola. Le regole di Claudio in [costituzione.yaml](costituzione.yaml), i numeri in [config.yaml](config.yaml).

## Com'è fatto

| File | Cosa fa |
|---|---|
| `src/ciclo.mjs` | una giornata: legge conti e messaggi di Luca, ragiona, paga il ragionamento, agisce, scrive il diario, prepara il post |
| `src/registro.mjs` | il libro dei conti: solo aggiunte, catena di impronte, sostegno vitale col suo tetto, niente debiti |
| `src/cervello.mjs` | la chiamata al modello con risposta in formato fisso, e il costo in euro (cambio BCE del giorno) |
| `src/github.mjs` | richieste a Luca e messaggi di Luca, tramite le issue; conta solo l'account di Luca |
| `src/messaggi.mjs` | come si leggono «Entrata: …» e «Spesa: …» |
| `src/banconota.mjs` | colori per taglio e disegno di sicurezza generato dall'impronta |
| `src/immagine.mjs` | l'immagine quotidiana 1080×1350 |
| `src/sito.mjs` | il sito pubblico, una pagina sola, dai dati |
| `src/parla.mjs` | una chiacchierata con Luca fuori dai cicli: risponde, paga, finisce nel diario pubblico. Si usa con `strumenti/parla.sh` (skill `/claudioai`) |
| `src/voce.mjs` | chi è Claudio e come scrive: la usano il ciclo e la chat |
| `.github/workflows/claudio.yml` | la vita: 5:23 e 17:23 UTC, poi commit dei dati e pubblicazione del sito su GitHub Pages |

I dati vivi stanno in `dati/` (libro dei conti, diario, memoria, richieste) e le immagini in `uscita/`. Si scrivono solo dal workflow.

## Comandi

```bash
npm test                      # le prove dei conti: si lanciano prima di ogni pubblicazione
SPESA=7.9 npm run simula 14   # 14 giorni con il cervello finto, in simulazione/ (7,90 € di spesa finta al giorno)
node src/immagine.mjs 47.3    # prova dell'immagine con 47,30 € in cassa → prova-47.3.png
node strumenti/misura.mjs http://127.0.0.1:8844/ foto   # giro di misure a 390/768/1280/1680 (vedi strumenti/cdp.mjs)
```

In simulazione `CLAUDIO_CERVELLO=finto` evita qualsiasi chiamata a pagamento. `CLAUDIO_ADESSO` sposta l'orologio, `CLAUDIO_DATI` / `CLAUDIO_USCITA` / `CLAUDIO_SITO` spostano le cartelle.

## Fermarlo

- Dal telefono: una issue chiamata `Stop`. Vale dal ciclo successivo e crea il file `FERMO`; cancellandolo riparte.
- Subito: su GitHub, Actions → Claudio → «Disable workflow».

## Segreti

Solo `ANTHROPIC_API_KEY` nei secrets del repository, con una chiave dedicata in un workspace con tetto di spesa. Niente chiavi nei file.
