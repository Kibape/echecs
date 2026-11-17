// Sons synthétisés avec WebAudio : aucun fichier audio (donc aucun droit à gérer, rien à charger).
// Le navigateur exige un geste de l'utilisateur avant de produire du son : on débloque au premier clic.

let ctx = null;
let actif = true;
let bruit = null;
export const Son = {
  compteur: 0, // nombre de sons déclenchés (utile pour les tests)
  dernier: null,

  setActif(v) { actif = !!v; },
  estActif() { return actif; },

  /** À appeler dans un gestionnaire de clic/pointeur. */
  debloquer() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
      chargerPerso();
    } catch { /* pas d'audio : on continue sans */ }
  },

  /** Son d'un coup d'après l'objet coup de chess.js. */
  coup(m) {
    if (m.san && m.san.includes("#")) return jouer("mat");
    if (m.san && m.san.includes("+")) return jouer(m.captured ? "echec-prise" : "echec");
    if (m.promotion) return jouer("promotion");
    if (m.flags && (m.flags.includes("k") || m.flags.includes("q"))) return jouer("roque");
    jouer(m.captured ? "prise" : "coup");
  },
  erreur() { jouer("erreur"); },
  ok() { jouer("ok"); },
  fin() { jouer("fin"); },
  premove() { jouer("premove"); },
};

// Sons personnalisés : si tu déposes des fichiers dans public/sounds/ (coup, prise, echec, echec-prise, roque,
// promotion, mat, erreur, ok, fin, premove ; en .mp3, .ogg ou .wav), ils remplacent les sons synthétisés.
const perso = {};
let persoCharge = false;
async function chargerPerso() {
  if (persoCharge || !ctx) return;
  persoCharge = true;
  let fichiers = [];
  try { const r = await fetch("sounds/liste.json"); if (r.ok) fichiers = await r.json(); } catch { /* pas de liste : sons synthétisés */ }
  for (const f of fichiers) {
    const nom = f.replace(/\.[^.]+$/, "");
    if (!RECETTES[nom] || perso[nom]) continue;
    try { perso[nom] = await ctx.decodeAudioData(await (await fetch("sounds/" + f)).arrayBuffer()); } catch { /* illisible : on garde le synthétisé */ }
  }
}

function jouer(nom) {
  Son.dernier = nom;
  Son.compteur++;
  if (!actif || !ctx || ctx.state !== "running") return;
  try {
    if (perso[nom]) { const src = ctx.createBufferSource(); src.buffer = perso[nom]; src.connect(ctx.destination); src.start(); return; }
    RECETTES[nom](ctx.currentTime + 0.005);
  } catch { /* ignore */ }
}

function bruitBuf() {
  if (bruit) return bruit;
  const n = Math.floor(ctx.sampleRate * 0.25);
  bruit = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = bruit.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return bruit;
}

/** Souffle filtré (le "claquement" du bois). */
function souffle(t, { freq = 1400, q = 1.2, dur = 0.05, gain = 0.4 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = bruitBuf();
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t); src.stop(t + dur + 0.02);
}

/** Note (sinus ou triangle) avec glissando optionnel. */
function note(t, { freq = 440, vers = null, dur = 0.12, gain = 0.2, type = "sine" } = {}) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (vers) o.frequency.exponentialRampToValueAtTime(vers, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

// "Tock" de bois : un claquement très bref (clic aigu) + un corps grave qui retombe vite.
const toc = (t, fort = 1) => {
  souffle(t, { freq: 3200, q: 0.9, dur: 0.018, gain: 0.55 * fort });
  souffle(t, { freq: 1100, q: 1.4, dur: 0.05, gain: 0.4 * fort });
  note(t, { freq: 300, vers: 110, dur: 0.075, gain: 0.7 * fort, type: "triangle" });
};

const RECETTES = {
  coup: (t) => toc(t),
  prise: (t) => { toc(t, 1.4); souffle(t + 0.03, { freq: 900, dur: 0.06, gain: 0.35 }); note(t, { freq: 130, vers: 70, dur: 0.1, gain: 0.45 }); },
  roque: (t) => { toc(t); toc(t + 0.1, 0.8); },
  echec: (t) => { toc(t); note(t + 0.07, { freq: 880, dur: 0.14, gain: 0.18, type: "triangle" }); },
  "echec-prise": (t) => { RECETTES.prise(t); note(t + 0.08, { freq: 880, dur: 0.14, gain: 0.18, type: "triangle" }); },
  promotion: (t) => { toc(t); [523, 659, 784].forEach((f, i) => note(t + 0.06 + i * 0.07, { freq: f, dur: 0.12, gain: 0.16, type: "triangle" })); },
  mat: (t) => { toc(t, 1.2); [196, 247, 294].forEach((f) => note(t + 0.08, { freq: f, dur: 0.7, gain: 0.14, type: "triangle" })); },
  erreur: (t) => { note(t, { freq: 240, vers: 150, dur: 0.2, gain: 0.22, type: "triangle" }); note(t + 0.01, { freq: 120, vers: 80, dur: 0.2, gain: 0.12, type: "sine" }); },
  ok: (t) => { note(t, { freq: 660, dur: 0.1, gain: 0.18, type: "triangle" }); note(t + 0.09, { freq: 990, dur: 0.18, gain: 0.18, type: "triangle" }); },
  fin: (t) => { [523, 659, 784, 1047].forEach((f, i) => note(t + i * 0.09, { freq: f, dur: 0.22, gain: 0.15, type: "triangle" })); },
  premove: (t) => { souffle(t, { freq: 2600, q: 1, dur: 0.02, gain: 0.3 }); note(t, { freq: 420, vers: 260, dur: 0.04, gain: 0.2, type: "triangle" }); },
};
