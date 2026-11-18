import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { Chess } from "../public/vendor/chess.js";
import { winPct, versBlancs, partBlancs, texteScore, phraseScore, moveAccuracy } from "../public/js/evalmath.js";
import { carteNeuve, noter, estDue, statut, qualite } from "../public/js/srs.js";
import { Drill, positionsDeLigne } from "../public/js/drill.js";
import { sanFr, ligneFr } from "../public/js/notation.js";
import { Store } from "../public/js/store.js";
import { Engine } from "../public/js/engine.js";

const require = createRequire(import.meta.url);
const data = JSON.parse(readFileSync(new URL("../public/data/openings.json", import.meta.url), "utf8"));
const eco = JSON.parse(readFileSync(new URL("../public/data/eco.json", import.meta.url), "utf8"));

test("winPct : formule Lichess", () => {
  assert.equal(winPct(0), 50);
  assert.ok(Math.abs(winPct(100) - 59.1) < 0.2);
  assert.ok(Math.abs(winPct(-100) - 40.9) < 0.2);
  assert.ok(winPct(1000) > 95 && winPct(-1000) < 5);
});

test("moveAccuracy : pas de perte = ~100 %", () => {
  assert.ok(moveAccuracy(50, 50) > 99.9);
  assert.ok(moveAccuracy(50, 10) < 40);
});

test("score : point de vue des Blancs, barre et texte", () => {
  assert.deepEqual(versBlancs({ cp: 50 }, "w"), { cp: 50 });
  assert.deepEqual(versBlancs({ cp: 50 }, "b"), { cp: -50 });
  assert.equal(texteScore({ cp: 34 }), "+0.3");
  assert.equal(texteScore({ cp: -120 }), "-1.2");
  assert.equal(texteScore({ cp: 0 }), "0.0");
  assert.equal(texteScore(versBlancs({ mate: 3 }, "b")), "-M3");
  assert.equal(partBlancs(versBlancs({ mate: 2 }, "w")), 100);
  assert.equal(partBlancs(versBlancs({ mate: 2 }, "b")), 0);
  // mat sur l'échiquier : le camp au trait est mat
  assert.equal(partBlancs(versBlancs({ mate: 0 }, "b")), 100);
  assert.equal(partBlancs(versBlancs({ mate: 0 }, "w")), 0);
  assert.equal(texteScore(versBlancs({ mate: 0 }, "b")), "1-0");
  assert.match(phraseScore({ cp: 20 }), /équilibrée/);
});

test("notation française", () => {
  assert.equal(sanFr("Nf3"), "Cf3");
  assert.equal(sanFr("Bxf7+"), "Fxf7+");
  assert.equal(sanFr("Qxf7#"), "Dxf7#");
  assert.equal(sanFr("Rae1"), "Tae1");
  assert.equal(sanFr("Kf1"), "Rf1");
  assert.equal(sanFr("e8=Q"), "e8=D");
  assert.equal(sanFr("O-O-O"), "O-O-O");
  assert.equal(ligneFr(["e4", "e5", "Nf3"]), "1. e4 e5 2. Cf3");
});

test("SRS : intervalles et échecs", () => {
  const t0 = 1_000_000;
  let c = carteNeuve(t0);
  assert.ok(estDue(c, t0));
  c = noter(c, 5, t0); assert.equal(c.intervalle, 1);
  c = noter(c, 5, t0); assert.equal(c.intervalle, 3);
  c = noter(c, 5, t0); assert.ok(c.intervalle >= 7);
  const avant = c.facilite;
  c = noter(c, 1, t0);
  assert.equal(c.reps, 0);
  assert.equal(c.echecs, 1);
  assert.ok(c.facilite < avant);
  assert.ok(c.echeance - t0 <= 10 * 60 * 1000);
  assert.equal(statut(null).code, "nouveau");
  assert.equal(qualite(0, 0), 5);
  assert.equal(qualite(1, 0), 3);
  assert.equal(qualite(2, 0), 1);
  assert.equal(qualite(9, 0), 0);
});

test("Store : sauvegarde, export/import, données corrompues", () => {
  const mem = new Map();
  const stockage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = new Store(stockage);
  assert.equal(s.reglages.elo, 400);
  s.setReglage("elo", 800);
  s.setCarte("x#0", carteNeuve(5));
  const s2 = new Store(stockage);
  assert.equal(s2.reglages.elo, 800);
  assert.ok(s2.carte("x#0"));
  const s3 = new Store({ getItem: () => "{pas du json", setItem() {} });
  assert.equal(s3.reglages.elo, 400);
  const s4 = new Store({ getItem: () => null, setItem() {} });
  s4.importer(s2.exporter());
  assert.equal(s4.reglages.elo, 800);
  assert.throws(() => s4.importer('{"v":2}'));
});

test("Drill (Blancs) : ligne écossaise complète", () => {
  const o = data.ouvertures.find((x) => x.id === "ecossaise");
  const l = o.lignes[0];
  const d = new Drill({ coups: l.coups, camp: "blancs", notes: l.notes });
  assert.equal(d.auTraitDeLEleve, true);
  let fini = false;
  while (!d.termine) {
    if (d.auTraitDeLEleve) {
      const m = d.coupAttendu();
      const r = d.tenter(m.from, m.to, m.promotion);
      assert.equal(r.ok, true);
      fini = r.termine;
    } else assert.ok(d.jouerAdversaire());
  }
  assert.equal(d.termine, true);
  assert.equal(d.qualite, 5);
});

test("Drill : erreur comptée, coup illégal ignoré, indice pénalisé", () => {
  const d = new Drill({ coups: "e4 e5 Nf3 Nc6".split(" "), camp: "blancs" });
  assert.deepEqual(d.tenter("e2", "e5"), { ok: false, illegal: true });
  assert.equal(d.erreurs, 0);
  const r = d.tenter("d2", "d4"); // légal mais pas dans la ligne
  assert.equal(r.ok, false); assert.equal(r.illegal, false); assert.equal(d.erreurs, 1);
  assert.equal(d.idx, 0, "le mauvais coup ne doit pas être joué");
  const ind = d.indice();
  assert.equal(ind.san, "e4"); assert.equal(d.aides, 1);
  assert.equal(d.qualite, 1);
  assert.equal(d.tenter("e2", "e4").ok, true);
  assert.equal(d.auTraitDeLEleve, false);
  assert.equal(d.tenter("e2", "e4").illegal, true, "pas son tour");
  assert.equal(d.jouerAdversaire().san, "e5");
});

test("Drill (Noirs) : les Blancs jouent en premier", () => {
  const d = new Drill({ coups: "e4 c6 d4 d5".split(" "), camp: "noirs" });
  assert.equal(d.auTraitDeLEleve, false);
  assert.equal(d.jouerAdversaire().san, "e4");
  assert.equal(d.auTraitDeLEleve, true);
  assert.equal(d.tenter("c7", "c6").ok, true);
  d.jouerAdversaire();
  assert.equal(d.tenter("d7", "d5").termine, true);
});

test("Drill : promotion et roque ne cassent rien", () => {
  const d = new Drill({ coups: "e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6".split(" "), camp: "blancs" });
  for (const [f, t] of [["e2", "e4"], ["g1", "f3"], ["f1", "c4"], ["e1", "g1"]]) {
    assert.equal(d.tenter(f, t).ok, true, `${f}${t}`);
    d.jouerAdversaire();
  }
  assert.equal(d.idx, 8);
  assert.equal(d.termine, true);
});

test("positionsDeLigne", () => {
  const p = positionsDeLigne("e4 e5 Nf3".split(" "));
  assert.equal(p.fens.length, 4);
  assert.equal(p.coups[2].san, "Nf3");
});

test("openings.json : intégrité du répertoire", () => {
  const ids = new Set();
  assert.ok(data.ouvertures.length >= 10);
  for (const o of data.ouvertures) {
    assert.ok(!ids.has(o.id), `id en double ${o.id}`); ids.add(o.id);
    assert.ok(["blancs", "noirs"].includes(o.camp));
    assert.ok(o.elo[0] <= o.elo[1]);
    for (const k of ["facilite", "puissance"]) assert.ok(o[k] >= 1 && o[k] <= 5, `${o.id}.${k}`);
    assert.ok(o.idee && o.plans.length && o.erreurs.length, o.id);
    for (const s of o.sources || []) assert.ok(data.sources[s], `source ${s}`);
    for (const l of o.lignes) {
      const c = new Chess();
      for (const san of l.coups) c.move(san);
      for (const k of Object.keys(l.notes)) assert.ok(+k >= 1 && +k <= l.coups.length, `${o.id}: note ${k}`);
    }
  }
});

test("eco.json : lignes rejouables", () => {
  assert.ok(eco.length > 3500);
  for (let i = 0; i < eco.length; i += 37) {
    const c = new Chess();
    for (const san of eco[i][2].split(" ")) c.move(san);
  }
});

test("Engine + vraie Stockfish (Node) : analyse, mat, annulation", async () => {
  const sf = require("stockfish");
  let t;
  const moteur = new Engine(() => {
    const inst = sf("lite-single", (ligne) => t.onmessage && t.onmessage(ligne));
    t = { send: (l) => inst.processCommand(l), onmessage: null, terminate: () => inst.terminate() };
    return t;
  });
  await moteur.init();

  const r = await moteur.analyser("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", { movetime: 300, depth: 12 });
  assert.ok(r && r.bestmove && /^[a-h][1-8][a-h][1-8]/.test(r.bestmove), JSON.stringify(r));
  assert.ok(Math.abs(r.scoreBlancs.cp) < 150);

  // Noirs au trait avec une dame de plus : le score doit être favorable aux Noirs (point de vue Blancs négatif)
  const r2 = await moteur.analyser("4k3/3q4/8/8/8/8/8/4K3 b - - 0 1", { movetime: 300, depth: 12 });
  assert.ok(r2.scoreBlancs.cp < -300 || r2.scoreBlancs.mate < 0, JSON.stringify(r2));

  // Mat en 1 pour les Blancs
  const r3 = await moteur.analyser("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", { movetime: 300, depth: 12 });
  assert.equal(r3.scoreBlancs.mate, 1, JSON.stringify(r3));
  assert.equal(r3.bestmove, "a1a8");

  // Annulation : la première promesse est résolue à null, la seconde aboutit
  const p1 = moteur.analyser("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", { movetime: 2000, depth: 30 });
  const p2 = moteur.analyser("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", { movetime: 300, depth: 12 });
  assert.equal(await p1, null);
  assert.equal((await p2).scoreBlancs.mate, 1);

  moteur.detruire();
});
