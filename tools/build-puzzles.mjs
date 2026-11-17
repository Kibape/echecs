// Assemble les fichiers .jsonl produits par gen-puzzles.mjs en public/data/puzzles.json.
//   node tools/build-puzzles.mjs dossier-des-jsonl [--max-par-categorie 60]
// Audit final : chaque puzzle est rejoué avec chess.js (coups légaux, mat final cohérent, camp de l'élève).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "../public/vendor/chess.js";
import { THEMES, detecterThemes } from "./themes.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dossier = process.argv[2];
if (!dossier) { console.error("usage : node tools/build-puzzles.mjs <dossier avec des .jsonl>"); process.exit(1); }
const iMax = process.argv.indexOf("--max-par-categorie");
const MAX = iMax > 0 ? +process.argv[iMax + 1] : 60;
const uci = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

const brut = [];
for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith(".jsonl") && !x.startsWith("smoke"))) {
  for (const l of fs.readFileSync(path.join(dossier, f), "utf8").split("\n")) if (l.trim()) brut.push(JSON.parse(l));
}
console.log(`${brut.length} puzzles bruts`);

const PRIORITE = ["fourchette", "clouage", "enfilade", "double-echec", "mat-du-couloir", "mat-etouffe", "piece-en-prise", "promotion", "gain-de-materiel"];
const categorie = (p) => (p.mat ? `mat-en-${Math.min(3, p.mat)}` : PRIORITE.find((t) => p.themes.includes(t)) || "gain-de-materiel");

// 1) audit + dédoublonnage
const vus = new Set(), bons = [];
let rejets = 0;
for (const p of brut) {
  try {
    if (vus.has(p.cle)) continue;
    const c = new Chess(p.fen);
    for (const m of p.moves) if (!c.move(uci(m))) throw new Error("coup illégal " + m);
    const t = new Chess(p.fen); t.move(uci(p.moves[0]));
    const { themes, mat } = detecterThemes(t.fen(), p.moves.slice(1));
    if (p.mat) { if (!c.isCheckmate() || mat !== p.mat) throw new Error("mat incohérent"); }
    else if (c.isCheckmate()) throw new Error("mat inattendu");
    if (p.moves.length % 2 === 1) throw new Error("la solution doit finir sur un coup de l'élève");
    vus.add(p.cle);
    bons.push({ ...p, themes, mat, cat: categorie({ ...p, themes, mat }) });
  } catch (e) { rejets++; console.warn("rejeté :", e.message, p.fen); }
}
console.log(`${bons.length} valides, ${rejets} rejetés`);

// 2) équilibrage : au plus MAX par catégorie (déterministe : tri par clé), puis tri par niveau
const parCat = {};
for (const p of bons.sort((a, b) => a.cle.localeCompare(b.cle))) (parCat[p.cat] ||= []).push(p);
let choisis = [];
for (const [cat, l] of Object.entries(parCat)) choisis.push(...l.slice(0, MAX));
choisis.sort((a, b) => a.niveau - b.niveau || a.moves.length - b.moves.length || a.cle.localeCompare(b.cle));
const puzzles = choisis.map((p, i) => ({ id: "t" + String(i + 1).padStart(3, "0"), fen: p.fen, moves: p.moves, themes: p.themes, niveau: p.niveau, mat: p.mat || 0, cat: p.cat }));

const comptes = {};
for (const p of puzzles) comptes[p.cat] = (comptes[p.cat] || 0) + 1;
console.log("par catégorie :", comptes);
fs.writeFileSync(path.join(ROOT, "public/data/puzzles.json"), JSON.stringify({
  version: 1,
  source: "Générés par tools/gen-puzzles.mjs (parties simulées + vérification Stockfish 19). Format compatible Lichess.",
  themes: THEMES,
  puzzles,
}));
console.log(`public/data/puzzles.json : ${puzzles.length} puzzles`);
