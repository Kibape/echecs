// Génère des puzzles tactiques vérifiés par Stockfish.
//   node tools/gen-puzzles.mjs --seed 1 --minutes 10 --out chemin/p1.jsonl
//
// Méthode (proche de celle de Lichess) :
//  1. on joue des parties "de débutant" (début tiré de la base ECO, puis coups moyens + gaffes aléatoires) ;
//  2. on repère une GAFFE : la position juste avant avait une évaluation équilibrée, juste après l'adversaire
//     est clairement gagnant ;
//  3. on vérifie à plus grande profondeur que le coup gagnant est UNIQUE (écart >= 150 cp, ou mat plus court
//     que toute alternative), en suivant la ligne jusqu'à 3 coups de l'élève ;
//  4. on étiquette les thèmes (tools/themes.mjs).
// Format de sortie (une ligne JSON par puzzle) : { fen, moves:[gaffe, élève, adversaire, élève…], themes, mat, niveau }
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "../public/vendor/chess.js";
import { detecterThemes, matDiff, niveau } from "./themes.mjs";

const require = createRequire(import.meta.url);
const sf = require("stockfish");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = +arg("seed", 1), MINUTES = +arg("minutes", 5), OUT = arg("out", "puzzles.jsonl");
// --only fourchette,clouage : ne garde que ces thèmes (et assouplit le seuil de gain à 200 cp)
const ONLY = arg("only", "") ? arg("only", "").split(",") : null;
const MINCP = ONLY ? 200 : 300;
const ECO = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/eco.json"), "utf8"));

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = mulberry32(SEED * 7919 + 13);

const val = (s) => (s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate : -100000 - s.mate) : s.cp);
const uci = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

class Uci {
  constructor() { this.onLine = null; this.inst = sf("lite-single", (l) => { for (const x of String(l).split("\n")) if (x.trim() && this.onLine) this.onLine(x.trim()); }); }
  send(c) { this.inst.processCommand(c); }
  attendre(token) { return new Promise((res) => { this.onLine = (l) => { if (l.includes(token)) { this.onLine = null; res(); } }; }); }
  async init() {
    let p = this.attendre("uciok"); this.send("uci"); await p;
    this.send("setoption name Hash value 64");
    p = this.attendre("readyok"); this.send("isready"); await p;
  }
  search(fen, { multipv = 1, movetime = 100, depth = 12 } = {}) {
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    const lignes = {};
    return new Promise((res) => {
      this.onLine = (l) => {
        if (l.startsWith("info") && l.includes(" pv ") && !/(lowerbound|upperbound)/.test(l)) {
          const d = +(/ depth (\d+)/.exec(l) || [0, 0])[1], k = +(/ multipv (\d+)/.exec(l) || [0, 1])[1];
          const s = / score (cp|mate) (-?\d+)/.exec(l); if (!s) return;
          const pv = l.split(" pv ")[1].trim().split(/\s+/);
          if (!lignes[k] || d >= lignes[k].depth) lignes[k] = { depth: d, score: s[1] === "cp" ? { cp: +s[2] } : { mate: +s[2] }, pv };
        } else if (l.includes("bestmove")) { this.onLine = null; res(Object.keys(lignes).sort((a, b) => a - b).map((k) => lignes[k])); }
      };
      this.send(`go depth ${depth} movetime ${movetime}`);
    });
  }
}

/** Vérifie en profondeur et construit la solution. Renvoie un puzzle ou null. */
async function verifier(uciSF, fenAvant, gaffe) {
  const c0 = new Chess(fenAvant);
  if (!c0.move(uci(gaffe))) return null;
  const fen1 = c0.fen();
  const eleve = c0.turn();
  let L = await uciSF.search(fen1, { multipv: 3, movetime: 350, depth: 16 });
  if (!L.length) return null;
  const best = L[0];
  const mateN = best.score.mate > 0 ? best.score.mate : 0;
  if (best.score.mate !== undefined && best.score.mate <= 0) return null;
  if (mateN > 3) return null;
  if (!mateN && (best.score.cp === undefined || best.score.cp < MINCP)) return null;
  if (L[1] && mateN !== 1) {
    if (mateN) { if (L[1].score.mate > 0 && L[1].score.mate <= mateN) return null; }
    else if (val(best.score) - val(L[1].score) < 150) return null;
  }
  const chess = new Chess(fen1);
  const mat0 = matDiff(chess, eleve);
  const sol = [];
  let restant = mateN, lignes = L;
  for (let etape = 1; etape <= 3; etape++) {
    const mv = lignes[0].pv[0];
    const m = chess.move(uci(mv));
    if (!m) return null;
    sol.push(mv);
    if (chess.isCheckmate()) return conclure(fenAvant, gaffe, fen1, sol, mateN);
    const rep = lignes[0].pv[1];
    if (!rep) return null;
    if (!mateN) {
      const copie = new Chess(chess.fen());
      if (!copie.move(uci(rep))) return null;
      if ((m.captured || m.promotion) && matDiff(copie, eleve) - mat0 >= 2) return conclure(fenAvant, gaffe, fen1, sol, 0);
    }
    if (!chess.move(uci(rep))) return null;
    sol.push(rep);
    if (etape === 3) return null;
    lignes = await uciSF.search(chess.fen(), { multipv: 3, movetime: 300, depth: 16 });
    if (!lignes.length) return null;
    const b = lignes[0];
    if (mateN) {
      restant--;
      if (b.score.mate !== restant) return null;
      if (lignes[1] && restant > 1 && lignes[1].score.mate > 0 && lignes[1].score.mate <= restant) return null;
    } else {
      if (b.score.cp === undefined || b.score.cp < MINCP - 50) return null;
      if (lignes[1] && val(b.score) - val(lignes[1].score) < 150) return null;
    }
  }
  return null;
}

function conclure(fenAvant, gaffe, fen1, sol, mateN) {
  const { themes, mat } = detecterThemes(fen1, sol);
  if (ONLY && !themes.some((t) => ONLY.includes(t))) return null;
  const nEleve = Math.ceil(sol.length / 2);
  return { fen: fenAvant, moves: [gaffe, ...sol], themes, mat: mat || 0, niveau: niveau({ mat: mat || 0, nEleve, themes }), cle: fen1.split(" ")[0] };
}

/** Avec --only : écarte vite (sans moteur) les candidats dont le 1er coup n'illustre pas un thème voulu. */
function prefiltre(fen, pv) {
  if (!ONLY) return true;
  try { return detecterThemes(fen, pv.slice(0, 1)).themes.some((t) => ONLY.includes(t)); } catch { return false; }
}

async function partie(uciSF, vus) {
  const e = ECO[Math.floor(R() * ECO.length)];
  const coups = e[2].split(" ");
  const n = Math.min(coups.length, 4 + Math.floor(R() * 10));
  const c = new Chess();
  for (let i = 0; i < n; i++) c.move(coups[i]);
  let prev = null;
  for (let ply = 0; ply < 90 && !c.isGameOver(); ply++) {
    const fen = c.fen();
    const lignes = await uciSF.search(fen, { multipv: 3, movetime: 30, depth: 9 });
    if (!lignes.length) break;
    if (prev) {
      const bPrev = val(prev.lignes[0].score), bNow = val(lignes[0].score);
      const gaffe = bNow >= MINCP && bPrev <= 150 && bPrev >= -150 && bPrev + bNow >= MINCP;
      const mat = bNow >= 99997 && bPrev < 90000; // mat forcé en <= 3 : toujours intéressant
      if ((gaffe || mat) && prefiltre(fen, lignes[0].pv)) {
        const p = await verifier(uciSF, prev.fen, prev.coup);
        if (p && !vus.has(p.cle)) { vus.add(p.cle); return p; }
      }
    }
    let coup;
    if (R() < 0.1) { const l = c.moves({ verbose: true }); const m = l[Math.floor(R() * l.length)]; coup = m.from + m.to + (m.promotion || ""); }
    else { const r = R(); const idx = r < 0.6 ? 0 : r < 0.88 ? 1 : 2; coup = (lignes[Math.min(idx, lignes.length - 1)]).pv[0]; }
    prev = { fen, lignes, coup };
    if (!c.move(uci(coup))) break;
  }
  return null;
}

const moteur = new Uci();
await moteur.init();
const fin = Date.now() + MINUTES * 60 * 1000;
const vus = new Set();
let n = 0, parties = 0;
const compte = {};
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
while (Date.now() < fin) {
  parties++;
  const p = await partie(moteur, vus);
  if (!p) continue;
  n++;
  const cat = p.mat ? `mat${p.mat}` : p.themes[0];
  compte[cat] = (compte[cat] || 0) + 1;
  fs.appendFileSync(OUT, JSON.stringify(p) + "\n");
  if (n % 10 === 0) console.log(`[seed ${SEED}] ${n} puzzles / ${parties} parties`, JSON.stringify(compte));
}
console.log(`[seed ${SEED}] FIN : ${n} puzzles / ${parties} parties`, JSON.stringify(compte));
process.exit(0);
