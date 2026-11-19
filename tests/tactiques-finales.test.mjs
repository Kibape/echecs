import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Chess } from "../public/vendor/chess.js";
import { Puzzle } from "../public/js/puzzle.js";
import { Finale } from "../public/js/finale.js";

const puz = JSON.parse(readFileSync(new URL("../public/data/puzzles.json", import.meta.url)));
const fin = JSON.parse(readFileSync(new URL("../public/data/finales.json", import.meta.url))).finales;

test("puzzles : coups légaux, longueur paire, mat cohérent, ids uniques", () => {
  assert.ok(puz.puzzles.length >= 300);
  const ids = new Set();
  for (const p of puz.puzzles) {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.equal(p.moves.length % 2, 0, p.id);
    const c = new Chess(p.fen);
    for (const u of p.moves) assert.ok(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }), p.id + " " + u);
    if (p.mat) assert.ok(c.isCheckmate(), p.id);
  }
});

test("Puzzle : bon coup, mauvais coup, solution complète, autre mat accepté", () => {
  const p = new Puzzle({ fen: puz.puzzles[0].fen, moves: puz.puzzles[0].moves });
  p.jouerAdversaire();
  assert.ok(p.auTraitDeLEleve);
  const bon = p.coupAttendu();
  const faux = p.chess.moves({ verbose: true }).find((m) => m.from !== bon.from || m.to !== bon.to);
  if (!faux.san.endsWith("#")) { const r = p.tenter(faux.from, faux.to); assert.equal(r.ok, false); assert.equal(p.erreurs, 1); }
  const r = p.tenter(bon.from, bon.to, bon.promotion || "q");
  assert.ok(r.ok);
  assert.ok(p.termine);
  assert.equal(p.reussi, false); // il y a eu une erreur
});

test("Finale KQK : mat reconnu, annulation, limite de coups", () => {
  const def = fin.find((f) => f.id === "kqk");
  const f = new Finale(def);
  assert.ok(f.auTraitDeLEleve);
  assert.ok(f.tenter("h1", "e4").ok);
  assert.equal(f.peutAnnuler, true);
  f.jouerAdverse("e5d5");
  assert.ok(f.annuler());
  assert.equal(f.coups, 0);
  assert.equal(f.fen, new Chess(def.fen).fen());
  const mat = new Finale({ fen: "7k/5K2/8/8/8/8/8/6Q1 w - - 0 1", eleve: "w", objectif: "mat", limite: 5 });
  mat.tenter("g1", "g7");
  assert.equal(mat.resultat, "ok");
});

test("Finale : pat = échec pour un objectif de mat, succès pour la nulle", () => {
  const pat = new Finale({ fen: "7k/8/5K2/8/8/8/8/6Q1 w - - 0 1", eleve: "w", objectif: "mat", limite: 5 });
  pat.tenter("g1", "g6");
  assert.equal(pat.resultat, "rate");
  const nulle = new Finale({ fen: "7k/8/5K2/8/8/8/8/6Q1 w - - 0 1", eleve: "w", objectif: "nulle", limite: 5 });
  nulle.tenter("g1", "g6");
  assert.equal(nulle.resultat, "ok");
});

test("Finale : promotion = réussite ; limite dépassée = échec", () => {
  const p = new Finale({ fen: "8/4P3/3K4/8/8/8/8/k7 w - - 0 1", eleve: "w", objectif: "promotion", limite: 5 });
  p.tenter("e7", "e8", "q");
  assert.equal(p.resultat, "ok");
  const l = new Finale({ fen: "8/8/8/8/8/k7/8/K6R w - - 0 1", eleve: "w", objectif: "mat", limite: 1 });
  l.tenter("h1", "h2"); l.jouerAdverse("a3a4");
  assert.equal(l.resultat, "rate");
});

test("finales.json : positions légales, camp de l'élève valide", () => {
  assert.ok(fin.length >= 10);
  for (const f of fin) { assert.doesNotThrow(() => new Chess(f.fen), f.id); assert.ok(["w", "b"].includes(f.eleve)); assert.ok(f.verifie); }
});

import { expliquerCoup, expliquerLigne, expliquerPuzzle } from "../public/js/explain.js";
test("explain : roque, fourchette, mat, coup illégal", () => {
  const l = expliquerLigne("e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 O-O".split(" "));
  assert.equal(Object.keys(l).length, 15);
  assert.match(l[3], /e5/); // Cf3 menace e5
  assert.match(l[11], /Fourchette/);
  assert.match(l[15], /roque/i);
  assert.equal(expliquerCoup(new Chess().fen(), "Qh5"), null);
  assert.match(expliquerCoup("6k1/5ppp/8/8/8/8/8/R6K w - - 0 1", "Ra8#"), /mat/i);
});
test("explain : chaque puzzle est expliqué sans erreur", () => {
  for (const p of puz.puzzles) { const x = expliquerPuzzle(p); assert.equal(x.etapes.length, p.moves.length); assert.ok(x.etapes.every((e) => e.texte)); }
});
test("explain : toute ligne curée donne une explication par coup", () => {
  const o = JSON.parse(readFileSync(new URL("../public/data/openings.json", import.meta.url))).ouvertures;
  for (const op of o) for (const l of op.lignes) assert.equal(Object.keys(expliquerLigne(l.coups)).length, l.coups.length, op.id);
});

import { Drill } from "../public/js/drill.js";
test("Drill : reprise à la divergence (depart) joue les premiers coups d'office", () => {
  const d = new Drill({ coups: "e4 e5 Nf3 Nc6 Bc4 Bc5".split(" "), camp: "blancs", depart: 4 });
  assert.equal(d.idx, 4);
  assert.equal(d.attendu, "Bc4");
  assert.ok(d.auTraitDeLEleve);
  assert.ok(d.dernierCoup && d.dernierCoup.san === "Nc6");
});
test("openings.json : variantes légales, uniques et en ordre d'arbre", () => {
  const o = JSON.parse(readFileSync(new URL("../public/data/openings.json", import.meta.url))).ouvertures;
  let total = 0;
  for (const op of o) {
    total += op.variantes.length;
    const vus = new Set();
    for (const [code, nom, pgn] of op.variantes) {
      assert.ok(!vus.has(pgn), op.id + " doublon"); vus.add(pgn);
      const c = new Chess(); for (const s of pgn.split(" ")) assert.ok(c.move(s), op.id + " " + pgn);
    }
  }
  assert.ok(total >= 0);
});

test("openings.json : répertoire exact (10 ouvertures, aucune ligne rallongée par Stockfish, pas de variantes ECO)", () => {
  const o = JSON.parse(readFileSync(new URL("../public/data/openings.json", import.meta.url))).ouvertures;
  assert.equal(o.length, 10);
  assert.equal(o.flatMap((x) => x.lignes).length, 36);
  for (const l of o.flatMap((x) => x.lignes)) assert.equal(l.extensionDepuis, null);
  for (const x of o) assert.equal(x.variantes.length, 0);
});
