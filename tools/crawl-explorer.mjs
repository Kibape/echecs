// Interroge l'explorateur Lichess (parties réelles, filtrées par Elo) et écrit tools/explorer.json :
// pour chaque ouverture curée, les réponses adverses les PLUS JOUÉES à ton niveau, avec leur fréquence.
// À lancer SUR TON PC (le bac à sable où je travaille n'a pas accès à lichess.org) :
//   1) crée un jeton sur https://lichess.org/account/oauth/token (aucune permission à cocher)
//   2) Windows PowerShell :  $env:LICHESS_TOKEN="lip_xxx" ; node tools/crawl-explorer.mjs
//   3) node tools/build-data.mjs   (fusionne les lignes dans l'app)
// Options (variables d'environnement) : RATINGS="0,1000" (tranches Elo Lichess : 0,1000,1200,1400,1600,1800,2000,2200,2500)
//   SPEEDS="blitz,rapid,classical"  PROFONDEUR=14 (demi-coups)  BRANCHES=2  SEUIL=12 (% minimum d'une réponse)  PARTIES_MIN=40
//   ONLY=caro-kann,pirc (limiter à quelques ouvertures)  BASE=https://explorer.lichess.ovh (pour les tests)
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "../public/vendor/chess.js";
import { OUVERTURES } from "./curated.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const E = process.env;
const BASE = E.BASE || "https://explorer.lichess.ovh";
const RATINGS = E.RATINGS || "0,1000";
const SPEEDS = E.SPEEDS || "blitz,rapid,classical";
const PROF = +(E.PROFONDEUR || 14), BRANCHES = +(E.BRANCHES || 2), SEUIL = +(E.SEUIL || 12), PARTIES_MIN = +(E.PARTIES_MIN || 40);
const ONLY = E.ONLY ? E.ONLY.split(",") : null;
const PAUSE = +(E.PAUSE_MS || 2000);
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
// Cache sur disque : si tu interromps (Ctrl+C) ou si Lichess te limite, relancer reprend où ça s'est arrêté.
const FICHIER_CACHE = join(ROOT, "tools", ".explorer-cache.json");
const cache = new Map(existsSync(FICHIER_CACHE) ? Object.entries(JSON.parse(readFileSync(FICHIER_CACHE, "utf8"))) : []);
const cleCache = (u) => `${RATINGS}|${SPEEDS}|${u}`;
let demandes = 0;

async function explorer(uci) {
  const cle = uci.join(",");
  if (cache.has(cleCache(cle))) return cache.get(cleCache(cle));
  const url = `${BASE}/lichess?variant=standard&speeds=${SPEEDS}&ratings=${RATINGS}&moves=12&topGames=0&recentGames=0&play=${cle}`;
  for (let essai = 0; essai < 10; essai++) {
    await dodo(PAUSE);
    const r = await fetch(url, { headers: E.LICHESS_TOKEN ? { Authorization: "Bearer " + E.LICHESS_TOKEN } : {} });
    if (r.status === 429) { console.log("  (limite de débit : pause 90 s — le cache est conservé, tu peux aussi Ctrl+C et relancer plus tard)"); writeFileSync(FICHIER_CACHE, JSON.stringify(Object.fromEntries(cache))); await dodo(90000); continue; }
    if (r.status === 401) { console.error("✗ 401 : jeton manquant ou invalide (variable LICHESS_TOKEN)."); process.exit(1); }
    if (!r.ok) throw new Error(`HTTP ${r.status} pour ${url}`);
    const j = await r.json();
    cache.set(cleCache(cle), j);
    if (++demandes % 10 === 0) writeFileSync(FICHIER_CACHE, JSON.stringify(Object.fromEntries(cache)));
    return j;
  }
  writeFileSync(FICHIER_CACHE, JSON.stringify(Object.fromEntries(cache)));
  throw new Error("Lichess limite trop fort : relance dans quelques minutes (le cache reprend où ça s'est arrêté).");
}

const total = (m) => m.white + m.draws + m.black;
const uci = (m) => m.from + m.to + (m.promotion || "");
const sorties = {};

for (const o of OUVERTURES) {
  if (ONLY && !ONLY.includes(o.id)) continue;
  const moi = o.camp === "blancs" ? "w" : "b";
  // Arbre de mes coups curés : position (liste de SAN) → coup curé
  const guide = new Map();
  for (const l of o.lignes) {
    const coups = l.coups.split(/\s+/).filter(Boolean);
    for (let i = 0; i < coups.length; i++) { const k = coups.slice(0, i).join(" "); if (!guide.has(k)) guide.set(k, coups[i]); }
  }
  const curees = o.lignes.map((l) => l.coups.split(/\s+/).filter(Boolean).join(" "));
  const feuilles = [];
  console.log(`\n▶ ${o.id}`);

  async function descendre(san, ucis, freq, parts) {
    const c = new Chess();
    for (const s of san) c.move(s);
    if (san.length >= PROF || c.isGameOver()) return feuilles.push({ san, freq, parts });
    const d = await explorer(ucis);
    const n = total(d);
    if (n < PARTIES_MIN || !d.moves.length) return feuilles.push({ san, freq, parts, n });
    if (c.turn() === moi) {
      const k = san.join(" ");
      let coup = guide.get(k);
      if (!coup) coup = d.moves[0].san; // hors répertoire curé : le coup le plus joué
      const m = c.move(coup); // lève si illégal
      return descendre([...san, m.san], [...ucis, uci(m)], freq, parts);
    }
    const candidats = d.moves.filter((m) => (total(m) / n) * 100 >= SEUIL).slice(0, BRANCHES);
    if (!candidats.length) return feuilles.push({ san, freq, parts, n });
    for (const m of candidats) {
      const part = total(m) / n;
      const cc = new Chess(); for (const s of san) cc.move(s);
      const jm = cc.move(m.san);
      await descendre([...san, jm.san], [...ucis, uci(jm)], freq * part, [...parts, { ply: san.length + 1, san: jm.san, pct: Math.round(part * 1000) / 10, n: total(m), blancs: m.white, nulles: m.draws, noirs: m.black }]);
    }
  }
  await descendre([], [], 1, []);
  const lignes = feuilles
    .map((f) => ({ pgn: f.san.join(" "), freq: Math.round(f.freq * 10000) / 100, coups: f.parts }))
    .filter((l) => l.pgn.split(" ").length >= 6)
    .sort((a, b) => b.freq - a.freq);
  sorties[o.id] = lignes;
  console.log(`   ${lignes.length} lignes ; la plus courante : ${lignes[0]?.pgn.split(" ").slice(0, 10).join(" ")}… (${lignes[0]?.freq} %)`);
  writeFileSync(join(ROOT, "tools", "explorer.json"), JSON.stringify({ ratings: RATINGS, speeds: SPEEDS, date: new Date().toISOString().slice(0, 10), ouvertures: sorties }, null, 1));
}
writeFileSync(FICHIER_CACHE, JSON.stringify(Object.fromEntries(cache)));
console.log("\ntools/explorer.json écrit. Lance maintenant : node tools/build-data.mjs");
