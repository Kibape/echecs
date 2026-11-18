// Génère public/data/openings.json (répertoire curé, validé) et public/data/eco.json (bibliothèque Lichess CC0).
// Usage : node tools/build-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "../public/vendor/chess.js";
import { OUVERTURES, SOURCES } from "./curated.mjs";
import { FAMILLES, variantes } from "./familles.mjs";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "data");
mkdirSync(OUT, { recursive: true });

// Clé de position : placement + trait + roques (on ignore en-passant et compteurs pour gérer les transpositions).
const cle = (chess) => chess.fen().split(" ").slice(0, 3).join(" ");

// ───────────── 1) Bibliothèque ECO (Lichess, CC0) ─────────────
const eco = [];
const posMap = new Map(); // clé de position -> { eco, nom, ply }
let rejetes = 0;
for (const f of ["a", "b", "c", "d", "e"]) {
  const lignes = readFileSync(join(ROOT, "tools", "eco-src", `${f}.tsv`), "utf8").split("\n").slice(1);
  for (const l of lignes) {
    if (!l.trim()) continue;
    const [code, nom, pgn] = l.split("\t");
    const sans = pgn.replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(Boolean);
    const c = new Chess();
    let ok = true;
    for (const s of sans) {
      try { c.move(s); } catch { ok = false; break; }
    }
    if (!ok) { rejetes++; continue; }
    eco.push([code, nom, sans.join(" ")]);
    posMap.set(cle(c), { eco: code, nom, ply: sans.length });
  }
}
writeFileSync(join(OUT, "eco.json"), JSON.stringify(eco));
console.log(`ECO : ${eco.length} lignes valides, ${rejetes} rejetées`);

// ───────────── 2) Répertoire curé ─────────────
// Rallonges calculées par tools/extend-lignes.mjs (coups Stockfish, marqués comme tels) et audit Stockfish des variantes.
const EXT = existsSync(join(ROOT, "tools", "extensions.json")) ? JSON.parse(readFileSync(join(ROOT, "tools", "extensions.json"), "utf8")) : {};
const AUDIT = existsSync(join(ROOT, "tools", "audit-lignes.json")) ? JSON.parse(readFileSync(join(ROOT, "tools", "audit-lignes.json"), "utf8")) : { variantes: [] };
const PERTE_MAX = new Map(AUDIT.variantes.map((v) => [v.pgn, Math.max(...v.pertes)]));
// Lignes « réponses fréquentes à ton niveau » issues de l'explorateur Lichess (tools/crawl-explorer.mjs), si présentes.
const EXPL = existsSync(join(ROOT, "tools", "explorer.json")) ? JSON.parse(readFileSync(join(ROOT, "tools", "explorer.json"), "utf8")) : null;
const TRANCHE = { "0": "0-1000", "0,1000": "≤ 1000", "1000": "1000-1200", "1000,1200": "1000-1400" };
let erreurs = 0, avertissements = 0;
const ouvertures = OUVERTURES.map((o) => {
  const lignes = o.lignes.map((l) => {
    let coups = l.coups.split(/\s+/).filter(Boolean);
    const rallonge = EXT[`${o.id}|${l.nom}`];
    let extensionDepuis = null;
    if (rallonge && rallonge.base === coups.join(" ")) { extensionDepuis = coups.length; coups = coups.concat(rallonge.coups); }
    else if (rallonge) console.warn(`⚠ rallonge périmée ignorée : ${o.id} / ${l.nom} (relance tools/extend-lignes.mjs)`);
    const c = new Chess();
    let nomEco = null;
    for (let i = 0; i < coups.length; i++) {
      try { c.move(coups[i]); }
      catch {
        console.error(`✗ ILLÉGAL  ${o.id} / ${l.nom} : coup ${i + 1} "${coups[i]}"`);
        erreurs++; return null;
      }
      const hit = posMap.get(cle(c));
      if (hit) nomEco = hit; // le plus profond gagne
    }
    if (c.isCheckmate() === false && coups[coups.length - 1].endsWith("#")) {
      console.error(`✗ PAS MAT  ${o.id} / ${l.nom}`); erreurs++;
    }
    const attendu = o.attendu || [];
    const accord = nomEco && attendu.some((k) => nomEco.nom.toLowerCase().includes(k.toLowerCase()));
    if (!nomEco) { console.warn(`⚠ non trouvé dans la base ECO : ${o.id} / ${l.nom}`); avertissements++; }
    else if (!accord) { console.warn(`⚠ nom ECO inattendu : ${o.id} / ${l.nom} → "${nomEco.nom}" (${nomEco.eco}) ; attendu : ${attendu.join(" | ")}`); avertissements++; }
    return {
      nom: l.nom,
      coups,
      notes: { ...(l.notes || {}), ...(extensionDepuis ? { [extensionDepuis + 1]: "À partir d'ici, les coups viennent de Stockfish (meilleure suite), pas d'une base de théorie : ce sont des coups solides, pas forcément ceux que jouent les maîtres." } : {}) },
      extensionDepuis,
      ecoDetecte: nomEco ? { code: nomEco.eco, nom: nomEco.nom, ply: nomEco.ply } : null,
      fenFinale: c.fen(),
    };
  });
  if (lignes.some((x) => x === null)) return null;
  for (const e of (EXPL && EXPL.ouvertures[o.id]) || []) {
    if (lignes.some((l) => l.coups.join(" ") === e.pgn || l.coups.join(" ").startsWith(e.pgn + " "))) continue; // déjà couverte
    const coups = e.pgn.split(" "); const c = new Chess(); let nomEco = null, ok = true;
    for (const m of coups) { try { c.move(m); } catch { ok = false; break; } const h = posMap.get(cle(c)); if (h) nomEco = h; }
    if (!ok) { console.error(`✗ explorer.json : ligne illégale ${o.id} ${e.pgn}`); erreurs++; continue; }
    const notes = {};
    for (const p of e.coups) notes[p.ply] = `Réponse jouée dans ${p.pct} % des parties réelles (Elo ${TRANCHE[EXPL.ratings] || EXPL.ratings}) : ${p.blancs + p.noirs + p.nulles > 0 ? `Blancs ${Math.round(100 * p.blancs / (p.blancs + p.nulles + p.noirs))} % / nulles ${Math.round(100 * p.nulles / (p.blancs + p.nulles + p.noirs))} % / Noirs ${Math.round(100 * p.noirs / (p.blancs + p.nulles + p.noirs))} %` : ""}.`;
    lignes.push({ nom: `${nomEco ? nomEco.nom : "Ligne courante"} — ${e.freq} % des parties`, coups, notes, extensionDepuis: null, ecoDetecte: nomEco ? { code: nomEco.eco, nom: nomEco.nom, ply: nomEco.ply } : null, fenFinale: c.fen(), source: "explorer" });
  }
  const { attendu, ...reste } = o;
  const fam = FAMILLES[o.id];
  if (!fam) console.warn(`⚠ pas de famille de variantes pour ${o.id}`);
  return { ...reste, lignes, variantes: fam ? variantes(eco, fam).map((v) => { const perte = PERTE_MAX.get(v[2]) || 0; return perte > 200 ? [...v, +(Math.min(perte, 999) / 100).toFixed(1)] : v; }) : [] };
}).filter(Boolean);

for (const o of ouvertures) {
  for (const s of o.sources || []) if (!SOURCES[s]) { console.error(`✗ source inconnue ${s} dans ${o.id}`); erreurs++; }
}

writeFileSync(join(OUT, "openings.json"), JSON.stringify({ version: 1, sources: SOURCES, ouvertures }, null, 1));
console.log(`Répertoire : ${ouvertures.length}/${OUVERTURES.length} ouvertures, ${ouvertures.reduce((n, o) => n + o.lignes.length, 0)} lignes — ${erreurs} erreurs, ${avertissements} avertissements`);

// Rapport de recoupement (utile pour relire)
console.log("\nRecoupement avec la base Lichess (position la plus profonde nommée) :");
for (const o of ouvertures) for (const l of o.lignes) {
  const e = l.ecoDetecte;
  console.log(` - ${o.id.padEnd(22)} ${l.nom.padEnd(38)} → ${e ? `${e.code} ${e.nom} (coup ${Math.ceil(e.ply / 2)})` : "—"}`);
}
if (erreurs) process.exit(1);
