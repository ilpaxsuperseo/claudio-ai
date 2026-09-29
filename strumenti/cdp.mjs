/* Client CDP minimo: WebSocket scritto a mano su net, niente dipendenze. */
import net from 'node:net';
import crypto from 'node:crypto';

export function collega(url){
  const u = new URL(url);
  return new Promise((ok, ko)=>{
    const chiave = crypto.randomBytes(16).toString('base64');
    const s = net.connect(Number(u.port), u.hostname, ()=>{
      s.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\n`+
        `Upgrade: websocket\r\nConnection: Upgrade\r\n`+
        `Sec-WebSocket-Key: ${chiave}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let testa = Buffer.alloc(0), pronta = false, coda = Buffer.alloc(0);
    const attesa = new Map(); let id = 0; const eventi = [];
    s.on('data', d=>{
      if(!pronta){
        testa = Buffer.concat([testa, d]);
        const i = testa.indexOf('\r\n\r\n');
        if(i < 0) return;
        if(!/101/.test(testa.slice(0, i).toString())) return ko(new Error('handshake fallito'));
        pronta = true; coda = testa.slice(i + 4);
      } else coda = Buffer.concat([coda, d]);
      let msg;
      while((msg = sfila())) tratta(msg);
    });
    function sfila(){
      if(coda.length < 2) return null;
      const l0 = coda[1] & 127; let off = 2, len = l0;
      if(l0 === 126){ if(coda.length < 4) return null; len = coda.readUInt16BE(2); off = 4; }
      else if(l0 === 127){ if(coda.length < 10) return null; len = Number(coda.readBigUInt64BE(2)); off = 10; }
      if(coda.length < off + len) return null;
      const corpo = coda.slice(off, off + len); coda = coda.slice(off + len);
      return corpo.toString();
    }
    function tratta(t){
      let m; try{ m = JSON.parse(t); }catch(e){ return; }
      if(m.id && attesa.has(m.id)){ const f = attesa.get(m.id); attesa.delete(m.id);
        m.error ? f.ko(new Error(JSON.stringify(m.error))) : f.ok(m.result); }
      else eventi.push(m);
    }
    function manda(testo){
      const p = Buffer.from(testo), mk = crypto.randomBytes(4);
      let t;
      if(p.length < 126) t = Buffer.from([0x81, 0x80 | p.length]);
      else if(p.length < 65536){ t = Buffer.alloc(4); t[0]=0x81; t[1]=0x80|126; t.writeUInt16BE(p.length,2); }
      else { t = Buffer.alloc(10); t[0]=0x81; t[1]=0x80|127; t.writeBigUInt64BE(BigInt(p.length),2); }
      const c = Buffer.allocUnsafe(p.length);
      for(let i=0;i<p.length;i++) c[i] = p[i] ^ mk[i%4];
      s.write(Buffer.concat([t, mk, c]));
    }
    const api = {
      chiama(metodo, params={}){ const n = ++id;
        return new Promise((ok2,ko2)=>{ attesa.set(n,{ok:ok2,ko:ko2}); manda(JSON.stringify({id:n,method:metodo,params})); }); },
      eventi, chiudi(){ s.destroy(); }
    };
    const provaPronta = setInterval(()=>{ if(pronta){ clearInterval(provaPronta); ok(api); } }, 10);
    s.on('error', ko);
  });
}
export const dormi = ms => new Promise(r=>setTimeout(r, ms));
