/* Demo mode (?demo): a pretend CHOMPI in the browser, for trying the page without one.
   ?demo&old = a launcher too old for the page; ?demo&failslot=N = writing key N fails;
   &full = the card is full; &slowclear = CLEAR answers late (after the page resent it);
   &lver=1.4.1 = the launcher's version (it can update itself; 1.7.0 and up have 75
   slots on pages of 15); &noself = a launcher
   that can't (1.4.0); &silent = CHOMPI is there but nothing answers (a firmware, or no launcher);
   &card={"01_TAPE.bin":240620,...} = what's on the card. */
(() => {
  const P = new URLSearchParams(location.search);
  /* <html data-mockup>: the published mockup, always pretend */
  const DEMO = P.has("demo") || document.documentElement.hasAttribute("data-mockup");
  if (!DEMO) return;
  window.CHOMPI_DEMO = true;
  const OLD = P.has("old");
  const card = JSON.parse(P.get("card") || "null") || {
    "01_TAPE.bin": 240620, "02_TEMPO.bin": 263624, "03_WAVE.bin": 200664,
    "15_USB_STORAGE.bin": 91392, "HMMM.bin": 150600, "launcher_log.txt": 100 };
  window.__card = card;
  const failSlot = +(P.get("failslot") || 0);
  const FULL = P.has("full"), SLOWCLEAR = P.has("slowclear"), SILENT = P.has("silent");
  const NOSELF = P.has("noself");
  let lver = (P.get("lver") || (NOSELF ? "1.4.0" : "1.6.0")).split(".").map(Number);
  const hasColor = () => lver[0] * 1e6 + lver[1] * 1e3 + lver[2] >= 1006000;
  const slots = () => (lver[0] * 1e6 + lver[1] * 1e3 + lver[2] >= 1007000 ? 75 : 15);
  /* key colours as the launcher keeps them: per file, else one from the name */
  const colors = window.__colors = {};
  function nameColor(f) {
    let n = f.replace(/^\d\d_/, "").replace(/\.bin$/i, "").toUpperCase(), h = 2166136261;
    for (const c of n) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    const hue = h % 1536, s = Math.floor(hue / 256), up = hue % 256, dn = 255 - up;
    return [[255,up,0],[dn,255,0],[0,255,up],[0,dn,255],[up,0,255],[255,0,dn]][s];
  }
  function keys() {
    const S = slots(), k = Array(S).fill(null);
    const bins = Object.keys(card).filter((f) => /\.bin$/i.test(f)).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);
    const rest = [];
    for (const f of bins) { const m = /^(\d\d)_/.exec(f); const n = m ? +m[1] : 0;
      if (n >= 1 && n <= S && !k[n - 1]) k[n - 1] = f; else rest.push(f); }
    let g = 0; for (const f of rest) { while (g < S && k[g]) g++; if (g < S) k[g] = f; }
    return k;
  }
  const g7 = (a) => a.reduceRight((v, b) => v * 128 + b, 0);
  const p7 = (v, n) => Array.from({ length: n }, (_, i) => Math.floor(v / 128 ** i) & 0x7f);
  let up = null;
  const input = { name: "CHOMPI", manufacturer: "x", state: "connected", type: "input", onmidimessage: null, connection: "closed", open: async () => { input.connection = "open"; }, close: async () => { input.connection = "closed"; } };
  const reply = (cmd, p, ms = 3) => setTimeout(() => input.onmidimessage && input.onmidimessage({ data: new Uint8Array([0xF0,0x7D,0x43,0x48,cmd|0x40,...p,0xF7]) }), ms);
  const output = { name: "CHOMPI", manufacturer: "x", state: "connected", type: "output", connection: "closed", open: async () => { output.connection = "open"; }, close: async () => { output.connection = "closed"; },
    send(m) {
      if (SILENT) return;
      const cmd = m[4], b = m.slice(5, -1);
      if (cmd === 1) return reply(1, OLD ? [0,1,...p7(256,4),15] : [0,1,...p7(2048,4),slots(),NOSELF ? 7 : hasColor() ? 63 : (lver[2] >= 4 || lver[1] > 4 ? 31 : 15),...lver]);
      if (cmd === 2) { const n = b[5];
        if (b[4] === 127 && NOSELF) return reply(2,[8]); up = { size: g7(b.slice(0,4)), slot: b[4], name: String.fromCharCode(...b.slice(6,6+n)), got: 0 }; return reply(2,[0]); }
      if (cmd === 3) { const off = g7(b.slice(0,4)); const L = b.length - 4; const raw = L - Math.ceil(L/8); up.got = Math.max(up.got, off+raw); return reply(3,[0,...p7(up.got,4)]); }
      if (cmd === 4) {
        if (OLD && b.length !== 5) return reply(4,[1]);
        if (up.slot === 127) { /* new launcher: reply, restart, come back with the new version */
          setTimeout(() => reply(4,[0]), 300);
          const plug = (on) => { input.state = output.state = on ? "connected" : "disconnected"; access.onstatechange && access.onstatechange({}); };
          setTimeout(() => plug(false), 400);
          setTimeout(() => { lver = window.__newLauncher || [1,4,4]; plug(true); }, 3500);
          return;
        }
        if (up.slot === failSlot) return setTimeout(() => reply(4,[11]), 200);
        if (FULL) return setTimeout(() => reply(4,[12]), 200);
        const pre = String(up.slot).padStart(2,"0") + "_";
        for (const f of Object.keys(card)) if (f.startsWith(pre)) delete card[f];
        card[pre + up.name + ".bin"] = up.size;
        return setTimeout(() => reply(4,[0]), 300);
      }
      if (OLD) return reply(cmd,[1]);
      const legacy = NOSELF || lver[0] * 1e6 + lver[1] * 1e3 + lver[2] < 1004003; /* LIST/CLEAR at 05/06 */
      const LIST = legacy ? 5 : 6, CLEAR = legacy ? 6 : 7;
      if (cmd === 5 && !legacy) { /* RUN: the firmware starts, the launcher is gone */
        if (b[0] < 1 || b[0] > slots() || !keys()[b[0]-1]) return reply(5,[8]);
        reply(5,[0]);
        const plug = (on) => { input.state = output.state = on ? "connected" : "disconnected"; access.onstatechange && access.onstatechange({}); };
        return setTimeout(() => plug(false), 300);
      }
      const rgb7 = (f) => hasColor() ? (f ? colors[f] || nameColor(f) : [0,0,0]).map((c) => c >> 1) : [];
      if (cmd === LIST) { const f = keys()[b[0]-1]; if (!f) return reply(LIST,[0,b[0],0,0,0,0,0,...rgb7(null)]);
        return reply(LIST,[0,b[0],f.length,...[...f].map(c=>c.charCodeAt(0)),...p7(card[f],4),...rgb7(f)]); }
      if (cmd === 8 && hasColor()) { const f = keys()[b[0]-1]; if (!f) return reply(8,[8]);
        if (b[1] || b[2] || b[3]) colors[f] = [b[1],b[2],b[3]].map((c) => (c << 1) | (c >> 6)); else delete colors[f];
        return reply(8,[0,b[0]], 40); }
      if (cmd === CLEAR) { const pre = String(b[0]).padStart(2,"0")+"_"; const on = keys()[b[0]-1];
        const want = b.length > 1 ? String.fromCharCode(...b.slice(2, 2 + b[1])) : null;
        const ms = SLOWCLEAR ? 2300 : 3;
        if (!on || (want !== null && want !== on)) return reply(CLEAR,[0,b[0],0], ms);
        for (const f of Object.keys(card)) if (f.startsWith(pre) || f === on) delete card[f]; return reply(CLEAR,[0,b[0],1], ms); }
      return reply(cmd,[1]);
    } };
  const access = { inputs: new Map([["i", input]]), outputs: new Map([["o", output]]), onstatechange: null };
  window.__ports = { input, output };
  navigator.requestMIDIAccess = async () => access;
  const q = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = async (d) => d.name === "midi" ? { state: "granted" } : q(d);
})();
