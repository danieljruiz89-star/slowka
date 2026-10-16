(() => {
"use strict";
/* ================= constantes ================= */
const REPO = "danieljruiz89-star/slowka";
const INTERVAL = [1, 3, 7, 14, 30, 90];          // caja 0..5 -> dias hasta el proximo repaso
const SHELF = ["por aprender", "3 días", "1 semana", "2 semanas", "1 mes", "dominada"];
const MAXC = 5;
const META = 60;                                   // XP diarios para cerrar el anillo
const LS = "slowka.v1";
const $ = s => document.querySelector(s);
const view = $("#view");
const N = window.Nativo || null;
const C = window.CURSO || { unidades: [], sonidos: [] };

/* ================= utilidades ================= */
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => ymd(new Date());
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FOLD = { "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z" };
const norm = s => String(s).toLowerCase().replace(/[.,!?¿¡;:«»"„”()\-–—]/g, " ").replace(/\s+/g, " ").trim();
const fold = s => norm(s).replace(/[ąćęłńóśźż]/g, c => FOLD[c]);
const alts = s => String(s).split("/").map(x => x.trim()).filter(Boolean);
const first = s => alts(s)[0] || "";
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue("--" + n).trim();
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function toast(msg, ms = 3200) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms);
}

/* ================= estado (guardado en el movil) ================= */
let S = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { s = null; }
  if (!s) {
    s = { items: {}, racha: 0, mejor: 0, ultimo: "", xp: { d: "", n: 0 }, xpTotal: 0, unidades: {}, sonidos: {}, vel: 0.9, hora: "19:00", bienvenida: false, reto: false, historial: [] };
    const P = window.PREVIO;
    if (P && P.items) {
      for (const [id, o] of Object.entries(P.items)) s.items[id] = { c: o.c | 0, v: !!o.v, p: o.p || today(), a: o.a | 0, f: o.f | 0, fs: 0 };
      s.mejor = P.mejor | 0;
    }
  }
  return s;
}
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
function st(id) { return S.items[id] ||= { c: 0, v: false, p: today(), a: 0, f: 0, fs: 0 }; }

function addXP(n) {
  const t = today();
  if (S.xp.d !== t) S.xp = { d: t, n: 0 };
  const before = S.xp.n;
  S.xp.n += n; S.xpTotal += n;
  if (S.ultimo !== t) {
    S.racha = S.ultimo === addDays(t, -1) ? S.racha + 1 : 1;
    S.mejor = Math.max(S.mejor, S.racha);
    S.ultimo = t;
    try { N?.practicadoHoy(t); } catch (e) {}
  }
  if (before < META && S.xp.n >= META) setTimeout(() => { toast("🎯 ¡Objetivo del día cumplido!"); confetti(70); sfx("win"); }, 400);
  save();
}
const streakNow = () => (S.ultimo === today() || S.ultimo === addDays(today(), -1)) ? S.racha : 0;
const xpToday = () => S.xp.d === today() ? S.xp.n : 0;

/* ================= curso ================= */
const ITEMS = {};
C.unidades.forEach((u, ui) => { u.items = u.items.map(it => ITEMS[it.id] = Object.assign({}, it, { u, ui })); });
const UNI = Object.fromEntries(C.unidades.map(u => [u.id, u]));
const all = () => Object.values(ITEMS);
const due = () => all().filter(w => st(w.id).v && st(w.id).p <= today())
  .sort((a, b) => (st(b.id).fs - st(a.id).fs) || (st(a.id).c - st(b.id).c) || st(a.id).p.localeCompare(st(b.id).p));
const unseen = u => u.items.filter(w => !st(w.id).v);
const uProgress = u => u.items.filter(w => st(w.id).v).length / u.items.length;
const uDone = u => unseen(u).length === 0 && !!S.unidades[u.id]?.dialogo;
const currentUnit = () => C.unidades.find(u => !uDone(u)) || C.unidades[C.unidades.length - 1];
const soundOfDay = () => C.sonidos.length ? C.sonidos[Math.floor(Date.now() / 86400000) % C.sonidos.length] : null;
const hueOf = w => w.u?.color || ["red", "sun", "sky", "rose", "leaf"][hash(w.id) % 5];

/* ================= voz polaca ================= */
let vozEstado = N ? N.voz() : ("speechSynthesis" in window ? "ok" : "falta");
window.alVoz = e => { vozEstado = e; if (screen === "home") renderHome(); };
let webVoice = null;
if (!N && "speechSynthesis" in window) {
  const pv = () => { webVoice = speechSynthesis.getVoices().find(v => /^pl/i.test(v.lang)) || null; };
  pv(); speechSynthesis.onvoiceschanged = pv;
}
let hablaCb = null;
window.alHablar = e => { if (e === "fin" && hablaCb) { const f = hablaCb; hablaCb = null; f(); } };
function speak(text, rate, done) {
  const r = rate || S.vel;
  hablaCb = done || null;
  const t = String(text).replace(/\s*\/\s*/g, ", ");
  if (N) { try { N.hablar(t, r); } catch (e) {} if (vozEstado !== "ok" && done) setTimeout(done, 300); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t); u.lang = "pl-PL"; if (webVoice) u.voice = webVoice; u.rate = r;
    u.onend = () => window.alHablar("fin");
    speechSynthesis.speak(u);
  } catch (e) { done && setTimeout(done, 300); }
}
const sayBtn = (text, label = "Escuchar", cls = "") => `<button class="say ${cls}" data-say="${esc(text)}">🔊 ${label}</button>`;

/* ================= oido: reconocimiento de voz ================= */
let oirCb = null;
window.alOir = ev => { oirCb && oirCb(ev); };
let webRec = null;
const canListen = () => {
  if (N) { try { return N.puedeEscuchar(); } catch (e) { return false; } }
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
};
function listen(hint, cb) {
  oirCb = cb;
  if (N) { N.escuchar(hint || ""); return; }
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) { cb({ tipo: "error", codigo: "sin_servicio" }); return; }
  webRec = new R(); webRec.lang = "pl-PL"; webRec.maxAlternatives = 5; webRec.interimResults = true;
  webRec.onstart = () => cb({ tipo: "listo" });
  webRec.onresult = e => {
    const r = e.results[e.results.length - 1];
    cb({ tipo: r.isFinal ? "final" : "parcial", textos: [...r].map(a => a.transcript), conf: [...r].map(a => a.confidence) });
  };
  webRec.onerror = e => cb({ tipo: "error", codigo: e.error });
  webRec.start();
}
function stopListen() { try { N ? N.pararEscucha() : webRec?.stop(); } catch (e) {} }

function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const simil = (a, b) => { a = norm(a); b = norm(b); if (!a || !b) return 0; return 1 - lev(a, b) / Math.max(a.length, b.length); };
/* Mejor parecido entre lo que habia que decir y lo que el movil ha entendido (hasta 5 hipotesis). */
function judge(target, textos) {
  const tgts = alts(target);
  let best = { s: 0, heard: (textos || [])[0] || "", t: tgts[0] };
  for (const tg of tgts) {
    const words = norm(tg).split(" ").length;
    for (const h of textos || []) {
      const cands = [h];
      const hw = norm(h).split(" ");
      if (hw.length > words) for (let i = 0; i + words <= hw.length; i++) cands.push(hw.slice(i, i + words).join(" "));
      for (const c of cands) { const s = simil(tg, c); if (s > best.s) best = { s, heard: c, t: tg }; }
    }
  }
  const foldGap = best.heard ? (1 - lev(fold(best.t), fold(best.heard)) / Math.max(fold(best.t).length, fold(best.heard).length, 1)) - best.s : 0;
  return { score: Math.round(best.s * 100), heard: best.heard, target: best.t, accents: foldGap > 0.08 };
}
/* Colorea cada letra de la palabra: verde si el movil la ha oido, roja si no. */
function colorLetters(target, heard) {
  const a = norm(target), b = norm(heard || "");
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const ok = new Array(m).fill(false);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) { ok[i - 1] = true; i--; j--; }
    else if (d[i][j] === d[i - 1][j - 1] + 1) { i--; j--; }
    else if (d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  return [...a].map((ch, k) => ch === " " ? " " : `<span class="${ok[k] ? "g" : "r"}">${esc(ch)}</span>`).join("");
}
const ERR = {
  6: "No te he oído. Toca el micro y habla cerca del móvil.", 7: "No he entendido nada claro. Prueba otra vez, un poco más despacio.",
  sin_permiso: "Sin permiso para el micrófono. Actívalo en Ajustes del móvil > Apps > Słówka > Permisos.",
  sin_servicio: "Este móvil no tiene reconocimiento de voz. Instala o actualiza la app «Google».",
  2: "Sin conexión para reconocer la voz. Descarga el polaco sin conexión en los ajustes de voz de Google.",
  "not-allowed": "Sin permiso para el micrófono.", "no-speech": "No te he oído. Prueba otra vez."
};
const MIC_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V20H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.59A6 6 0 0 0 18 11.5Z"/></svg>`;
/* Widget de microfono reutilizable: lo pinta en `el` y llama a done(resultado). */
function micWidget(el, target, done, opts = {}) {
  el.innerHTML = `<div class="mic-wrap">
      <button class="mic" id="micb" aria-label="Hablar">${MIC_SVG}</button>
      <div class="heard" id="heard">${esc(opts.prompt || "Toca y dilo en voz alta")}</div>
    </div>`;
  const btn = el.querySelector("#micb"), heard = el.querySelector("#heard");
  let on = false;
  btn.addEventListener("click", () => {
    if (on) { stopListen(); return; }
    try { N?.callar(); speechSynthesis?.cancel(); } catch (e) {}
    on = true; btn.classList.add("on"); heard.innerHTML = "Te escucho…"; buzz(15);
    listen(first(target), ev => {
      if (ev.tipo === "nivel") { btn.style.setProperty("--lv", (1 + Math.max(0, Math.min(10, ev.v)) / 22).toFixed(2)); return; }
      if (ev.tipo === "parcial" && ev.textos?.length) { heard.innerHTML = `«${esc(ev.textos[0])}»…`; return; }
      if (ev.tipo === "final" || ev.tipo === "error") {
        on = false; btn.classList.remove("on"); btn.style.removeProperty("--lv");
        if (ev.tipo === "error") { heard.textContent = ERR[ev.codigo] || "No he podido escucharte. Prueba otra vez."; sfx("soft"); return; }
        const r = judge(target, ev.textos);
        done(r);
      }
    });
  });
}
const stars = s => s >= 85 ? 3 : s >= 65 ? 2 : s >= 45 ? 1 : 0;
const verdict = s => s >= 85 ? pick(["¡Perfecto!", "¡Świetnie!", "¡Como un nativo!"]) : s >= 65 ? pick(["¡Muy bien!", "¡Bardzo dobrze!"]) : s >= 45 ? "Casi…" : "Otra vez";

/* ================= sonido y vibracion ================= */
let actx = null;
function sfx(kind) {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = { ok: [660, 990], bad: [220, 170], win: [523, 659, 784, 1046], soft: [440], tap: [880] }[kind] || [440];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.09;
      o.type = kind === "bad" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.25);
    });
  } catch (e) {}
}
function buzz(ms) { try { N ? N.vibrar(ms) : navigator.vibrate?.(ms); } catch (e) {} }

/* ================= jardin (cabecera) ================= */
function Meadow(canvas) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, raf = 0, flowers = [];
  const t0 = performance.now();
  function layout() {
    const r = canvas.getBoundingClientRect(); W = r.width; H = r.height;
    canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    flowers = all().filter(w => st(w.id).v).map(w => {
      const h = hash(w.id), depth = ((h >> 10) % 1000) / 1000, stage = st(w.id).c;
      return { x: 18 + (h % 1000) / 1000 * (W - 36), base: H - 14 - depth * 46, depth, stage, size: 5 + stage * 2.6 + depth * 3, phase: (h % 628) / 100, hue: hueOf(w) };
    }).sort((a, b) => a.depth - b.depth);
  }
  const hill = (y, amp, color, seed) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y + Math.sin(x / 90 + seed) * amp + Math.sin(x / 37 + seed * 2) * amp * .4); ctx.lineTo(W, H); ctx.fill(); };
  function flower(f, time) {
    const sway = reduced ? 0 : Math.sin(time / 1400 + f.phase) * (2 + f.depth * 3);
    const top = f.base - (18 + f.stage * 7 + f.depth * 10), cx = f.x + sway, cy = top;
    ctx.strokeStyle = cssVar("leaf"); ctx.lineWidth = 1.6 + f.depth; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(f.x, f.base); ctx.quadraticCurveTo(f.x + sway * .5, (f.base + top) / 2, cx, cy); ctx.stroke();
    ctx.fillStyle = cssVar(f.hue);
    const petals = 5 + Math.min(4, f.stage);
    for (let i = 0; i < petals; i++) { const a = i / petals * 6.283 + (reduced ? 0 : time / 9000); ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * f.size * .55, cy + Math.sin(a) * f.size * .55, f.size * .55, f.size * .32, a, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = f.stage >= 4 ? cssVar("sun") : cssVar("paper"); ctx.beginPath(); ctx.arc(cx, cy, f.size * .3, 0, 6.28); ctx.fill();
  }
  function draw(now) {
    const time = now - t0; ctx.clearRect(0, 0, W, H);
    // Palacio de la Cultura recortado en papel, al fondo
    ctx.fillStyle = cssVar("paper-2");
    const px = W * .8, py = H - 40;
    ctx.fillRect(px - 26, py - 40, 52, 40); ctx.fillRect(px - 16, py - 72, 32, 32); ctx.fillRect(px - 9, py - 100, 18, 30); ctx.fillRect(px - 2, py - 126, 4, 28);
    ctx.fillStyle = cssVar("sun"); ctx.beginPath(); ctx.arc(W * .52, H * .56, 11, 0, 6.28); ctx.fill();
    ctx.fillStyle = cssVar("paper"); ctx.beginPath(); ctx.arc(W * .52 + 5, H * .56 - 3, 9, 0, 6.28); ctx.fill();
    hill(H - 60, 8, cssVar("line"), 4.1);
    flowers.filter(f => f.depth < .5).forEach(f => flower(f, time));
    hill(H - 30, 6, cssVar("paper-2"), 2.2);
    flowers.filter(f => f.depth >= .5).forEach(f => flower(f, time));
    hill(H - 8, 4, cssVar("line"), 7.7);
    raf = reduced ? 0 : requestAnimationFrame(draw);
  }
  return { start() { cancelAnimationFrame(raf); layout(); raf = requestAnimationFrame(draw); }, stop() { cancelAnimationFrame(raf); }, relayout: layout };
}
let meadow = null;

/* ================= navegacion ================= */
let screen = "home", back = null;
function go(fn, backTo) { meadow?.stop(); meadow = null; stopListen(); try { N?.callar(); } catch (e) {} back = backTo || null; window.scrollTo(0, 0); fn(); }
window.atras = () => { if (screen === "home") return false; if (screen === "lesson" || screen === "dialog") { endLessonEarly(); return true; } (back || renderHome)(); return true; };
window.alVolver = () => { if (screen === "home") renderHome(); checkUpdate(); };

/* ================= INICIO ================= */
function renderHome() {
  if (!S.bienvenida) return renderWelcome();
  go(() => {}); screen = "home";
  try { N?.pantallaEncendida(false); } catch (e) {}
  const d = due(), u = currentUnit(), fresh = unseen(u), snd = soundOfDay();
  const xp = xpToday(), pct = Math.min(1, xp / META), streak = streakNow();
  const seen = all().filter(w => st(w.id).v).length, master = all().filter(w => st(w.id).c >= 4).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Dzień dobry" : hour < 18 ? "Cześć" : "Dobry wieczór";
  const R = 40, CIRC = 2 * Math.PI * R;
  const planLines = [];
  if (d.length) planLines.push(`🔁 ${Math.min(d.length, 10)} repasos`);
  if (fresh.length) planLines.push(`✨ ${Math.min(fresh.length, 5)} nuevas en <b>${esc(u.estacion)}</b>`);
  else if (!S.unidades[u.id]?.dialogo) planLines.push(`💬 Diálogo de <b>${esc(u.estacion)}</b>`);
  if (snd && canListen()) planLines.push(`🎙️ Sonido del día: <b>${esc(snd.grafia)}</b>`);

  const lines = ["M1", "M2"].map(L => ({ L, us: C.unidades.filter(x => (x.linea || "M1") === L) })).filter(g => g.us.length);
  view.innerHTML = `
  <div class="spread"><span class="pill ${streak ? "sun" : ""}">🔥 ${streak} ${streak === 1 ? "día" : "días"}</span><span class="pill leaf">🌼 ${master} dominadas</span><button class="link" id="ajustes" aria-label="Ajustes">⚙️ Ajustes</button></div>
  <div class="hero"><canvas id="meadow" aria-hidden="true"></canvas>
    <div class="over"><h1>${greet}, Daniel.<small>${seen} palabras en tu jardín</small></h1></div></div>
  ${vozEstado === "falta" ? `<div class="card"><b>Falta la voz polaca en este móvil</b><p class="note">Sin ella no oirás las palabras. Abre los ajustes de voz, elige «Polski» y descárgala (funciona sin internet).</p><button class="go sky" id="voz">Abrir ajustes de voz</button></div>` : ""}
  <div class="card">
    <div class="today">
      <div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--paper-2)" stroke-width="12"/><circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--sun)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - pct)}"/></svg><b>${xp}<small>de ${META} XP</small></b></div>
      <div style="display:grid;gap:8px"><span class="label">Hoy</span><ul>${planLines.map(l => `<li>${l}</li>`).join("") || "<li>Todo al día. Explora otra parada.</li>"}</ul></div>
    </div>
    <button class="go" id="start">${xp >= META ? "Seguir practicando" : "Empezar"}</button>
  </div>

  ${snd ? `<div class="card labcard"><div class="spread"><span class="label">Laboratorio de pronunciación</span><span class="note">${Object.keys(S.sonidos).length}/${C.sonidos.length}</span></div>
    <div class="sounds">${C.sonidos.map(s => `<button class="sound ${S.sonidos[s.id]?.best >= 65 ? "ok" : ""}" data-snd="${esc(s.id)}">${esc(s.grafia)}<small>${S.sonidos[s.id]?.best != null ? "★".repeat(stars(S.sonidos[s.id].best)) || "·" : "nuevo"}</small></button>`).join("")}</div></div>` : ""}

  <div class="metro">
    ${lines.map(g => `<div class="lname"><i style="background:var(--${g.L === "M1" ? "m1" : "m2"})">${g.L}</i>Línea ${g.L === "M1" ? "1" : "2"} del metro</div>
      ${g.us.map((x, k) => { const p = uProgress(x), done = uDone(x); return `
      <button class="stop ${done ? "done" : ""} ${x === u ? "now" : ""} ${k === 0 ? "first" : ""} ${k === g.us.length - 1 ? "last" : ""}" style="--lc:var(--${g.L === "M1" ? "m1" : "m2"})" data-unit="${esc(x.id)}">
        <span class="dot">${done ? "🌼" : esc(x.emoji)}</span>
        <span class="st"><b>${esc(x.estacion)}</b><span><em>${esc(x.titulo)}</em> · ${esc(x.titulo_pl)}</span></span>
        <span class="bar"><i style="width:${Math.round(p * 100)}%"></i></span>
      </button>`; }).join("")}`).join("")}
  </div>
  <p class="note" style="text-align:center">Toca cualquier parada para ir allí directamente.</p>`;

  $("#start").addEventListener("click", startToday);
  $("#ajustes").addEventListener("click", () => go(renderSettings, renderHome));
  $("#voz")?.addEventListener("click", () => N?.ajustesVoz());
  view.querySelectorAll("[data-unit]").forEach(b => b.addEventListener("click", () => go(() => renderUnit(UNI[b.dataset.unit]), renderHome)));
  view.querySelectorAll("[data-snd]").forEach(b => b.addEventListener("click", () => go(() => renderSound(C.sonidos.find(s => s.id === b.dataset.snd)), renderHome)));
  meadow = Meadow($("#meadow")); meadow.start();
}

/* ================= BIENVENIDA ================= */
function renderWelcome() {
  screen = "welcome";
  let paso = 0;
  const paint = () => {
    if (paso === 0) {
      view.innerHTML = `<div class="step" style="text-align:center">
        <span class="label">Tu curso nuevo</span>
        <div class="pict">🚇</div>
        <h1 style="font-size:30px">Varsovia, parada a parada</h1>
        <p>Cada estación del metro es una situación de tu vida: la caja del súper, el médico, la oficina, tus vecinos… En cada una aprendes palabras, las <b>dices en voz alta</b> y el móvil te dice si te ha entendido.</p>
        <p class="note">Ya traigo tus 30 palabras de antes, con su progreso.</p>
        <button class="go" id="nx">Vamos</button></div>`;
    } else if (paso === 1) {
      view.innerHTML = `<div class="step" style="text-align:center">
        <span class="label">Prueba el micrófono</span>
        <div class="word"><div class="pl">Dzień dobry</div><div class="es">Buenos días</div>${sayBtn("Dzień dobry")}</div>
        <div id="mic"></div><div id="res"></div>
        <button class="go ghost" id="nx">Saltar</button></div>`;
      if (canListen()) micWidget($("#mic"), "Dzień dobry", r => {
        $("#res").innerHTML = `<div class="letters">${colorLetters(r.target, r.heard)}</div><div class="stars">${"★".repeat(stars(r.score))}${"☆".repeat(3 - stars(r.score))}</div><p class="note">${r.score >= 65 ? "¡Te entiendo perfectamente! Así funcionan los ejercicios de pronunciación." : "Las letras en rojo son las que no he oído claras. Prueba otra vez."}</p>`;
        $("#nx").textContent = "Seguir"; $("#nx").className = "go"; if (r.score >= 65) { sfx("ok"); buzz(20); }
      }, { prompt: "Toca el micro y di «dzień dobry»" });
      else $("#mic").innerHTML = `<p class="note">Este móvil no tiene reconocimiento de voz. Instala o actualiza la app «Google» para usar la pronunciación. El resto del curso funciona igual.</p>`;
    } else {
      view.innerHTML = `<div class="step"><span class="label">Un aviso al día</span>
        <h2>¿A qué hora te recuerdo practicar?</h2><p class="note">Solo si ese día aún no has practicado. Cinco minutos bastan para no perder la racha.</p>
        <div class="set"><div class="row">${["08:00", "13:00", "19:00", "21:00"].map(h => `<button data-h="${h}" aria-pressed="${S.hora === h}">${h}</button>`).join("")}<button data-h="" aria-pressed="${S.hora === ""}">Sin aviso</button></div></div>
        <button class="go" id="nx">Empezar el curso</button></div>`;
      view.querySelectorAll("[data-h]").forEach(b => b.addEventListener("click", () => { S.hora = b.dataset.h; paint(); }));
    }
    view.querySelector("[data-say]")?.addEventListener("click", () => {});
    $("#nx").addEventListener("click", () => {
      if (paso < 2) { paso++; paint(); return; }
      S.bienvenida = true; save();
      try { N?.recordatorio(S.hora); } catch (e) {}
      renderHome();
    });
  };
  paint();
}

/* ================= PARADA (unidad) ================= */
function renderUnit(u) {
  screen = "unit"; back = renderHome;
  const L = u.linea === "M2" ? "m2" : "m1";
  const fresh = unseen(u), dDue = u.items.filter(w => st(w.id).v && st(w.id).p <= today());
  view.innerHTML = `
  <div class="top"><button class="x" id="back" aria-label="Volver">←</button><span class="label">Línea ${u.linea === "M2" ? 2 : 1} · ${esc(u.titulo_pl)}</span></div>
  <div class="card" style="border-color:var(--${L});background:radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--${L}) 25%, transparent), transparent 60%), var(--paper)">
    <div class="spread"><span class="pill" style="color:var(--${L})">Ⓜ ${esc(u.estacion)}</span><span style="font-size:40px">${esc(u.emoji)}</span></div>
    <h1 style="font-size:32px">${esc(u.titulo)}</h1>
    <p>${esc(u.intro)}</p>
    <button class="go" id="learn" ${fresh.length || dDue.length ? "" : "disabled"}>${fresh.length ? `Aprender ${Math.min(5, fresh.length)} palabras nuevas` : dDue.length ? `Repasar ${dDue.length}` : "Todo aprendido aquí"}</button>
    <div class="row"><button class="go sky" id="dlg" style="flex:1">💬 Diálogo${S.unidades[u.id]?.dialogo ? " ✓" : ""}</button><button class="go ghost" id="tiles" style="flex:1">🧩 Frases</button></div>
    ${fresh.length >= 3 ? `<button class="link" id="triage">⚡ Ya sé muchas de estas: clasificarlas rápido</button>` : ""}
  </div>
  <div class="section" style="display:grid;gap:8px">
    <span class="label">Palabras de esta parada</span>
    <div class="results">${u.items.map(w => { const s = st(w.id); return `<button class="res" data-say="${esc(first(w.pl))}" style="text-align:left">
      <span class="e">${esc(w.emoji)}</span><span class="t"><b>${esc(w.pl)}</b><span>${esc(w.es)}</span></span>
      <span class="m ${s.v ? "up" : ""}">${s.v ? "●".repeat(Math.max(1, s.c)) : "nueva"}</span></button>`; }).join("")}</div>
  </div>`;
  $("#back").addEventListener("click", () => renderHome());
  $("#learn").addEventListener("click", () => startLesson(buildSteps(fresh.slice(0, 5), dDue.slice(0, 8), u), () => go(() => renderUnit(u), renderHome)));
  $("#dlg").addEventListener("click", () => go(() => renderDialog(u), () => go(() => renderUnit(u), renderHome)));
  $("#tiles").addEventListener("click", () => startLesson(shuffle(u.frases || []).map(f => ({ k: "tiles", f, u, graded: false })), () => go(() => renderUnit(u), renderHome)));
  $("#triage")?.addEventListener("click", () => go(() => renderTriage(u), () => go(() => renderUnit(u), renderHome)));
}

/* ================= LECCION ================= */
let L = null;
function chooseKind(w) {
  const c = st(w.id).c, mic = canListen();
  let pool;
  if (c <= 1) pool = ["plEs", "oir", "esPl", mic ? "di" : "plEs"];
  else if (c === 2) pool = ["esPl", "oir", mic ? "di" : "esPl", "escribe"];
  else pool = ["escribe", mic ? "di" : "oir", "oir", "escribe"];
  return pick(pool);
}
function buildSteps(fresh, reviews, u) {
  const steps = [];
  const rev = shuffle(reviews), half = Math.ceil(rev.length / 2);
  rev.slice(0, half).forEach(w => steps.push({ k: chooseKind(w), w, graded: true }));
  for (let i = 0; i < fresh.length; i += 3) {
    const g = fresh.slice(i, i + 3);
    g.forEach(w => { steps.push({ k: "intro", w }); if (canListen()) steps.push({ k: "di", w, graded: false, soft: true }); });
    shuffle(g).forEach(w => steps.push({ k: pick(["plEs", "oir"]), w, graded: true }));
  }
  rev.slice(half).forEach(w => steps.push({ k: chooseKind(w), w, graded: true }));
  const fr = u?.frases?.length ? pick(u.frases) : null;
  if (fr && fresh.length) steps.push({ k: "tiles", f: fr, u, graded: false });
  return steps;
}
function startToday() {
  const u = currentUnit(), d = due().slice(0, 10), fresh = unseen(u).slice(0, 5);
  let steps = buildSteps(fresh, d, u);
  const snd = soundOfDay();
  if (snd && canListen()) shuffle(snd.ejemplos).slice(0, 2).forEach(e => steps.push({ k: "diSnd", e, snd }));
  if (!steps.length) {
    if (!S.unidades[u.id]?.dialogo) return go(() => renderDialog(u), renderHome);
    const nxt = C.unidades.find(x => unseen(x).length);
    if (nxt) steps = buildSteps(unseen(nxt).slice(0, 5), [], nxt);
    else steps = buildSteps([], shuffle(all().filter(w => st(w.id).v)).slice(0, 10), null);
  }
  startLesson(steps, renderHome);
}
function startLesson(steps, onExit) {
  if (!steps.length) return;
  go(() => {}); screen = "lesson";
  try { N?.pantallaEncendida(true); } catch (e) {}
  L = { steps, i: 0, total: steps.length, res: {}, xp: 0, onExit, known: [] };
  renderStep();
}
function endLessonEarly() { const ex = L?.onExit || renderHome; L = null; ex(); }
function distract(w, field, n = 3) {
  const same = shuffle(w.u.items.filter(x => x.id !== w.id)), other = shuffle(all().filter(x => x.u !== w.u));
  const out = [], target = fold(first(w[field]));
  for (const x of [...same, ...other]) { if (out.length >= n) break; const v = first(x[field]); if (v && !out.includes(v) && fold(v) !== target) out.push(v); }
  return out;
}
function pict(w, emoji) {
  const c = `var(--${hueOf(w)})`;
  return `<div class="pict" style="color:${c}"><svg viewBox="-50 -50 100 100" aria-hidden="true">${[...Array(12)].map((_, i) => `<ellipse cx="0" cy="-44" rx="4" ry="7" fill="${c}" opacity=".5" transform="rotate(${i * 30})"/>`).join("")}</svg>${esc(emoji ?? w.emoji ?? "❔")}</div>`;
}
function renderStep() {
  if (!L) return;
  if (L.i >= L.steps.length) return finishLesson();
  const s = L.steps[L.i], w = s.w;
  const pct = Math.round(100 * L.i / L.total);
  const head = `<div class="top"><button class="x" id="quit" aria-label="Salir">✕</button><div class="progress"><i style="width:${pct}%"></i></div><span class="xp">+${L.xp}</span></div>`;
  const retry = s.retry ? `<span class="pill red">otra vez</span>` : "";
  let body = "";
  if (s.k === "intro") {
    body = `<div class="step"><div class="spread"><span class="label">Palabra nueva</span><span class="pill">Ⓜ ${esc(w.u.estacion)}</span></div>
      ${pict(w)}<div class="word"><div class="pl">${esc(w.pl)}</div><div class="es">${esc(w.es)}</div>
      <div class="row" style="justify-content:center">${sayBtn(first(w.pl))}<button class="say" data-slow="${esc(first(w.pl))}">🐢 Despacio</button></div></div>
      ${w.ej_pl ? `<button class="example" data-say="${esc(w.ej_pl)}"><b>${esc(w.ej_pl)}</b><span>${esc(w.ej_es)}</span></button>` : ""}
      ${w.nota ? `<p class="tip">💡 ${esc(w.nota)}</p>` : ""}
      <div class="row"><button class="go ghost" id="known" style="flex:1">✓ Ya la sé</button><button class="next" id="next" style="flex:1.3">Aprenderla</button></div></div>`;
    setTimeout(() => speak(first(w.pl)), 250);
  } else if (s.k === "plEs" || s.k === "esPl" || s.k === "oir") {
    const f = s.k === "esPl" ? "pl" : "es";
    s.opts ||= shuffle([first(w[f]), ...distract(w, f)]);
    body = `<div class="step"><div class="spread"><span class="label">${s.k === "plEs" ? "¿Qué significa?" : s.k === "oir" ? "Escucha y elige" : "¿Cómo se dice en polaco?"}</span>${retry}</div>
      ${s.k === "oir" ? pict(w, "👂") : pict(w)}
      <div class="word">${s.k === "plEs" ? `<div class="pl">${esc(w.pl)}</div>${sayBtn(first(w.pl))}` : s.k === "oir" ? `<div class="row" style="justify-content:center">${sayBtn(first(w.pl), "Escuchar", "big")}<button class="say" data-slow="${esc(first(w.pl))}">🐢</button></div>` : `<div class="pl">${esc(w.es)}</div>`}</div>
      <div class="opts">${s.opts.map((o, k) => `<button class="opt" data-opt="${k}">${esc(o)}</button>`).join("")}</div>
      <div class="fb" id="fb"></div></div>`;
    if (s.k !== "esPl") setTimeout(() => speak(first(w.pl)), 250);
  } else if (s.k === "escribe") {
    const t = first(w.pl);
    body = `<div class="step"><div class="spread"><span class="label">Escríbelo en polaco</span>${retry}</div>${pict(w)}
      <div class="word"><div class="pl">${esc(w.es)}</div><div class="hint">${st(w.id).fs >= 2 ? "Empieza por <b>" + esc(t.slice(0, 2)) + "…</b>" : t.length + " letras"}</div></div>
      <form id="tf" style="display:grid;gap:10px" autocomplete="off"><input class="typein" id="typein" placeholder="Escribe aquí…" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Respuesta">
      <div class="keys">${"ąćęłńóśźż".split("").map(c => `<button type="button" data-key="${c}">${c}</button>`).join("")}</div>
      <button class="go" type="submit">Comprobar</button></form><div class="fb" id="fb"></div></div>`;
  } else if (s.k === "di" || s.k === "diSnd") {
    const pl = s.k === "di" ? first(w.pl) : s.e.pl, es = s.k === "di" ? w.es : s.e.es;
    s.tries ||= 0;
    body = `<div class="step"><div class="spread"><span class="label">${s.k === "diSnd" ? "Sonido del día · " + esc(s.snd.grafia) : "Dilo en voz alta"}</span>${retry}</div>
      ${s.k === "di" ? pict(w) : ""}
      <div class="word"><div class="pl" id="tgt">${esc(pl)}</div><div class="es">${esc(es)}</div>
      <div class="row" style="justify-content:center">${sayBtn(pl, "Modelo")}<button class="say" data-slow="${esc(pl)}">🐢 Despacio</button></div></div>
      <div id="mic"></div><div class="fb" id="fb"></div>
      <button class="link" id="skipmic" style="justify-self:center">Ahora no puedo hablar</button></div>`;
  } else if (s.k === "tiles") {
    const words = s.f.pl.split(" ");
    s.bank ||= shuffle(words.map((t, i) => ({ t, i })));
    s.ans ||= [];
    body = `<div class="step"><span class="label">Construye la frase</span>
      <div class="word"><div class="es" style="font-size:20px;color:var(--ink)">${esc(s.f.es)}</div></div>
      <div class="answer" id="ans">${s.ans.map((b, k) => `<button class="tile" data-a="${k}">${esc(b.t)}</button>`).join("")}</div>
      <div class="bank">${s.bank.map((b, k) => `<button class="tile ${s.ans.includes(b) ? "used" : ""}" data-b="${k}">${esc(b.t)}</button>`).join("")}</div>
      <button class="go" id="chk" ${s.ans.length === words.length ? "" : "disabled"}>Comprobar</button><div class="fb" id="fb"></div></div>`;
  }
  view.innerHTML = `<div style="display:grid;gap:16px">${head}${body}</div>`;
  $("#quit").addEventListener("click", endLessonEarly);
  $("#next")?.addEventListener("click", advance);
  $("#known")?.addEventListener("click", () => { markKnown(w); dropWord(w); advance(); });
  if (s.opts) view.querySelectorAll("[data-opt]").forEach(b => b.addEventListener("click", () => checkOpt(s, +b.dataset.opt)));
  if (s.k === "escribe") {
    const inp = $("#typein"); setTimeout(() => inp.focus(), 50);
    view.querySelectorAll("[data-key]").forEach(b => b.addEventListener("click", () => { inp.value += b.dataset.key; inp.focus(); }));
    $("#tf").addEventListener("submit", e => { e.preventDefault(); if (inp.value.trim()) checkType(s, inp.value); });
  }
  if (s.k === "di" || s.k === "diSnd") {
    const target = s.k === "di" ? w.pl : s.e.pl;
    micWidget($("#mic"), target, r => onSpoken(s, r));
    $("#skipmic").addEventListener("click", () => { if (s.k === "di" && s.graded) { s.k = "esPl"; renderStep(); } else advance(); });
    if (s.k === "di") setTimeout(() => speak(first(target)), 250);
  }
  if (s.k === "tiles") {
    const words = s.f.pl.split(" ");
    view.querySelectorAll("[data-b]").forEach(b => b.addEventListener("click", () => { const t = s.bank[+b.dataset.b]; if (!s.ans.includes(t)) { s.ans.push(t); sfx("tap"); renderStep(); } }));
    view.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => { s.ans.splice(+b.dataset.a, 1); renderStep(); }));
    $("#chk").addEventListener("click", () => {
      const said = s.ans.map(b => b.t).join(" ");
      const ok = norm(said) === norm(s.f.pl);
      view.querySelectorAll(".tile").forEach(t => t.disabled = true);
      if (ok) gain(10);
      feedback(ok, null, `<div class="example"><b>${esc(s.f.pl)}</b><span>${esc(s.f.es)}</span></div>`);
      speak(s.f.pl);
      if (!ok && !s.retry) L.steps.push({ k: "tiles", f: s.f, u: s.u, retry: true });
    });
  }
}
function gain(n) { L.xp += n; addXP(n); const x = view.querySelector(".xp"); if (x) x.textContent = "+" + L.xp; }
function feedback(ok, w, extra = "") {
  sfx(ok ? "ok" : "bad"); buzz(ok ? 18 : 60);
  $("#fb").innerHTML = `<div class="feedback ${ok ? "good" : "bad"}">
    <h3>${ok ? pick(["¡Bien!", "¡Świetnie!", "¡Eso es!", "¡Brawo!", "¡Dokładnie!"]) : pick(["Casi…", "Todavía no", "Mira bien:"])}</h3>
    ${w ? `<div><b>${esc(w.pl)}</b> = ${esc(w.es)} ${sayBtn(first(w.pl), "")}</div>` : ""}${extra}
    ${w && !ok && w.nota ? `<p class="tip">💡 ${esc(w.nota)}</p>` : ""}
    <button class="next" id="next">Seguir</button></div>`;
  $("#next").addEventListener("click", advance);
  $("#fb").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function grade(s, w, ok) {
  if (!s.graded) return;
  if (L.res[w.id]) { if (ok) L.res[w.id].retryOk = true; return; }
  const o = st(w.id), before = o.c;
  o.c = ok ? Math.min(before + 1, MAXC) : (before >= 4 ? 2 : 0);
  o.v = true; o.p = addDays(today(), INTERVAL[o.c]); o.a += ok ? 1 : 0; o.f += ok ? 0 : 1; o.fs = ok ? 0 : o.fs + 1;
  L.res[w.id] = { ok, before, after: o.c, w };
  if (ok) gain(10);
  if (!ok) L.steps.push({ k: s.k === "escribe" ? "esPl" : s.k === "di" ? "di" : "oir", w, graded: true, retry: true });
  save();
}
function checkOpt(s, k) {
  if (s.done) return; s.done = true;
  const w = s.w, target = first(w[s.k === "esPl" ? "pl" : "es"]), ok = s.opts[k] === target;
  view.querySelectorAll("[data-opt]").forEach(b => { b.disabled = true; if (s.opts[+b.dataset.opt] === target) b.classList.add("ok"); else if (+b.dataset.opt === k) b.classList.add("bad"); });
  grade(s, w, ok); feedback(ok, w); speak(first(w.pl));
}
function checkType(s, val) {
  if (s.done) return; s.done = true;
  const w = s.w, ex = alts(w.pl).some(o => norm(o) === norm(val)), loose = !ex && alts(w.pl).some(o => fold(o) === fold(val)), ok = ex || loose;
  $("#typein").disabled = true;
  grade(s, w, ok);
  feedback(ok, w, loose ? `<p class="tip" style="color:var(--ink)">Vale, pero con las letras polacas: <b>${esc(w.pl)}</b>.</p>` : !ok ? `<p class="tip" style="color:var(--ink)">Escribiste <s>${esc(val)}</s></p>` : "");
  speak(first(w.pl));
}
function onSpoken(s, r) {
  s.tries = (s.tries || 0) + 1;
  const ok = r.score >= 65;
  const w = s.w;
  if (w) { const o = st(w.id); o.pr = Math.max(o.pr || 0, r.score); }
  if (s.k === "diSnd") { const o = S.sonidos[s.snd.id] ||= {}; o.best = Math.max(o.best || 0, r.score); }
  $("#tgt").innerHTML = colorLetters(r.target, r.heard);
  $("#tgt").classList.add("letters");
  const canRetry = !ok && s.tries < 3;
  if (ok || !canRetry) {
    if (s.graded && w) grade(s, w, ok); else if (ok) gain(r.score >= 85 ? 15 : 10);
    if (ok && s.graded && r.score >= 85) gain(5);
  }
  save();
  sfx(ok ? (r.score >= 85 ? "win" : "ok") : "bad"); buzz(ok ? 25 : 60);
  if (r.score >= 85) confetti(30);
  $("#fb").innerHTML = `<div class="feedback ${ok ? "good" : "bad"}">
    <div class="spread"><h3>${verdict(r.score)}</h3><span class="stars">${"★".repeat(stars(r.score))}${"☆".repeat(3 - stars(r.score))}</span></div>
    <p class="tip" style="color:var(--ink)">He entendido: <b>«${esc(r.heard || "…")}»</b></p>
    ${r.accents ? `<p class="tip">Casi todo bien. Fíjate en las letras rojas: ahí el sonido polaco es distinto del español.</p>` : !ok ? `<p class="tip">Escucha el modelo despacio y repite. Las letras en rojo son las que no se han oído.</p>` : ""}
    ${canRetry ? `<div class="row"><button class="go ghost" id="again" style="flex:1">Otra vez</button><button class="next" id="next" style="flex:1">Seguir</button></div>` : `<button class="next" id="next">Seguir</button>`}
  </div>`;
  $("#next").addEventListener("click", advance);
  $("#again")?.addEventListener("click", () => { $("#fb").innerHTML = ""; speak(first(r.target), S.vel * 0.8); });
}
function advance() { if (!L) return; L.i++; L.total = Math.max(L.total, L.steps.length); renderStep(); }
function markKnown(w) { const o = st(w.id); Object.assign(o, { c: 4, v: true, p: addDays(today(), INTERVAL[4]), fs: 0, sabida: true }); L?.known.push(w); save(); }
function dropWord(w) { L.steps = L.steps.filter((s, k) => k <= L.i || s.w?.id !== w.id); L.total = Math.max(L.i + 1, L.steps.length); }
function finishLesson() {
  const res = Object.values(L.res), ok = res.filter(r => r.ok).length;
  const exit = L.onExit;
  S.historial = (S.historial || []).concat([{ d: today(), a: ok, f: res.length - ok, xp: L.xp }]).slice(-60);
  if (!res.length && L.xp === 0) addXP(1);
  save();
  try { N?.pantallaEncendida(false); } catch (e) {}
  screen = "end"; back = () => { L = null; exit(); };
  view.innerHTML = `<div class="step" style="text-align:center">
    <span class="label">Lección terminada</span>
    <div class="big">+${L.xp} XP</div>
    <h2>${res.length && ok === res.length ? pick(["¡Perfecto, Daniel!", "¡Rewelacja!"]) : "¡Buen trabajo!"}</h2>
    <div class="row" style="justify-content:center"><span class="pill sun">🔥 ${streakNow()} ${streakNow() === 1 ? "día" : "días"}</span><span class="pill">🎯 ${xpToday()}/${META} hoy</span>${L.known.length ? `<span class="pill sky">✓ ${L.known.length} ya sabidas</span>` : ""}</div>
    ${res.length ? `<div class="results" style="text-align:left">${res.map(r => `<div class="res"><span class="e">${esc(r.w.emoji)}</span><span class="t"><b>${esc(r.w.pl)}</b><span>${esc(r.w.es)}</span></span><span class="m ${r.ok ? "up" : "down"}">${r.ok ? "↑ " + SHELF[r.after] : "↺ mañana"}</span></div>`).join("")}</div>` : ""}
    <button class="go" id="home">Seguir</button></div>`;
  $("#home").addEventListener("click", () => { L = null; exit(); });
  sfx("win"); confetti();
}

/* ---- clasificar rapido: deslizar ---- */
function renderTriage(u) {
  screen = "triage"; back = () => renderUnit(u);
  const q = shuffle(unseen(u)); let i = 0, shown = false; const known = [];
  const paint = () => {
    if (i >= q.length) {
      view.innerHTML = `<div class="step" style="text-align:center"><span class="label">Listo</span><div class="big">${known.length}</div><h2>${known.length === 1 ? "palabra ya sabida" : "palabras ya sabidas"}</h2><p class="note">Esas vuelven dentro de un mes, para comprobarlo. Las demás te las enseño en las lecciones.</p><button class="go" id="ok">Volver a ${esc(u.estacion)}</button></div>`;
      $("#ok").addEventListener("click", () => renderUnit(u)); if (known.length) confetti(40); return;
    }
    const w = q[i];
    view.innerHTML = `<div class="top"><button class="x" id="q">✕</button><div class="progress"><i style="width:${Math.round(100 * i / q.length)}%"></i></div><span class="xp">${i + 1}/${q.length}</span></div>
      <div class="step" id="card"><span class="label">¿La conoces?</span>${pict(w)}
      <div class="word"><div class="pl">${esc(w.pl)}</div>${shown ? `<div class="es">${esc(w.es)}</div>` : ""}${sayBtn(first(w.pl))}</div>
      ${shown ? `<div class="row"><button class="go ghost" id="no" style="flex:1">Aún no</button><button class="go leaf" id="yes" style="flex:1">✓ La sabía</button></div><div class="spread note"><span>← desliza: aún no</span><span>la sabía →</span></div>`
        : `<button class="go sky" id="show">Ver el significado</button>`}</div>`;
    $("#q").addEventListener("click", () => renderUnit(u));
    $("#show")?.addEventListener("click", () => { shown = true; paint(); });
    const yes = () => { const o = st(w.id); Object.assign(o, { c: 4, v: true, p: addDays(today(), INTERVAL[4]), sabida: true }); save(); known.push(w); i++; shown = false; buzz(15); paint(); };
    const no = () => { i++; shown = false; paint(); };
    $("#yes")?.addEventListener("click", yes); $("#no")?.addEventListener("click", no);
    if (shown) {
      const card = $("#card"); let x0 = null, dx = 0;
      card.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; dx = 0; card.style.transition = "none"; }, { passive: true });
      card.addEventListener("touchmove", e => { if (x0 == null) return; dx = e.touches[0].clientX - x0; card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`; card.style.boxShadow = dx > 40 ? "0 0 0 3px var(--leaf)" : dx < -40 ? "0 0 0 3px var(--red)" : ""; }, { passive: true });
      card.addEventListener("touchend", () => { x0 = null; if (dx > 80) yes(); else if (dx < -80) no(); else { card.style.transform = ""; card.style.boxShadow = ""; } });
    } else setTimeout(() => speak(first(w.pl)), 200);
  };
  paint();
}

/* ================= DIALOGO (juego de rol) ================= */
function renderDialog(u) {
  screen = "dialog";
  try { N?.pantallaEncendida(true); } catch (e) {}
  const D = u.dialogo, lines = D.lineas;
  let i = 0; const scores = [];
  const exitTo = () => { try { N?.pantallaEncendida(false); } catch (e) {} renderUnit(u); };
  L = { onExit: exitTo };
  const paint = () => {
    const shown = lines.slice(0, i + 1);
    view.innerHTML = `<div class="top"><button class="x" id="q">✕</button><div class="progress"><i style="width:${Math.round(100 * i / lines.length)}%"></i></div>
      <button class="link" id="reto">${S.reto ? "🙈 Reto" : "👀 Ver polaco"}</button></div>
      <div class="card"><span class="label">Ⓜ ${esc(u.estacion)} · ${esc(D.titulo)}</span>
      <div class="chat">${shown.map((l, k) => {
        const tu = l.quien === "tu", cur = k === i, sc = scores[k];
        const hide = tu && cur && S.reto && sc == null;
        return `<div class="bubble ${tu ? "tu" : ""} ${cur && tu && sc == null ? "wait" : ""}" ${!tu ? `data-say="${esc(l.pl)}"` : ""}>
          <span class="who">${esc(tu ? "Tú" : l.nombre)}</span>
          ${hide ? `<span class="pl" style="opacity:.4">· · ·</span>` : `<span class="pl">${sc != null && !sc.skip ? colorLetters(l.pl, sc.heard) : esc(l.pl)}</span>`}
          <span class="es">${esc(l.es)}</span>
          ${sc != null && sc.skip ? `<span class="sc" style="color:var(--muted)">saltada</span>` : ""}${sc != null && !sc.skip ? `<span class="sc" style="color:var(--${sc.score >= 65 ? "leaf" : "red"})">${"★".repeat(stars(sc.score))}${"☆".repeat(3 - stars(sc.score))} ${sc.score}%</span>` : ""}
        </div>`; }).join("")}</div></div>
      <div id="act"></div>`;
    $("#q").addEventListener("click", exitTo);
    $("#reto").addEventListener("click", () => { S.reto = !S.reto; save(); paint(); });
    const l = lines[i], act = $("#act");
    if (l.quien !== "tu") {
      act.innerHTML = `<button class="go sky" id="nx">${i === lines.length - 1 ? "Terminar" : "Seguir"}</button>`;
      speak(l.pl, S.vel);
      $("#nx").addEventListener("click", () => step());
    } else if (scores[i] == null) {
      act.innerHTML = `<div class="card" style="gap:8px">${S.reto ? `<p class="note" style="text-align:center">Dilo en polaco: «${esc(l.es)}»</p>` : ""}<div id="mic"></div>
        <div class="row" style="justify-content:center">${sayBtn(l.pl, "Cómo se dice")}<button class="say" id="skp">Saltar</button></div></div>`;
      if (canListen()) micWidget($("#mic"), l.pl, r => { scores[i] = r; sfx(r.score >= 65 ? "ok" : "bad"); buzz(r.score >= 65 ? 20 : 50); if (r.score >= 65) addXP(r.score >= 85 ? 15 : 10); paint(); }, { prompt: "Te toca: toca el micro y dilo" });
      else $("#mic").innerHTML = `<p class="note">Léelo en voz alta y sigue.</p>`;
      $("#skp").addEventListener("click", () => { scores[i] = { score: 0, heard: "", skip: true }; step(); });
    } else {
      const r = scores[i];
      act.innerHTML = `<div class="row">${r.score < 65 ? `<button class="go ghost" id="rep" style="flex:1">Repetir</button>` : ""}<button class="go" id="nx" style="flex:1">${i === lines.length - 1 ? "Terminar" : "Seguir"}</button></div>`;
      $("#rep")?.addEventListener("click", () => { scores[i] = null; speak(l.pl, S.vel * 0.85); paint(); });
      $("#nx").addEventListener("click", () => step());
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };
  const step = () => { if (i < lines.length - 1) { i++; paint(); } else finish(); };
  const finish = () => {
    const mine = scores.filter(x => x && !x.skip); const avg = mine.length ? Math.round(mine.reduce((a, b) => a + b.score, 0) / mine.length) : 0;
    const pass = !canListen() || avg >= 50;
    if (pass) { (S.unidades[u.id] ||= {}).dialogo = true; (S.unidades[u.id]).mejor = Math.max(S.unidades[u.id].mejor || 0, avg); addXP(20); }
    save(); L = null;
    try { N?.pantallaEncendida(false); } catch (e) {}
    view.innerHTML = `<div class="step" style="text-align:center"><span class="label">Diálogo · ${esc(u.estacion)}</span>
      <div class="big">${canListen() ? avg + "%" : "✓"}</div><div class="stars">${"★".repeat(stars(avg))}${"☆".repeat(3 - stars(avg))}</div>
      <h2>${pass ? (uDone(u) ? "¡Parada completada! 🌼" : "¡Conversación superada!") : "Casi. Repítelo y lo bordas."}</h2>
      <p class="note">${pass ? "Ya puedes tener esta conversación de verdad." : "Necesitas un 50% de media para completarlo."}</p>
      <div class="row"><button class="go ghost" id="again" style="flex:1">Otra vez</button><button class="go" id="ok" style="flex:1">Seguir</button></div></div>`;
    $("#again").addEventListener("click", () => renderDialog(u));
    $("#ok").addEventListener("click", () => renderUnit(u));
    if (pass) { sfx("win"); confetti(); }
  };
  paint();
}

/* ================= LABORATORIO DE SONIDOS ================= */
function renderSound(s) {
  screen = "sound"; back = renderHome;
  const rec = S.sonidos[s.id] ||= {};
  view.innerHTML = `
  <div class="top"><button class="x" id="back">←</button><span class="label">Laboratorio de pronunciación</span></div>
  <div class="card labcard"><h1 style="font-size:46px">${esc(s.grafia)}</h1><h3>${esc(s.titulo)}</h3><p>${esc(s.explica)}</p></div>
  <div class="card"><div class="spread"><span class="label">Escucha y repite</span><span class="note">mejor: ${rec.best != null ? rec.best + "%" : "–"}</span></div>
    <div class="results">${s.ejemplos.map((e, k) => `<div class="res"><button class="say" data-say="${esc(e.pl)}" aria-label="Escuchar">🔊</button><span class="t"><b>${esc(e.pl)}</b><span>${esc(e.es)}</span></span>${canListen() ? `<button class="say" data-ex="${k}">🎙️</button>` : ""}</div>`).join("")}</div>
    <div id="exres"></div></div>
  <div class="card"><span class="label">¿Cuál has oído?</span><p class="note">Te digo una de las dos palabras. Elige la que oyes.</p><button class="go sky" id="pairs">Jugar · ${s.pares.length * 2} rondas</button></div>
  <div class="card"><span class="label">Trabalenguas</span><div class="example"><b>${esc(s.trabalenguas.pl)}</b><span>${esc(s.trabalenguas.es)}</span></div>
    <div class="row">${sayBtn(s.trabalenguas.pl, "Normal")}<button class="say" data-slow="${esc(s.trabalenguas.pl)}">🐢 Despacio</button></div>
    ${canListen() ? `<div id="tw"></div><div id="twres"></div>` : ""}<p class="note">Récord: ${rec.tw != null ? rec.tw + "%" : "aún ninguno"}</p></div>`;
  $("#back").addEventListener("click", renderHome);
  view.querySelectorAll("[data-ex]").forEach(b => b.addEventListener("click", () => {
    const e = s.ejemplos[+b.dataset.ex];
    $("#exres").innerHTML = `<div class="word"><div class="pl" id="exw">${esc(e.pl)}</div></div><div id="exmic"></div><div id="exfb"></div>`;
    micWidget($("#exmic"), e.pl, r => {
      rec.best = Math.max(rec.best || 0, r.score); save();
      if (r.score >= 65) addXP(r.score >= 85 ? 8 : 5);
      $("#exw").innerHTML = colorLetters(r.target, r.heard); $("#exw").classList.add("letters");
      $("#exfb").innerHTML = `<p class="note" style="text-align:center"><b style="color:var(--ink)">${verdict(r.score)}</b> ${"★".repeat(stars(r.score))} · He entendido «${esc(r.heard)}»</p>`;
      sfx(r.score >= 65 ? "ok" : "bad"); buzz(r.score >= 65 ? 20 : 50);
    });
    $("#exres").scrollIntoView({ behavior: "smooth", block: "center" });
  }));
  $("#pairs").addEventListener("click", () => go(() => renderPairs(s), () => go(() => renderSound(s), renderHome)));
  if (canListen()) micWidget($("#tw"), s.trabalenguas.pl, r => {
    rec.tw = Math.max(rec.tw || 0, r.score); rec.best = Math.max(rec.best || 0, r.score); save();
    if (r.score >= 50) addXP(15);
    $("#twres").innerHTML = `<div class="letters" style="font-size:22px">${colorLetters(r.target, r.heard)}</div><div class="score" style="color:var(--${r.score >= 65 ? "leaf" : "sun"})">${r.score}%</div><p class="note" style="text-align:center">${r.score >= 85 ? "¡Increíble! Esto no lo dicen bien ni muchos polacos." : r.score >= 50 ? "¡Muy bien para un trabalenguas!" : "Ve por partes: escucha despacio y repite."}</p>`;
    sfx(r.score >= 65 ? "win" : "soft"); if (r.score >= 85) confetti(60);
  }, { prompt: "Atrévete: toca y dilo entero" });
}
function renderPairs(s) {
  screen = "pairs"; back = () => renderSound(s);
  const rounds = shuffle(s.pares.flatMap(p => [{ p, t: 0 }, { p, t: 1 }]));
  let i = 0, ok = 0;
  const paint = () => {
    if (i >= rounds.length) {
      const pct = Math.round(100 * ok / rounds.length); addXP(ok * 3);
      view.innerHTML = `<div class="step" style="text-align:center"><span class="label">${esc(s.grafia)}</span><div class="big">${ok}/${rounds.length}</div><h2>${pct >= 80 ? "¡Tienes buen oído!" : "Tu oído se está afinando."}</h2><div class="row"><button class="go ghost" id="again" style="flex:1">Otra vez</button><button class="go" id="ok" style="flex:1">Seguir</button></div></div>`;
      $("#again").addEventListener("click", () => renderPairs(s)); $("#ok").addEventListener("click", () => renderSound(s));
      if (pct >= 80) confetti(40); return;
    }
    const r = rounds[i], target = r.p[r.t];
    view.innerHTML = `<div class="top"><button class="x" id="q">✕</button><div class="progress"><i style="width:${Math.round(100 * i / rounds.length)}%"></i></div><span class="xp">${ok}</span></div>
      <div class="step"><span class="label">¿Cuál has oído?</span><div class="pict">👂</div>
      <div class="row" style="justify-content:center">${sayBtn(target, "Otra vez", "big")}</div>
      <div class="opts">${r.p.map((o, k) => `<button class="opt" data-o="${k}" style="text-align:center;font-family:var(--display);font-size:24px">${esc(o)}</button>`).join("")}</div><div class="fb" id="fb"></div></div>`;
    $("#q").addEventListener("click", () => renderSound(s));
    setTimeout(() => speak(target), 300);
    view.querySelectorAll("[data-o]").forEach(b => b.addEventListener("click", () => {
      const good = +b.dataset.o === r.t; if (good) ok++;
      view.querySelectorAll("[data-o]").forEach(x => { x.disabled = true; if (+x.dataset.o === r.t) x.classList.add("ok"); else if (x === b) x.classList.add("bad"); });
      sfx(good ? "ok" : "bad"); buzz(good ? 15 : 50);
      $("#fb").innerHTML = `<div class="feedback ${good ? "good" : "bad"}"><h3>${good ? "¡Bien oído!" : "Era «" + esc(target) + "»"}</h3><div class="row">${r.p.map(o => sayBtn(o, esc(o))).join("")}</div><button class="next" id="next">Seguir</button></div>`;
      $("#next").addEventListener("click", () => { i++; paint(); });
    }));
  };
  paint();
}

/* ================= AJUSTES ================= */
function renderSettings() {
  screen = "settings"; back = renderHome;
  const vc = N ? N.versionCode() : 0, vn = N ? N.versionName() : "web";
  view.innerHTML = `
  <div class="top"><button class="x" id="back">←</button><span class="label">Ajustes</span></div>
  <div class="card set"><b>Recordatorio diario</b>
    <div class="row">${["08:00", "13:00", "19:00", "21:00"].map(h => `<button data-h="${h}" aria-pressed="${S.hora === h}">${h}</button>`).join("")}<button data-h="" aria-pressed="${!S.hora}">Sin aviso</button></div></div>
  <div class="card set"><b>Velocidad de la voz</b>
    <div class="row">${[[0.7, "Despacio"], [0.9, "Normal"], [1.05, "Rápida"]].map(([v, t]) => `<button data-v="${v}" aria-pressed="${S.vel === v}">${t}</button>`).join("")}</div>
    <button class="link" id="prueba" style="justify-self:start">🔊 Probar: «Przepraszam, gdzie jest przystanek?»</button>
    ${N ? `<button class="link" id="voz" style="justify-self:start">Ajustes de voz del móvil (voz polaca)</button>` : ""}</div>
  <div class="card set"><b>Copia de seguridad</b><p class="note">Tu progreso vive en este móvil. Guarda una copia en Drive, WhatsApp o tu correo por si cambias de teléfono.</p>
    <button class="go ghost" id="exp">Guardar copia</button>
    <details><summary class="link">Recuperar una copia</summary><textarea id="imp" placeholder="Pega aquí el texto de la copia"></textarea><button class="go ghost" id="impb">Recuperar</button></details></div>
  <div class="card set"><b>Versión ${esc(vn)}</b><p class="note">La app mira sola si hay versión nueva y te avisa arriba.</p>
    <button class="link" id="rel" style="justify-self:start">Ver versiones en GitHub</button></div>
  <p class="note" style="text-align:center">${all().filter(w => st(w.id).v).length} palabras vistas · ${S.xpTotal} XP en total · mejor racha ${S.mejor} días</p>`;
  $("#back").addEventListener("click", renderHome);
  view.querySelectorAll("[data-h]").forEach(b => b.addEventListener("click", () => { S.hora = b.dataset.h; save(); try { N?.recordatorio(S.hora); } catch (e) {} toast(S.hora ? "Te aviso a las " + S.hora : "Sin recordatorio"); renderSettings(); }));
  view.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => { S.vel = +b.dataset.v; save(); speak("Przepraszam, gdzie jest przystanek?"); renderSettings(); }));
  $("#prueba").addEventListener("click", () => speak("Przepraszam, gdzie jest przystanek?"));
  $("#voz")?.addEventListener("click", () => N.ajustesVoz());
  $("#exp").addEventListener("click", () => {
    const txt = "SLOWKA1:" + btoa(unescape(encodeURIComponent(JSON.stringify(S))));
    if (N) N.compartir(txt); else { navigator.clipboard?.writeText(txt).catch(() => {}); toast("Copia copiada al portapapeles"); }
  });
  $("#impb").addEventListener("click", () => {
    try {
      const raw = $("#imp").value.trim().replace(/^.*?SLOWKA1:/s, "");
      const data = JSON.parse(decodeURIComponent(escape(atob(raw))));
      if (!data.items) throw 0;
      S = data; save(); toast("Copia recuperada ✓"); renderHome();
    } catch (e) { toast("Ese texto no es una copia de Słówka. Pega el mensaje completo."); }
  });
  $("#rel").addEventListener("click", () => openUrl(`https://github.com/${REPO}/releases/latest`));
}
function openUrl(u) { N ? N.abrir(u) : window.open(u, "_blank"); }

/* ================= actualizaciones ================= */
let lastCheck = 0;
async function checkUpdate() {
  if (!N || Date.now() - lastCheck < 3600e3) return;
  lastCheck = Date.now();
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return;
    const j = await r.json();
    const code = +(String(j.tag_name || "").match(/-(\d+)$/) || [])[1] || 0;
    if (code <= N.versionCode()) return;
    const apk = (j.assets || []).find(a => /\.apk$/.test(a.name));
    const bar = $("#update");
    bar.innerHTML = `<span>✨ Hay una versión nueva de Słówka</span><button id="upd">Update</button>`;
    bar.hidden = false;
    $("#upd").addEventListener("click", () => { openUrl(apk ? apk.browser_download_url : j.html_url); bar.hidden = true; });
  } catch (e) {}
}

/* ================= confeti ================= */
function confetti(count = 90) {
  if (reduced) return;
  const c = $("#burst"), x = c.getContext("2d");
  c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; x.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const cols = ["red", "leaf", "sky", "sun", "rose"].map(cssVar);
  const ps = Array.from({ length: count }, () => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 12, vy: Math.random() * -10 - 3, r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, s: 6 + Math.random() * 8, c: pick(cols), k: Math.random() < .5 }));
  let f = 0;
  (function tick() {
    x.clearRect(0, 0, innerWidth, innerHeight);
    ps.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; if (p.k) { x.beginPath(); x.ellipse(0, 0, p.s / 2, p.s, 0, 0, 6.28); x.fill(); } else x.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); x.restore(); });
    if (++f < 110) requestAnimationFrame(tick); else x.clearRect(0, 0, innerWidth, innerHeight);
  })();
}

/* ================= eventos globales ================= */
document.addEventListener("click", e => {
  const s = e.target.closest("[data-say]"); if (s) { speak(s.dataset.say); return; }
  const sl = e.target.closest("[data-slow]"); if (sl) speak(sl.dataset.slow, S.vel * 0.65);
});
addEventListener("resize", () => meadow?.relayout());

renderHome();
setTimeout(checkUpdate, 2500);
})();
