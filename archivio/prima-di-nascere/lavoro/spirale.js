#!/usr/bin/env node
/**
 * spirale.js — genera un'animazione a spirale (stile "prezzi benzina") da una
 * serie storica CSV con colonne "data,valore".
 *
 * Come funziona:
 *  - ogni riga del CSV diventa un punto lungo una spirale che si allarga
 *    girando in senso orario a partire dal centro;
 *  - l'ANGOLO del punto dipende da quando cade nella serie (il tempo);
 *  - il RAGGIO del punto dipende dal suo valore normalizzato (min→raggio
 *    piccolo, max→raggio grande), come nelle spirali che mostrano prezzi o
 *    temperature nel tempo;
 *  - il colore del tratto va dal verde (valori bassi) al rosso (valori alti);
 *  - l'animazione disegna la spirale un pezzo alla volta e mostra data e
 *    valore del punto raggiunto in quel momento.
 *
 * Non usa librerie esterne: i fotogrammi sono buffer RGB grezzi scritti allo
 * stdin di ffmpeg, che li incolla in un file mp4. L'unica dipendenza di
 * sistema è il binario "ffmpeg".
 *
 * Uso:
 *   node spirale.js <input.csv> <output.mp4> [opzioni]
 *
 * Opzioni (tutte facoltative):
 *   --larghezza=480        larghezza video in pixel
 *   --altezza=480          altezza video in pixel
 *   --fps=24               fotogrammi al secondo
 *   --giri=2.5             quanti giri fa la spirale dal primo all'ultimo punto
 *   --secondi-punto=1.2    secondi di animazione per passare da un punto al successivo
 *   --pausa-finale=1.5     secondi di pausa a spirale completa, a fine video
 *
 * Il CSV può avere o non avere una riga di intestazione: se la seconda
 * colonna della prima riga non è un numero, quella riga viene scartata.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------
// Font a blocchi 3x5: solo i caratteri che ci servono per stampare date
// (es. "2026-01-05") e valori (es. "1.750" o "-3.2") dentro al fotogramma.
// '1' = pixel acceso, '0' = pixel spento. Ogni carattere è alto 5 righe.
// ---------------------------------------------------------------------
const FONT = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '010', '010', '010', '010'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '-': ['000', '000', '111', '000', '000'],
  '.': ['000', '000', '000', '000', '010'],
  ':': ['000', '010', '000', '010', '000'],
  ' ': ['000', '000', '000', '000', '000'],
};

// Disegna una stringa di testo dentro al buffer del fotogramma, carattere
// per carattere, ingrandendo ogni pixel del font di "scala" volte.
function disegnaTesto(buf, larghezza, altezza, x0, y0, testo, scala, colore) {
  let x = x0;
  for (const ch of testo) {
    const glifo = FONT[ch] || FONT[' '];
    for (let riga = 0; riga < glifo.length; riga++) {
      for (let col = 0; col < glifo[riga].length; col++) {
        if (glifo[riga][col] === '1') {
          plottaBlocco(buf, larghezza, altezza, x + col * scala, y0 + riga * scala, scala, colore);
        }
      }
    }
    x += (glifo[0].length + 1) * scala; // spazio tra un carattere e l'altro
  }
  return x - x0; // larghezza totale disegnata, utile per centrare il testo
}

// Calcola quanto sarà larga una stringa una volta disegnata, senza disegnarla.
function larghezzaTesto(testo, scala) {
  let larghezza = 0;
  for (const ch of testo) {
    const glifo = FONT[ch] || FONT[' '];
    larghezza += (glifo[0].length + 1) * scala;
  }
  return larghezza;
}

// Colora un quadratino di lato "lato" con angolo in alto a sinistra (x,y).
function plottaBlocco(buf, larghezza, altezza, x, y, lato, [r, g, b]) {
  for (let dy = 0; dy < lato; dy++) {
    const py = y + dy;
    if (py < 0 || py >= altezza) continue;
    for (let dx = 0; dx < lato; dx++) {
      const px = x + dx;
      if (px < 0 || px >= larghezza) continue;
      const i = (py * larghezza + px) * 3;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }
}

// Legge il CSV "data,valore" e restituisce un array di {data, valore}.
// Scarta righe vuote e, se la prima riga non è numerica in seconda colonna,
// la tratta come intestazione e la ignora.
function leggiCSV(percorso) {
  const testo = fs.readFileSync(percorso, 'utf8');
  const righe = testo.split(/\r?\n/).map((r) => r.trim()).filter((r) => r.length > 0);
  if (righe.length === 0) throw new Error('CSV vuoto: ' + percorso);

  const righeDati = [];
  righe.forEach((riga, indice) => {
    const parti = riga.split(',');
    if (parti.length < 2) return;
    const data = parti[0].trim();
    const valoreGrezzo = parti[1].trim();
    const valore = Number(valoreGrezzo.replace(',', '.'));
    if (Number.isNaN(valore)) {
      if (indice === 0) return; // intestazione, la saltiamo
      throw new Error(`Valore non numerico alla riga ${indice + 1}: "${riga}"`);
    }
    righeDati.push({ data, valore });
  });

  if (righeDati.length < 2) {
    throw new Error('Servono almeno 2 punti dati per disegnare una spirale.');
  }
  return righeDati;
}

// Interpola un colore dal verde (valore basso) al giallo (medio) al rosso
// (valore alto), dato un valore normalizzato "norm" tra 0 e 1.
function coloreDaValore(norm) {
  const n = Math.max(0, Math.min(1, norm));
  if (n < 0.5) {
    const t = n / 0.5;
    return [Math.round(40 + t * (230 - 40)), Math.round(200), Math.round(90 - t * 60)];
  }
  const t = (n - 0.5) / 0.5;
  return [Math.round(230 + t * (235 - 230)), Math.round(200 - t * 170), Math.round(30)];
}

function interpolaLineare(a, b, t) {
  return a + (b - a) * t;
}

// Analizza gli argomenti da riga di comando tipo --chiave=valore.
function leggiOpzioni(argv) {
  const opzioni = {};
  for (const arg of argv) {
    const m = /^--([a-z0-9-]+)=(.+)$/.exec(arg);
    if (m) opzioni[m[1]] = m[2];
  }
  return opzioni;
}

async function main() {
  const [ , , inputCSV, outputMP4, ...resto ] = process.argv;
  if (!inputCSV || !outputMP4) {
    console.error('Uso: node spirale.js <input.csv> <output.mp4> [opzioni]');
    process.exit(1);
  }

  const opz = leggiOpzioni(resto);
  const larghezza = parseInt(opz['larghezza'] || '480', 10);
  const altezza = parseInt(opz['altezza'] || '480', 10);
  const fps = parseInt(opz['fps'] || '24', 10);
  const giri = parseFloat(opz['giri'] || '2.5');
  const secondiPerPunto = parseFloat(opz['secondi-punto'] || '1.2');
  const pausaFinale = parseFloat(opz['pausa-finale'] || '1.5');

  const righe = leggiCSV(path.resolve(inputCSV));
  const n = righe.length;
  const valori = righe.map((r) => r.valore);
  const min = Math.min(...valori);
  const max = Math.max(...valori);
  const scarto = max - min || 1; // evita divisione per zero se tutti i valori sono uguali
  const normalizzati = valori.map((v) => (v - min) / scarto);

  // Geometria della spirale: centro del fotogramma, raggio minimo e massimo.
  const cx = larghezza / 2;
  const cy = altezza / 2;
  const margine = 30;
  const rMin = 12;
  const rMax = Math.min(larghezza, altezza) / 2 - margine;

  // Dato un progresso "s" in [0,1] lungo l'intera serie, calcola angolo,
  // raggio e valore normalizzato interpolato in quel punto della spirale.
  function puntoSpirale(s) {
    const t = s * (n - 1);
    const i0 = Math.min(n - 2, Math.floor(t));
    const frac = t - i0;
    const normVal = interpolaLineare(normalizzati[i0], normalizzati[i0 + 1], frac);
    const angolo = s * giri * 2 * Math.PI - Math.PI / 2;
    const raggio = rMin + normVal * (rMax - rMin);
    return {
      x: cx + raggio * Math.cos(angolo),
      y: cy + raggio * Math.sin(angolo),
      normVal,
    };
  }

  const totaleCampioni = Math.max(1000, Math.round(giri * 900));
  const framesRivelazione = Math.max(1, Math.round(fps * secondiPerPunto * (n - 1)));
  const framesPausa = Math.max(0, Math.round(fps * pausaFinale));
  const framesTotali = framesRivelazione + framesPausa + 1;

  // Sfondo blu notte, riusato come "modello" e copiato ad ogni fotogramma
  // invece di essere ridisegnato pixel per pixel ogni volta.
  const modello = Buffer.alloc(larghezza * altezza * 3);
  for (let i = 0; i < modello.length; i += 3) {
    modello[i] = 8;
    modello[i + 1] = 10;
    modello[i + 2] = 22;
  }

  fs.mkdirSync(path.dirname(path.resolve(outputMP4)), { recursive: true });

  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-s', `${larghezza}x${altezza}`,
    '-r', String(fps),
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    path.resolve(outputMP4),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const erroreFfmpeg = new Promise((_, reject) => {
    ffmpeg.on('error', (err) => reject(new Error('ffmpeg non si avvia: ' + err.message)));
  });

  // Scrive un buffer sullo stdin di ffmpeg aspettando lo svuotamento del
  // buffer interno quando necessario, per non saturare la memoria.
  function scrivi(buf) {
    return new Promise((resolve, reject) => {
      const ok = ffmpeg.stdin.write(buf, (err) => (err ? reject(err) : null));
      if (ok) resolve();
      else ffmpeg.stdin.once('drain', resolve);
    });
  }

  for (let f = 0; f < framesTotali; f++) {
    const sMax = Math.min(1, f / framesRivelazione);
    const frame = Buffer.from(modello); // copia veloce del fondo

    // Disegna la spirale campionandola densamente da s=0 fino a sMax.
    const campioniDaDisegnare = Math.round(totaleCampioni * sMax);
    for (let k = 0; k <= campioniDaDisegnare; k++) {
      const s = k / totaleCampioni;
      const p = puntoSpirale(s);
      const colore = coloreDaValore(p.normVal);
      plottaBlocco(frame, larghezza, altezza, Math.round(p.x) - 1, Math.round(p.y) - 1, 2, colore);
    }

    // Punto luminoso sulla punta della spirale, dove siamo arrivati adesso.
    const punta = puntoSpirale(sMax);
    plottaBlocco(frame, larghezza, altezza, Math.round(punta.x) - 2, Math.round(punta.y) - 2, 5, [255, 255, 255]);

    // Indice del punto dati raggiunto in questo momento, per mostrare
    // la sua data e il suo valore come numeri leggibili.
    const indiceCorrente = Math.min(n - 1, Math.round(sMax * (n - 1)));
    const rigaCorrente = righe[indiceCorrente];
    const scala = 3;
    const testoData = rigaCorrente.data;
    const testoValore = String(rigaCorrente.valore).replace('.', '.');
    disegnaTesto(frame, larghezza, altezza, cx - larghezzaTesto(testoData, scala) / 2, altezza - 46, testoData, scala, [230, 230, 235]);
    disegnaTesto(frame, larghezza, altezza, cx - larghezzaTesto(testoValore, scala) / 2, altezza - 22, testoValore, scala, coloreDaValore(punta.normVal));

    await Promise.race([scrivi(frame), erroreFfmpeg]);
  }

  ffmpeg.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('ffmpeg è uscito con codice ' + code));
    });
  });

  console.log(`Fatto: ${framesTotali} fotogrammi, ${n} punti, video in ${outputMP4}`);
}

main().catch((err) => {
  console.error('Errore:', err.message);
  process.exit(1);
});
