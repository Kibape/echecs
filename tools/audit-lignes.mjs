// Audit des lignes d'ouverture avec Stockfish : pour CHAQUE coup, perte = éval avant + éval après (du point de vue du joueur
// qui a joué). Un coup qui perd plus de SEUIL centipions est signalé. Les gambits/pièges perdent légitimement un peu : ils
// sont signalés mais pas supprimés automatiquement. Usage : node tools/audit-lignes.mjs [sortie.json] [profondeur]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "../public/vendor/chess.js";

const require = createRequire(import.meta.url);
const sf = require("stockfish");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = process.argv[2] || path.join(ROOT, "tools", "audit-lignes.json");
const PROF = +process.argv[3] || 14;
const op = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/openings.json"))).ouvertures;

let onLine = null;
const inst = sf("lite-single", (l) => { for (const x of String(l).split("\n")) if (x.trim() && onLine) onLine(x.trim()); });
const attendre = (t) => new Promise((r) => { onLine = (l) => { if (l.includes(t)) { onLine = null; r(); } }; });
let p = attendre("uciok"); inst.processCommand("uci"); await p;
p = attendre("readyok"); inst.processCommand("isready"); await p;

const cache = new Map();
const cle = (fen) => fen.split(" ").slice(0, 4).join(" ");
async function evaluer(fen) { // centipions du point de vue du camp au trait (mat = ±10000)
  const k = cle(fen);
  if (cache.has(k)) return cache.get(k);
  const c = new Chess(fen);
  let v;
  if (c.isCheckmate()) v = -10000;
  else if (c.isDraw()) v = 0;
  else {
    v = 0;
    inst.processCommand("position fen " + fen);
    await new Promise((r) => {
      onLine = (l) => {
        const m = l.startsWith("info") && !/bound/.test(l) && / depth \d+.* score (cp|mate) (-?\d+)/.exec(l);
        if (m) v = m[1] === "mate" ? (+m[2] > 0 ? 10000 - +m[2] : -10000 - +m[2]) : +m[2];
        if (l.startsWith("bestmove")) { onLine = null; r(); }
      };
      inst.processCommand("go depth " + PROF);
    });
  }
  cache.set(k, v);
  return v;
}

const res = { profondeur: PROF, curees: [], variantes: [] };
async function auditer(coups) {
  const c = new Chess();
  let avant = await evaluer(c.fen());
  const pertes = [];
  for (let i = 0; i < coups.length; i++) {
    c.move(coups[i]);
    const apres = await evaluer(c.fen());
    pertes.push(Math.max(0, avant + apres)); // avant (POV joueur) - (-apres)
    avant = apres;
  }
  return { pertes, evalFinale: c.turn() === "w" ? avant : -avant }; // éval finale du point de vue des Blancs
}

let n = 0;
for (const o of op) {
  for (const l of o.lignes) { const a = await auditer(l.coups); res.curees.push({ id: o.id, nom: l.nom, camp: o.camp, coups: l.coups, ...a }); }
  if (!process.env.CUREES) for (const v of o.variantes) { const a = await auditer(v[2].split(" ")); res.variantes.push({ id: o.id, code: v[0], nom: v[1], pgn: v[2], ...a }); }
  fs.writeFileSync(SORTIE, JSON.stringify(res));
  console.log(`${++n}/${op.length} ${o.id}  positions évaluées: ${cache.size}`);
}
console.log("terminé");
process.exit(0);
