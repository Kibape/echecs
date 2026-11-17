// Allonge les lignes curées jusqu'à CIBLE demi-coups avec les coups que Stockfish juge les meilleurs.
// Les coups ajoutés ne sont PAS de la théorie issue d'une base de parties : ils sont marqués comme tels dans l'app
// (extensionDepuis). Les lignes-pièges (mat du berger, mat de Légal…) ne sont pas prolongées.
// Usage : node tools/extend-lignes.mjs   → écrit tools/extensions.json (relu par build-data.mjs)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "../public/vendor/chess.js";
import { OUVERTURES } from "./curated.mjs";

const require = createRequire(import.meta.url);
const sf = require("stockfish");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIBLE = 30, PROF = 18;
const PIEGES = new Set(["mat-legal", "mat-berger", "defense-berger"]);

let onLine = null;
const inst = sf("lite-single", (l) => { for (const x of String(l).split("\n")) if (x.trim() && onLine) onLine(x.trim()); });
const attendre = (t) => new Promise((r) => { onLine = (l) => { if (l.includes(t)) { onLine = null; r(); } }; });
let p = attendre("uciok"); inst.processCommand("uci"); await p;
p = attendre("readyok"); inst.processCommand("isready"); await p;

async function meilleur(fen) {
  let best = null, cp = 0;
  inst.processCommand("position fen " + fen);
  await new Promise((r) => {
    onLine = (l) => {
      const m = l.startsWith("info") && !/bound/.test(l) && / score (cp|mate) (-?\d+)/.exec(l);
      if (m) cp = m[1] === "mate" ? (+m[2] > 0 ? 10000 : -10000) : +m[2];
      if (l.startsWith("bestmove")) { best = l.split(" ")[1]; onLine = null; r(); }
    };
    inst.processCommand("go depth " + PROF);
  });
  return { uci: best, cp };
}

const ext = {};
for (const o of OUVERTURES) {
  if (PIEGES.has(o.id)) continue;
  for (const l of o.lignes) {
    const base = l.coups.split(/\s+/).filter(Boolean);
    if (/pi[eè]ge/i.test(l.nom) || base[base.length - 1].endsWith("#")) continue;
    const c = new Chess();
    for (const s of base) c.move(s);
    const ajout = [];
    while (base.length + ajout.length < CIBLE && !c.isGameOver()) {
      const { uci, cp } = await meilleur(c.fen());
      if (!uci || uci === "(none)") break;
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      ajout.push(m.san);
      if (Math.abs(cp) > 400) break; // position décidée : une ligne d'ouverture n'a plus de sens
    }
    if (ajout.length) { ext[`${o.id}|${l.nom}`] = { base: base.join(" "), depuis: base.length, coups: ajout, source: `Stockfish 19 lite, profondeur ${PROF}` }; }
    console.log(`${o.id} / ${l.nom}: ${base.length} → ${base.length + ajout.length}`);
  }
}
fs.writeFileSync(path.join(ROOT, "tools", "extensions.json"), JSON.stringify(ext, null, 1));
console.log("écrit tools/extensions.json");
process.exit(0);
