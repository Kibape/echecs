// Point d'entrée : relie données, échiquier, moteur, entraînement et interface.
// Lecture conseillée de bas en haut : helpers → moteur/barre → modes (découvrir, apprendre/réviser, libre) → panneaux → démarrage.
import { Chess } from "../vendor/chess.js";
import { Board } from "./board.js";
import { Engine, transportWorker } from "./engine.js";
import { Drill, positionsDeLigne } from "./drill.js";
import { Puzzle } from "./puzzle.js";
import { Finale } from "./finale.js";
import { expliquerLigne, expliquerPuzzle } from "./explain.js";
import { Store } from "./store.js";
import { carteNeuve, noter, estDue, statut } from "./srs.js";
import { versBlancs, partBlancs, texteScore, phraseScore } from "./evalmath.js";
import { sanFr, ligneFr, hashCourt } from "./notation.js";
import { Son } from "./sound.js";
import { Sync } from "./sync.js";

const $ = (s) => document.querySelector(s);

/** Crée un élément DOM de façon sûre (jamais d'innerHTML avec du texte venant des données). */
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style") e.setAttribute("style", v);
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(2)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

const etoiles = (n) => h("span", { class: "etoiles", title: `${n}/5` }, "★".repeat(n), h("span", { class: "off" }, "★".repeat(5 - n)));
const pastille = (t, cls = "") => h("span", { class: "pastille " + cls }, t);
const campIcone = (camp) => (camp === "blancs" ? "♔ Blancs" : "♚ Noirs");
const MODES = { decouvrir: "Découvrir", apprendre: "Apprendre", reviser: "Réviser", libre: "Analyse libre" };

// ───────────────────────── État global ─────────────────────────
const S = {
  data: null, eco: null, store: null, moteur: null, moteurPret: false,
  onglet: "ouvertures", detailId: null,
  ctx: null, mode: null, drill: null, decouv: null, libre: null,
  session: null, timer: null, verrou: false, erreursCoup: 0, evalToken: 0,
  phrase: "", fleche: true, premove: null,
  puz: { filtre: { theme: null, niveau: 0 }, courant: null }, puzzles: null, serie: 0, puzzleFini: false, puzzleRate: false, indiceNiv: 0,
  finales: null, finale: null,
  lib: { q: "", vol: "tous", camp: "blancs", limite: 60 },
};
window.__app = S; window.__son = Son; // pratique pour déboguer et tester dans la console du navigateur
let board;

// ───────────────────────── Messages ─────────────────────────
/** Affiche un message sous l'échiquier, avec éventuellement des boutons [libellé, fonction, primaire?]. */
function msg(texte, type = "info", actions = []) {
  const m = $("#message");
  m.className = "message " + type;
  m.replaceChildren(texte);
  if (actions.length) {
    m.append(h("div", { class: "actions" }, actions.map(([l, fn, p]) => h("button", { class: p ? "primaire" : "", on: { click: fn } }, l))));
  }
}

function montrerNote(texte) {
  const n = $("#note");
  n.hidden = !texte;
  n.textContent = texte || "";
}

// ───────────────────────── Premove ─────────────────────────
/** Coups possibles pour l'élève PENDANT le tour de l'adversaire : on fait comme si c'était à lui de jouer. */
function ciblesPremove(fen, from, couleur) {
  try {
    const f = fen.split(" ");
    f[1] = couleur; f[3] = "-"; // trait à l'élève, pas de prise en passant
    return new Chess(f.join(" ")).moves({ square: from, verbose: true });
  } catch { return []; }
}

function annulerPremove() {
  if (!S.premove) return;
  S.premove = null;
  board.effacerPremove();
}

/** Joue le premove en attente (appelé dès que l'adversaire a joué). S'il n'est plus légal, il est simplement ignoré. */
function lancerPremove() {
  const pm = S.premove;
  if (!pm) return;
  S.premove = null;
  board.effacerPremove();
  if (S.drill && S.drill.auTraitDeLEleve) { board.instantane = true; try { surCoup(pm.from, pm.to, pm.promotion); } finally { board.instantane = false; } }
}

// ───────────────────────── Moteur + barre d'évaluation ─────────────────────────
/** Démarre Stockfish en arrière-plan ; l'app reste utilisable sans lui. */
async function initMoteur() {
  const st = $("#moteur-statut");
  try {
    S.moteur = new Engine(() => transportWorker("vendor/stockfish-19-lite-single.js"));
    await S.moteur.init();
    S.moteurPret = true;
    st.textContent = "Stockfish 19 (lite) prêt";
    st.className = "statut ok";
    majEval();
  } catch (e) {
    st.textContent = "Moteur indisponible : la barre d'évaluation est désactivée";
    st.className = "statut mal";
    console.warn("Stockfish :", e);
  }
}

function fenCourant() {
  if (S.libre) return S.libre.fen();
  if (S.drill) return S.drill.fen;
  if (S.decouv) return S.decouv.fens[S.decouv.i];
  return new Chess().fen();
}

function majBarreOrientation() {
  $("#barre").dataset.finBlanc = board.orientation === "w" ? "bas" : "haut";
}

/** Met à jour la barre à partir d'un score "point de vue des Blancs". */
function afficherScore(scoreBlancs, profondeur) {
  const part = partBlancs(scoreBlancs);
  const barre = $("#barre");
  barre.classList.remove("masquee");
  barre.querySelector(".blanc").style.height = part.toFixed(1) + "%";
  barre.dataset.leader = part >= 50 ? "blancs" : "noirs";
  $("#texte-barre").textContent = texteScore(scoreBlancs);
  S.phrase = phraseScore(scoreBlancs) + (profondeur ? ` (profondeur ${profondeur})` : "");
  $("#phrase-eval").textContent = S.phrase;
}

/** Lance l'analyse de la position courante (annule l'analyse précédente). */
function majEval(fen = fenCourant()) {
  if (S.mode === "finale") return; // les finales gèrent leur analyse (note du coup + réponse adverse)
  const mon = ++S.evalToken;
  if (S.mode === "tactique" && !S.puzzleFini) { // l'évaluation trahirait la réponse : on la cache jusqu'à la fin du puzzle
    $("#barre").classList.add("masquee");
    $("#barre").querySelector(".blanc").style.height = "50%";
    $("#texte-barre").textContent = "?";
    $("#phrase-eval").textContent = "Évaluation cachée pendant le puzzle.";
    return;
  }
  const c = new Chess(fen);
  if (c.isCheckmate()) { afficherScore(versBlancs({ mate: 0 }, c.turn())); return; }
  if (c.isDraw() || c.isStalemate()) {
    $("#barre").querySelector(".blanc").style.height = "50%";
    $("#texte-barre").textContent = "½";
    $("#phrase-eval").textContent = "Partie nulle.";
    return;
  }
  if (!S.moteur || !S.moteurPret) return;
  S.moteur.analyser(fen, {
    movetime: 600, depth: 18,
    onUpdate: (r) => { if (mon === S.evalToken) afficherScore(r.scoreBlancs, r.depth); },
  }).then((r) => {
    if (!r || mon !== S.evalToken) return;
    afficherScore(r.scoreBlancs, r.depth);
    if (S.mode === "libre" && S.fleche && r.bestmove) meilleurCoup(fen, r.bestmove);
  });
}

/** Dessine la flèche verte du meilleur coup (analyse libre uniquement). */
function meilleurCoup(fen, uci) {
  const c = new Chess(fen);
  const from = uci.slice(0, 2), to = uci.slice(2, 4);
  let san = null;
  try { san = c.move({ from, to, promotion: uci[4] }).san; } catch { return; }
  board.effacerFleches();
  board.fleche(from, to, "moteur");
  $("#phrase-eval").textContent = `${S.phrase} — meilleur coup : ${sanFr(san)}`;
}

// ───────────────────────── Contextes de lignes (ce qu'on peut entraîner) ─────────────────────────
const metaDe = (ctx) => ({ titre: ctx.titre, sousTitre: ctx.sousTitre, camp: ctx.camp, coups: ctx.coups.join(" ") });

function ctxCurated(o, i) {
  const l = o.lignes[i];
  return { id: `${o.id}#${i}`, titre: o.nom, sousTitre: l.nom, camp: o.camp, coups: l.coups, notes: l.notes || {}, ouverture: o };
}

function ctxEco(entree, camp) {
  const coups = entree.pgn.split(" ");
  return { id: `eco:${entree.code}:${hashCourt(entree.pgn)}:${camp[0]}`, titre: entree.nom, sousTitre: entree.code, camp, coups, notes: {}, ouverture: null };
}

/** Première position où deux lignes (listes de coups SAN) diffèrent = nombre de demi-coups communs. */
function divergence(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Une variante de la famille d'une ouverture ; `depart` = demi-coups joués d'office (reprise à la divergence). */
function ctxVariante(o, v, depart) {
  const c = ctxEco({ code: v[0], nom: v[1], pgn: v[2] }, o.camp);
  return { ...c, titre: `${o.nom} — ${v[1]}`, ouverture: o, depart };
}

/** Lance la variante i d'une liste ; avec `partiel`, on reprend là où elle diffère de la précédente. */
function lancerVariante(o, i, mode, partiel) {
  const liste = o.variantes;
  const cur = liste[i][2].split(" ");
  const depart = partiel && i > 0 ? Math.min(divergence(liste[i - 1][2].split(" "), cur), cur.length - 1) : 0;
  S.chaine = { o, i, mode, partiel };
  lancer(ctxVariante(o, liste[i], depart), mode);
}

/** "3. Cf3 Cc6" ou "3...Cc6" à partir du demi-coup `depuis` (0-based). */
function ligneDepuis(coups, depuis, max = 8) {
  const parts = [];
  for (let i = depuis; i < Math.min(coups.length, depuis + max); i++) {
    if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
    else if (i === depuis) parts.push(`${(i - 1) / 2 + 1}...`);
    parts.push(sanFr(coups[i]));
  }
  return parts.join(" ") + (coups.length > depuis + max ? " …" : "");
}

/** Supprime les cartes de révision qui ne correspondent plus à une ligne du répertoire actuel (anciennes ouvertures, lignes remplacées). */
function nettoyerCartes() {
  const cartes = S.store.data.cartes;
  let change = false;
  for (const [id, c] of Object.entries(cartes)) {
    const [oid, i] = id.split("#");
    const o = S.data.ouvertures.find((x) => x.id === oid);
    const l = o && o.lignes[+i];
    if (l && c.meta && c.meta.sousTitre === l.nom) continue;
    delete cartes[id]; change = true;
  }
  if (change) S.store.sauver(true);
}

function ctxDepuisCarte(id, carte) {
  if (id.includes("#")) {
    const [oid, i] = id.split("#");
    const o = S.data.ouvertures.find((x) => x.id === oid);
    if (o && o.lignes[+i]) return ctxCurated(o, +i);
  }
  const m = carte && carte.meta;
  if (!m) return null;
  return { id, titre: m.titre, sousTitre: m.sousTitre, camp: m.camp, coups: m.coups.split(" "), notes: {}, ouverture: null };
}

// ───────────────────────── Modes ─────────────────────────
function quitterMode() {
  clearTimeout(S.timer);
  annulerPremove();
  S.drill = S.decouv = S.libre = null;
  S.ctx = S.mode = null;
  S.verrou = false;
  board.autorise = null;
  board.effacerFleches();
  board.effacerSelection();
  montrerNote(null);
  majControles();
}

/** Point d'entrée commun : démarre une ligne dans un mode. */
function lancer(ctx, mode) {
  quitterMode();
  ctx.notes = { ...expliquerLigne(ctx.coups), ...(ctx.notes || {}) }; // explication auto de chaque coup ; les notes rédigées à la main passent devant
  S.ctx = ctx; S.mode = mode; S.erreursCoup = 0;
  board.marquerDernier();
  board.orienter(ctx.camp === "blancs" ? "w" : "b");
  majBarreOrientation();
  if (mode === "decouvrir") {
    const p = positionsDeLigne(ctx.coups);
    S.decouv = { fens: p.fens, coups: p.coups, i: 0 };
    board.setFen(p.fens[0]);
    allerA(0, false);
    msg("Mode découverte : parcours la ligne avec ◀ ▶ (ou les flèches du clavier) et lis les notes.", "info");
  } else {
    S.drill = new Drill({ coups: ctx.coups, camp: ctx.camp, notes: ctx.notes, depart: ctx.depart || 0 });
    board.setFen(S.drill.fen);
    if (S.drill.dernierCoup) board.marquerDernier(S.drill.dernierCoup.from, S.drill.dernierCoup.to);
    majEval(S.drill.fen);
    demarrerTour();
  }
  majControles();
  renderPanneau();
}

// ----- Découvrir -----
function allerA(i, anime = true) {
  const D = S.decouv;
  i = Math.max(0, Math.min(D.coups.length, i));
  const prec = D.i;
  D.i = i;
  if (anime && i === prec + 1) board.jouer(D.coups[prec]);
  else {
    board.setFen(D.fens[i]);
    if (i > 0) board.marquerDernier(D.coups[i - 1].from, D.coups[i - 1].to); else board.marquerDernier();
  }
  montrerNote(S.ctx.notes[i] || null);
  majEval(D.fens[i]);
  majControles();
  renderPanneau();
}

// ----- Apprendre / Réviser -----
/** Donne la main à l'élève, ou joue le coup de l'adversaire (après un court délai). */
function demarrerTour() {
  const d = S.drill;
  if (!d) return;
  if (d.termine) { if (S.mode === "tactique") finPuzzle(); else if (S.mode === "finale") finFinale(); else finLigne(); return; }
  if (!d.auTraitDeLEleve) {
    board.autorise = d.couleur; // permet de préparer un premove pendant que l'adversaire "réfléchit"
    S.verrou = true;
    if (S.mode === "finale") { tourMoteurFinale(); return; }
    msg("L'adversaire joue… Tu peux déjà préparer ton coup (premove).", "info");
    S.timer = setTimeout(() => {
      if (!S.drill) return;
      const m = d.jouerAdversaire();
      if (m) { board.jouer(m); majEval(d.fen); montrerNote(d.note); }
      S.verrou = false;
      demarrerTour();
      lancerPremove();
      board.rafraichirSelection();
    }, 450);
    return;
  }
  board.autorise = d.couleur;
  S.erreursCoup = 0; S.indiceNiv = 0;
  board.effacerFleches();
  if (S.mode === "apprendre") {
    const m = d.coupAttendu();
    board.fleche(m.from, m.to, "indice");
    const why = S.ctx.notes[d.idx + 1];
    msg(h("span", {}, `À toi : joue le coup indiqué par la flèche (${sanFr(m.san)}).`, why ? h("div", { class: "pourquoi" }, "Pourquoi ce coup : " + why) : ""), "info");
  } else if (S.mode === "tactique") {
    msg(`Trouve le meilleur coup pour les ${d.couleur === "w" ? "Blancs" : "Noirs"}.`, "info");
  } else if (S.mode === "finale") {
    msgFinale();
  } else {
    msg(`À toi de jouer (coup ${Math.floor(d.idx / 2) + 1}) : quel est le coup de la ligne ?`, "info");
  }
  majControles();
  renderPanneau();
}

/** Appelé par l'échiquier quand l'élève lâche une pièce. Renvoie true si le coup est accepté. */
function surCoup(from, to, promotion) {
  if (S.mode === "libre") {
    try {
      const m = S.libre.move({ from, to, promotion });
      board.effacerFleches();
      board.jouer(m);
      majEval();
      majControles();
      renderPanneau();
      return true;
    } catch { return false; }
  }
  if (!S.drill) return false;
  if (S.verrou) { // tour de l'adversaire : on prépare un premove (la pièce revient, le coup partira tout seul)
    if (!ciblesPremove(S.drill.fen, from, S.drill.couleur).some((m) => m.to === to)) return false;
    S.premove = { from, to, promotion };
    board.marquerPremove(from, to);
    Son.premove();
    return false;
  }
  const r = S.drill.tenter(from, to, promotion || "q");
  if (r.ok) { apresCoupEleve(r); return true; }
  if (r.illegal) return false;
  // coup légal mais pas celui de la ligne : pastille ✕ sur la case + son (plus de tremblement)
  S.erreursCoup++;
  board.badge(to, "x");
  Son.erreur();
  if (S.mode === "tactique") {
    msg(S.erreursCoup >= 3 ? "Toujours pas… tu peux demander un indice ou voir la solution." : "Ce n'est pas le bon coup. Réessaie !", "mal");
    return false;
  }
  if (S.erreursCoup >= 2) {
    const m = S.drill.coupAttendu();
    board.effacerFleches();
    board.fleche(m.from, m.to, "indice");
    const why = S.ctx.notes[S.drill.idx + 1];
    msg(h("span", {}, `Ce n'est pas ça. Le coup de la ligne est ${sanFr(m.san)} (flèche bleue).`, why ? h("div", { class: "pourquoi" }, why) : ""), "mal");
  } else {
    msg("Ce n'est pas le coup de la ligne. Réessaie !", "mal");
  }
  return false;
}

function apresCoupEleve(r) {
  if (S.mode === "finale") S.finale.dernierEleve = true;
  board.effacerFleches();
  board.jouer(r.coup);
  if (S.mode !== "finale") majEval(S.drill.fen);
  montrerNote(r.note);
  demarrerTour(); // tout de suite : le délai de l'adversaire est géré dedans, et le premove reste possible
}

function indice() {
  if (!S.drill || !S.drill.auTraitDeLEleve) return;
  const m = S.drill.indice();
  board.effacerFleches();
  if (S.mode === "tactique") { // indice en 2 temps : d'abord la pièce, puis le coup
    S.indiceNiv++;
    if (S.indiceNiv === 1) { board.surligner(m.from, "bleu"); msg("Indice : regarde cette pièce… (re-clique sur Indice pour voir le coup)", "info"); }
    else { board.fleche(m.from, m.to, "indice"); msg(`Indice : ${sanFr(m.san)}.`, "info"); }
    return;
  }
  board.fleche(m.from, m.to, "indice");
  msg(`Indice : ${sanFr(m.san)} (cela compte comme une aide dans ta note).`, "info");
}

function voirLeCoup() {
  if (S.mode === "tactique") { voirSolution(); return; }
  if (S.mode === "finale") { indiceFinale(); return; }
  if (!S.drill || !S.drill.auTraitDeLEleve || S.verrou) return;
  const m = S.drill.indice();
  const r = S.drill.tenter(m.from, m.to, m.promotion || "q");
  if (r.ok) apresCoupEleve(r);
}

/** Fin d'une ligne : note SRS + boutons de suite. */
function finLigne() {
  board.autorise = null;
  board.effacerFleches();
  const d = S.drill, ctx = S.ctx;
  let texte, type = "ok";
  if (ctx.depart > 0) { // entraînement partiel : ne compte pas dans les révisions (la ligne entière n'a pas été rejouée)
    texte = d.erreurs || d.aides ? `Variante terminée (${d.erreurs} erreur(s), ${d.aides} indice(s)). Entraînement partiel : non compté dans les révisions.` : "Parfait depuis la divergence ! Entraînement partiel : non compté dans les révisions (lance « Ligne entière » pour l'enregistrer).";
    if (d.erreurs > 1) type = "mal";
  } else if (S.mode === "reviser") {
    const q = d.qualite;
    const base = S.store.carte(ctx.id) || carteNeuve();
    const nouvelle = { ...noter(base, q), meta: metaDe(ctx) };
    S.store.setCarte(ctx.id, nouvelle);
    if (q >= 5) texte = "Parfait ! Aucune erreur ni indice. Prochaine révision dans " + nouvelle.intervalle + " j.";
    else if (q >= 3) texte = `Bien joué (${d.erreurs} erreur, ${d.aides} indice). Prochaine révision dans ${nouvelle.intervalle} j.`;
    else { texte = "Ligne ratée : elle reviendra dans 10 minutes. Refais-la en mode « Apprendre » si besoin."; type = "mal"; }
  } else {
    if (!S.store.carte(ctx.id)) S.store.setCarte(ctx.id, { ...noter(carteNeuve(), 3), meta: metaDe(ctx) });
    texte = "Ligne terminée ! Passe en mode « Réviser » pour la retenir sans les flèches.";
  }
  const actions = [];
  const C = S.chaine;
  if (C && C.i + 1 < C.o.variantes.length) actions.push([`Variante suivante (${C.i + 2}/${C.o.variantes.length})`, () => lancerVariante(C.o, C.i + 1, C.mode, C.partiel), true]);
  else if (C) actions.push(["Retour à l'ouverture", retour, true]);
  if (S.session) {
    const reste = S.session.i + 1 < S.session.ids.length;
    actions.push([reste ? "Carte suivante" : "Terminer la session", suivanteSession, true]);
  }
  actions.push(["Recommencer", () => lancer(ctx, S.mode)], ["Analyse libre", passerLibre]);
  if (ctx.depart > 0) actions.push(["Ligne entière", () => lancer({ ...ctx, depart: 0 }, S.mode)]);
  if (type === "ok") Son.ok(); else Son.erreur();
  msg(texte, type, actions);
  majBadge();
  majControles();
  renderPanneau();
}

// ----- Analyse libre -----
function passerLibre() {
  if (!S.ctx && !S.drill) return;
  clearTimeout(S.timer);
  S.libre = new Chess(fenCourant());
  S.drill = null; S.decouv = null;
  S.mode = "libre"; S.verrou = false;
  board.autorise = "both";
  board.effacerFleches();
  montrerNote(null);
  msg("Analyse libre : joue des coups pour les deux camps. La barre montre qui est mieux (Stockfish).", "info");
  majEval();
  majControles();
  renderPanneau();
}

function annulerLibre() {
  if (S.mode === "finale") return annulerFinale();
  if (!S.libre || !S.libre.history().length) return;
  S.libre.undo();
  board.setFen(S.libre.fen());
  const h2 = S.libre.history({ verbose: true });
  if (h2.length) board.marquerDernier(h2[h2.length - 1].from, h2[h2.length - 1].to); else board.marquerDernier();
  board.effacerFleches();
  majEval();
  majControles();
  renderPanneau();
}

// ----- Session de révision -----
function lancerSession() {
  const ids = Object.entries(S.store.data.cartes).filter(([, c]) => estDue(c)).sort((a, b) => a[1].echeance - b[1].echeance).map(([id]) => id);
  if (!ids.length) return;
  S.session = { ids, i: 0 };
  carteSession();
}

function carteSession() {
  while (S.session && S.session.i < S.session.ids.length) {
    const id = S.session.ids[S.session.i];
    const ctx = ctxDepuisCarte(id, S.store.carte(id));
    if (ctx) { lancer(ctx, "reviser"); return; }
    S.session.i++; // carte orpheline : on saute
  }
  finSession();
}

function suivanteSession() {
  S.session.i++;
  if (S.session.i >= S.session.ids.length) finSession(); else carteSession();
}

function finSession() {
  S.session = null;
  quitterMode();
  board.setFen(new Chess().fen());
  board.marquerDernier();
  msg("Session terminée. Bravo !", "ok");
  S.onglet = "revisions";
  majOnglets();
  renderPanneau();
}

// ───────────────────────── Contrôles sous l'échiquier ─────────────────────────
function majControles() {
  const m = S.mode, d = S.drill, D = S.decouv;
  const montre = (id, v) => { $(id).hidden = !v; };
  montre("#b-prec", m === "decouvrir"); montre("#b-suiv", m === "decouvrir");
  if (m === "decouvrir") { $("#b-prec").disabled = D.i === 0; $("#b-suiv").disabled = D.i >= D.coups.length; }
  const avecAide = m === "reviser" || m === "tactique";
  montre("#b-indice", avecAide); montre("#b-voir", avecAide || m === "finale");
  if (avecAide) { $("#b-indice").disabled = !d || !d.auTraitDeLEleve || S.verrou; $("#b-voir").disabled = m === "tactique" ? !d || d.termine || S.verrou : $("#b-indice").disabled; }
  if (m === "finale") { $("#b-voir").disabled = !d || !d.auTraitDeLEleve || S.verrou; }
  $("#b-voir").textContent = m === "tactique" ? "\u{1F441} Voir la solution" : m === "finale" ? "\u{1F4A1} Meilleur coup" : "\u{1F441} Voir le coup";
  montre("#b-recommencer", ["apprendre", "reviser", "decouvrir", "tactique", "finale"].includes(m));
  montre("#b-libre", m === "decouvrir" || ((["apprendre", "reviser", "tactique", "finale"].includes(m)) && d && d.termine));
  montre("#b-annuler", m === "libre" || m === "finale");
  if (m === "libre") $("#b-annuler").disabled = !S.libre.history().length;
  if (m === "finale") $("#b-annuler").disabled = !d || !d.peutAnnuler || S.verrou;
}

function brancherControles() {
  $("#b-retourner").onclick = () => { board.orienter(board.orientation === "w" ? "b" : "w"); majBarreOrientation(); };
  $("#b-prec").onclick = () => S.decouv && allerA(S.decouv.i - 1, false);
  $("#b-suiv").onclick = () => S.decouv && allerA(S.decouv.i + 1, true);
  $("#b-indice").onclick = indice;
  $("#b-voir").onclick = voirLeCoup;
  $("#b-recommencer").onclick = () => {
    if (S.mode === "tactique") lancerPuzzle(S.puz.courant);
    else if (S.mode === "finale") lancerFinale(S.finale.def);
    else if (S.ctx) lancer(S.ctx, S.mode);
  };
  $("#b-libre").onclick = passerLibre;
  $("#b-annuler").onclick = annulerLibre;
  const cs = $("#c-son");
  cs.checked = S.store.reglages.son !== false;
  Son.setActif(cs.checked);
  cs.onchange = () => { Son.debloquer(); Son.setActif(cs.checked); S.store.setReglage("son", cs.checked); if (cs.checked) Son.ok(); };
  const c = $("#c-fleche");
  c.checked = S.fleche;
  c.onchange = () => { S.fleche = c.checked; S.store.setReglage("fleche", S.fleche); if (!S.fleche) board.effacerFleches(); else if (S.mode === "libre") majEval(); };
  document.addEventListener("keydown", (e) => {
    if (S.mode !== "decouvrir" || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); allerA(S.decouv.i - 1, false); }
    if (e.key === "ArrowRight") { e.preventDefault(); allerA(S.decouv.i + 1, true); }
  });
}

// ───────────────────────── Panneau de droite ─────────────────────────
function majOnglets() {
  document.querySelectorAll("#onglets button[data-onglet]").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === S.onglet));
}

function majBadge() {
  const n = Object.values(S.store.data.cartes).filter((c) => estDue(c)).length;
  const b = $("#badge-dues");
  b.hidden = n === 0;
  b.textContent = n;
}

function renderPanneau() {
  document.body.dataset.mode = S.mode || "accueil"; // le CSS s'en sert (téléphone : plateau masqué hors exercice)
  const p = $("#panneau");
  if (S.mode === "tactique") return p.replaceChildren(panneauTactique());
  if (S.mode === "finale") return p.replaceChildren(panneauFinale());
  if (S.ctx && S.mode) return p.replaceChildren(panneauLigne());
  if (S.onglet === "tactiques") return p.replaceChildren(panneauTactiquesAccueil());
  if (S.onglet === "finales") return p.replaceChildren(panneauFinalesAccueil());
  if (S.onglet === "ouvertures") return p.replaceChildren(...(S.detailId ? [panneauDetail(S.data.ouvertures.find((o) => o.id === S.detailId))] : panneauOuvertures()));
  if (S.onglet === "bibliotheque") return p.replaceChildren(...panneauBibliotheque());
  if (S.onglet === "revisions") return p.replaceChildren(panneauRevisions());
}

function retour() {
  S.session = null;
  S.chaine = null;
  quitterMode();
  board.setFen(new Chess().fen());
  board.marquerDernier();
  board.orienter("w");
  majBarreOrientation();
  majEval(new Chess().fen());
  msg("");
  renderPanneau();
}

/** Panneau affiché pendant qu'on s'entraîne sur une ligne. */
function panneauLigne() {
  const ctx = S.ctx, o = ctx.ouverture;
  const coupsJoues = S.decouv ? S.decouv.i : S.drill ? S.drill.idx : S.libre ? 0 : 0;
  const bloc = h("div", {},
    h("button", { class: "petit", on: { click: retour } }, "← Retour"),
    h("h2", { style: "margin-top:10px" }, ctx.titre),
    h("div", { class: "petit-texte" }, ctx.sousTitre),
    h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin:8px 0" }, pastille(campIcone(ctx.camp)), pastille(MODES[S.mode], "info"),
      S.session ? pastille(`Révision ${S.session.i + 1}/${S.session.ids.length}`, "piege") : null),
  );
  if (ctx.depart > 0) bloc.append(h("div", { class: "message info" }, `Reprise au coup ${Math.floor(ctx.depart / 2) + 1}, là où cette variante diffère de la précédente. Déjà joué : ${ligneFr(ctx.coups, ctx.depart)}`));
  if (S.chaine) bloc.append(h("div", { class: "petit-texte" }, `Variante ${S.chaine.i + 1} / ${S.chaine.o.variantes.length} de l'enchaînement.`));
  if (o) bloc.append(h("h3", {}, "Idée"), h("p", {}, o.idee));
  if (S.mode === "decouvrir") {
    const D = S.decouv, kids = [];
    D.coups.forEach((m, i) => {
      if (i % 2 === 0) kids.push(h("span", { class: "num" }, `${i / 2 + 1}.`));
      kids.push(h("button", { class: i + 1 === D.i ? "cur" : "", on: { click: () => allerA(i + 1, false) } }, sanFr(m.san)));
    });
    bloc.append(h("h3", {}, "La ligne"), h("div", { class: "liste-coups" }, kids));
  } else if (S.mode === "libre") {
    const hist = S.libre.history();
    bloc.append(h("h3", {}, "Coups joués en analyse libre"), h("p", { class: "petit-texte" }, hist.length ? hist.map(sanFr).join(" ") : "Aucun pour l'instant."));
  } else {
    const d = S.drill;
    const joues = d.coups.slice(0, d.idx);
    bloc.append(h("h3", {}, "Progression"),
      h("p", {}, `${d.idx}/${d.coups.length} demi-coups`, d.erreurs ? ` · ${d.erreurs} erreur(s)` : "", d.aides ? ` · ${d.aides} indice(s)` : ""),
      h("div", { class: "petit-texte", style: "font-family:ui-monospace,Consolas,monospace" }, joues.length ? ligneFr(joues) : "—"));
  }
  void coupsJoues;
  return bloc;
}

// ----- Onglet Ouvertures : liste triée -----
function scoreReco(o, elo) {
  const adaptee = elo >= o.elo[0] && elo <= o.elo[1];
  return (o.facilite + o.puissance) / 2 + (adaptee ? 1 : 0) - (o.piege ? 0.75 : 0);
}

function listeOuvertures() {
  const R = S.store.reglages, elo = +R.elo || 0;
  const q = (R.recherche || "").trim().toLowerCase();
  let l = S.data.ouvertures.filter((o) => (R.camp === "tous" || o.camp === R.camp) && true);
  if (q) l = l.filter((o) => (o.nom + " " + o.eco).toLowerCase().includes(q));
  const tris = {
    recommande: (a, b) => scoreReco(b, elo) - scoreReco(a, elo) || b.facilite - a.facilite || a.nom.localeCompare(b.nom, "fr"),
    facile: (a, b) => b.facilite - a.facilite || b.puissance - a.puissance || a.nom.localeCompare(b.nom, "fr"),
    forte: (a, b) => b.puissance - a.puissance || b.facilite - a.facilite || a.nom.localeCompare(b.nom, "fr"),
    eco: (a, b) => a.eco.localeCompare(b.eco),
    nom: (a, b) => a.nom.localeCompare(b.nom, "fr"),
  };
  return l.sort(tris[R.tri] || tris.recommande);
}

function carteOuverture(o, elo) {
  const lignes = o.lignes.map((_, i) => S.store.carte(`${o.id}#${i}`));
  const apprises = lignes.filter((c) => c && c.reps > 0).length;
  const tropSimple = elo > o.elo[1];
  return h("button", { class: "carte" + (tropSimple ? " trop-simple" : ""), on: { click: () => { S.detailId = o.id; renderPanneau(); $("#panneau").scrollTop = 0; } } },
    h("div", { class: "titre" }, o.nom, o.piege ? pastille("Piège", "piege") : null, pastille(o.camp === "blancs" ? "♔" : "♚")),
    h("div", { class: "meta" },
      h("span", {}, `Niveau conseillé ${o.elo[0]}–${o.elo[1]} Elo`),
      h("span", {}, "Facilité ", etoiles(o.facilite)),
      h("span", {}, "Puissance ", etoiles(o.puissance)),
      h("span", {}, `Théorie ${o.theorie}`),
      pastille(o.eco),
      apprises ? pastille(`${apprises}/${o.lignes.length} apprise(s)`, "ok") : null,
      tropSimple ? pastille("trop simple pour toi ?") : null));
}

function panneauOuvertures() {
  const R = S.store.reglages;
  const liste = h("div", { class: "liste" });
  const compte = h("div", { class: "petit-texte", style: "margin:6px 2px" });
  const maj = () => {
    const l = listeOuvertures();
    liste.replaceChildren(...(l.length ? l.map((o) => carteOuverture(o, +R.elo || 0)) : [h("div", { class: "vide" }, "Aucune ouverture ne correspond.")]));
    compte.textContent = `${l.length} ouverture(s) — triées pour ${R.elo} Elo. Facilité et puissance : avis éditorial (voir README).`;
  };
  const filtres = h("div", { class: "filtres" },
    h("label", {}, "Mon Elo ", h("input", { type: "number", min: 0, max: 3000, step: 50, value: R.elo, on: { input: (e) => { S.store.setReglage("elo", Math.max(0, Math.min(3000, +e.target.value || 0))); maj(); } } })),
    h("label", {}, "Camp ", h("select", { on: { change: (e) => { S.store.setReglage("camp", e.target.value); maj(); } } },
      ...[["tous", "Tous"], ["blancs", "Blancs"], ["noirs", "Noirs"]].map(([v, t]) => h("option", { value: v, selected: R.camp === v }, t)))),
    h("label", {}, "Trier ", h("select", { on: { change: (e) => { S.store.setReglage("tri", e.target.value); maj(); } } },
      ...[["recommande", "Recommandées pour mon Elo"], ["facile", "Plus faciles"], ["forte", "Plus fortes"], ["eco", "Code ECO"], ["nom", "Nom"]].map(([v, t]) => h("option", { value: v, selected: R.tri === v }, t)))),
    h("input", { type: "search", placeholder: "Rechercher (nom, code ECO)…", value: R.recherche || "", on: { input: (e) => { S.store.setReglage("recherche", e.target.value); maj(); } } }));
  maj();
  const conseils = h("details", { class: "conseils", open: true },
    h("summary", {}, "Conseils généraux (moins de 1000 Elo)"),
    h("p", { class: "petit-texte" }, "Il est inutile de mémoriser toutes les variantes d'une ouverture. Objectifs prioritaires :"),
    h("ol", { class: "puces" }, ["Contrôler le centre avec les pions.", "Développer les cavaliers et les fous.", "Éviter de déplacer plusieurs fois la même pièce sans raison.", "Mettre le roi en sécurité avec le roque.", "Éviter de sortir la dame trop tôt.", "Ne pas jouer automatiquement les coups mémorisés si l'adversaire change de variante.", "Toujours vérifier les menaces de capture et les échecs avant de jouer."].map((t) => h("li", {}, t))),
    h("p", { class: "petit-texte" }, h("b", {}, "Répertoire conseillé pour commencer. "), "Blancs : Italienne (principale), London, Écossaise, Viennoise, Gambit dame. Noirs contre 1.e4 : Caro-Kann (principale), Scandinave, Française. Noirs contre 1.d4 : Slave (principale), Gambit dame refusé."));
  return [h("h2", {}, "Ouvertures"), conseils, filtres, compte, liste];
}

// ----- Variantes d'une ouverture (comme ChessReps : des dizaines de cas, reprise à la divergence) -----
function blocVariantes(o) {
  const U = S.varUI || (S.varUI = { q: "", limite: 30, partiel: true });
  const liste = h("div", {});
  const compte = h("div", { class: "petit-texte", style: "margin:4px 0" });
  const maj = () => {
    const q = U.q.trim().toLowerCase();
    const tous = o.variantes.map((v, i) => ({ v, i }));
    const res = q ? tous.filter(({ v }) => (v[1] + " " + v[0]).toLowerCase().includes(q)) : tous;
    const kids = res.slice(0, U.limite).map(({ v, i }) => {
      const coups = v[2].split(" ");
      const dep = i > 0 ? Math.min(divergence(o.variantes[i - 1][2].split(" "), coups), coups.length - 1) : 0;
      const st = S.store.carte(ctxVariante(o, v, 0).id);
      return h("div", { class: "ligne" },
        h("div", {}, h("b", {}, v[1]), " ", pastille(v[0]), dep > 0 ? pastille(`diffère au coup ${Math.floor(dep / 2) + 1}`, "info") : null, v[3] ? pastille(`⚠ piège / gambit douteux (Stockfish : un coup perd ~${v[3]} pions)`, "mal") : null, v[3] ? h("span", { class: "pastille mal", title: "Stockfish : un coup de cette ligne perd environ " + v[3] + " pion(s). Gambit ou piège : instructif à connaître, mais pas à jouer systématiquement." }, "⚠ gambit / piège") : null, st ? pastille(statut(st).texte, statut(st).code === "maitrise" ? "ok" : "") : null),
        h("div", { class: "boutons" },
          h("button", { class: "petit", on: { click: () => { S.chaine = null; lancer(ctxVariante(o, v, 0), "decouvrir"); } } }, "Découvrir"),
          h("button", { class: "petit", on: { click: () => lancerVariante(o, i, "apprendre", U.partiel) } }, "Apprendre"),
          h("button", { class: "petit primaire", on: { click: () => lancerVariante(o, i, "reviser", U.partiel) } }, "Réviser")),
        h("div", { class: "coups" }, dep > 0 && U.partiel ? "…" + ligneDepuis(coups, dep, 10) : ligneFr(coups, Math.min(coups.length, 16)) + (coups.length > 16 ? " …" : "")));
    });
    if (res.length > U.limite) kids.push(h("button", { on: { click: () => { U.limite += 40; maj(); } } }, `Afficher plus (${res.length - U.limite} restantes)`));
    liste.replaceChildren(...(kids.length ? kids : [h("div", { class: "vide" }, "Aucune variante.")]));
    compte.textContent = `${res.length} variante(s) sur ${o.variantes.length}, dans l'ordre de l'arbre : chaque variante est proche de la précédente.`;
  };
  const filtre = h("div", { class: "filtres" },
    h("input", { type: "search", placeholder: "Filtrer les variantes (nom, code ECO)…", value: U.q, on: { input: (e) => { U.q = e.target.value; U.limite = 30; maj(); } } }),
    h("label", { title: "Les coups communs avec la variante précédente sont joués d'office : tu travailles uniquement ce qui change." },
      h("input", { type: "checkbox", checked: U.partiel, on: { change: (e) => { U.partiel = e.target.checked; maj(); } } }), "Commencer là où ça change (divergence)"));
  maj();
  return h("div", {}, h("h3", {}, `Toutes les variantes (${o.variantes.length})`),
    h("p", { class: "petit-texte" }, "Variantes tirées de la base Lichess (noms en anglais). Les coups sont expliqués automatiquement ; les lignes rédigées plus haut ont des notes écrites à la main."),
    h("div", { class: "boutons" },
      h("button", { class: "primaire", on: { click: () => lancerVariante(o, 0, "reviser", U.partiel) } }, "Enchaîner : réviser toutes les variantes"),
      h("button", { on: { click: () => lancerVariante(o, 0, "apprendre", U.partiel) } }, "Enchaîner : apprendre")),
    filtre, compte, liste);
}

// ----- Détail d'une ouverture -----
function panneauDetail(o) {
  if (!o) { S.detailId = null; return h("div", {}); }
  const elo = +S.store.reglages.elo || 0;
  const adapt = elo < o.elo[0] ? `Un peu avancée pour ton niveau actuel (conseillée à partir de ${o.elo[0]} Elo).`
    : elo > o.elo[1] ? `Plutôt pour des débutants : au-delà de ${o.elo[1]} Elo, d'autres choix sont plus forts.` : "Adaptée à ton niveau.";
  const bloc = h("div", {},
    h("button", { class: "petit", on: { click: () => { S.detailId = null; renderPanneau(); } } }, "← Toutes les ouvertures"),
    h("h2", { style: "margin-top:10px" }, o.nom),
    h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px" }, pastille(campIcone(o.camp)), pastille(o.eco), o.piege ? pastille("Piège", "piege") : null, pastille(`Théorie ${o.theorie}`), pastille(o.style),
      pastille(adapt, elo >= o.elo[0] && elo <= o.elo[1] ? "ok" : ""), pastille(`${o.elo[0]}–${o.elo[1]} Elo`)),
    h("div", { class: "meta", style: "display:flex;gap:16px" }, h("span", {}, "Facilité ", etoiles(o.facilite)), h("span", {}, "Puissance ", etoiles(o.puissance))),
    o.role ? h("p", { class: "petit-texte", style: "margin:0 0 6px" }, h("b", {}, "Dans ton répertoire : "), o.role) : null,
    h("h3", {}, "Objectif"), h("p", {}, o.idee),
    o.retenir ? h("div", {}, h("h3", {}, "Idée générale à retenir"), h("p", {}, o.retenir)) : null,
    h("h3", {}, "Plans à retenir"), h("ul", { class: "puces" }, o.plans.map((t) => h("li", {}, t))),
    h("h3", {}, "Erreurs fréquentes"), h("ul", { class: "puces" }, o.erreurs.map((t) => h("li", {}, t))));
  if (o.stats400) {
    const s = o.stats400, src = S.data.sources[s.source];
    bloc.append(h("h3", {}, "Résultats à ~400 Elo"),
      h("div", { class: "stats", title: `Blancs ${s.blancs}% · Nulles ${s.nulles}% · Noirs ${s.noirs}%` },
        h("i", { class: "b", style: `width:${s.blancs}%` }), h("i", { class: "n", style: `width:${s.nulles}%` }), h("i", { class: "nr", style: `width:${s.noirs}%` })),
      h("div", { class: "petit-texte" }, `Victoires blancs ${s.blancs}% · nulles ${s.nulles}% · victoires noirs ${s.noirs}%. ${s.note}.`, src ? [" Source : ", h("a", { href: src.url, target: "_blank", rel: "noopener noreferrer" }, src.titre)] : null));
  }
  bloc.append(h("h3", {}, "Lignes à apprendre"));
  o.lignes.forEach((l, i) => {
    const ctx = ctxCurated(o, i), st = statut(S.store.carte(ctx.id));
    bloc.append(h("div", { class: "ligne" },
      h("div", {}, h("b", {}, l.nom), " ", pastille(st.texte, st.code === "maitrise" ? "ok" : st.code === "difficile" || st.code === "due" ? "mal" : ""),
        l.extensionDepuis ? pastille(`${Math.ceil(l.extensionDepuis / 2)} coups de théorie + suite Stockfish`, "info") : null),
      h("div", { class: "boutons" },
        h("button", { class: "petit", on: { click: () => lancer(ctx, "decouvrir") } }, "Découvrir"),
        h("button", { class: "petit", on: { click: () => lancer(ctx, "apprendre") } }, "Apprendre"),
        h("button", { class: "petit primaire", on: { click: () => lancer(ctx, "reviser") } }, "Réviser")),
      h("div", { class: "coups" }, ligneFr(l.coups, Math.min(l.coups.length, 16)) + (l.coups.length > 16 ? " …" : ""))));
  });
  if (o.variantes && o.variantes.length) bloc.append(blocVariantes(o));
  const liens = (o.sources || []).map((k) => S.data.sources[k]).filter(Boolean);
  if (liens.length) bloc.append(h("h3", {}, "Pour aller plus loin"), h("ul", { class: "puces" }, liens.map((s) => h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.titre)))));
  bloc.append(h("p", { class: "petit-texte", style: "margin-top:14px" }, "Coups validés par chess.js et recoupés avec la base d'ouvertures Lichess (CC0). Textes écrits pour ce projet ; les notes de facilité/puissance sont un avis éditorial."));
  return bloc;
}

// ----- Onglet Bibliothèque (toute la base Lichess, 3 800+ lignes) -----
async function chargerEco() {
  if (S.eco) return S.eco;
  const rep = await fetch("data/eco.json");
  if (!rep.ok) throw new Error("eco.json introuvable");
  S.eco = (await rep.json()).map(([code, nom, pgn]) => ({ code, nom, pgn, cle: (nom + " " + code).toLowerCase() }));
  return S.eco;
}

function panneauBibliotheque() {
  const L = S.lib;
  const liste = h("div", {}), compte = h("div", { class: "petit-texte", style: "margin:6px 2px" });
  const maj = async () => {
    try { await chargerEco(); } catch (e) { liste.replaceChildren(h("div", { class: "vide" }, "Impossible de charger la bibliothèque : " + e.message)); return; }
    const mots = L.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const res = S.eco.filter((e) => (L.vol === "tous" || e.code[0] === L.vol) && mots.every((m) => e.cle.includes(m)));
    const kids = res.slice(0, L.limite).map((e) => {
      const coups = e.pgn.split(" ");
      const ctx = ctxEco(e, L.camp), st = S.store.carte(ctx.id) ? statut(S.store.carte(ctx.id)) : null;
      return h("div", { class: "ligne" },
        h("div", {}, h("b", {}, e.nom), " ", pastille(e.code), st ? pastille(st.texte, st.code === "maitrise" ? "ok" : "") : null),
        h("div", { class: "boutons" },
          h("button", { class: "petit", on: { click: () => lancer(ctx, "decouvrir") } }, "Découvrir"),
          h("button", { class: "petit", on: { click: () => lancer(ctx, "apprendre") } }, "Apprendre"),
          h("button", { class: "petit primaire", on: { click: () => lancer(ctx, "reviser") } }, "Réviser")),
        h("div", { class: "coups" }, ligneFr(coups, Math.min(coups.length, 14)) + (coups.length > 14 ? " …" : "")));
    });
    if (res.length > L.limite) kids.push(h("button", { on: { click: () => { L.limite += 60; maj(); } } }, `Afficher plus (${res.length - L.limite} restantes)`));
    liste.replaceChildren(...(kids.length ? kids : [h("div", { class: "vide" }, "Aucun résultat.")]));
    compte.textContent = `${res.length} ligne(s) sur ${S.eco.length}. Noms en anglais (base Lichess).`;
  };
  let debounce;
  const filtres = h("div", { class: "filtres" },
    h("input", { type: "search", placeholder: "Rechercher : sicilian, najdorf, C45, london…", value: L.q, on: { input: (e) => { L.q = e.target.value; L.limite = 60; clearTimeout(debounce); debounce = setTimeout(maj, 120); } } }),
    h("label", {}, "Volume ", h("select", { on: { change: (e) => { L.vol = e.target.value; L.limite = 60; maj(); } } },
      ...["tous", "A", "B", "C", "D", "E"].map((v) => h("option", { value: v, selected: L.vol === v }, v === "tous" ? "Tous" : v)))),
    h("label", {}, "Je joue ", h("select", { on: { change: (e) => { L.camp = e.target.value; maj(); } } },
      ...[["blancs", "les Blancs"], ["noirs", "les Noirs"]].map(([v, t]) => h("option", { value: v, selected: L.camp === v }, t)))));
  maj();
  return [h("h2", {}, "Bibliothèque d'ouvertures"), h("p", { class: "petit-texte" }, "Toutes les ouvertures nommées de la base Lichess. Sans explications : pour mémoriser les coups. Les lignes expliquées sont dans l'onglet Ouvertures."), filtres, compte, liste];
}

// ----- Onglet Révisions -----
function panneauRevisions() {
  const cartes = Object.entries(S.store.data.cartes);
  const dues = cartes.filter(([, c]) => estDue(c));
  const maitrisees = cartes.filter(([, c]) => c.intervalle >= 21).length;
  const bloc = h("div", {}, h("h2", {}, "Révisions"),
    h("p", {}, cartes.length ? `${cartes.length} ligne(s) suivie(s) · ${dues.length} à réviser maintenant · ${maitrisees} maîtrisée(s).` : "Aucune ligne suivie pour l'instant. Termine une ligne en mode « Apprendre » ou « Réviser » depuis l'onglet Ouvertures."),
    h("button", { class: "primaire", disabled: !dues.length, on: { click: lancerSession } }, dues.length ? `Lancer la session (${dues.length})` : "Rien à réviser"));
  if (cartes.length) {
    bloc.append(h("h3", {}, "Toutes mes lignes"));
    const liste = h("div", { class: "liste" });
    cartes.sort((a, b) => a[1].echeance - b[1].echeance).forEach(([id, c]) => {
      const st = statut(c), m = c.meta || {};
      liste.append(h("div", { class: "ligne" },
        h("div", {}, h("b", {}, m.titre || id), " ", pastille(m.sousTitre || ""), " ", pastille(st.texte, st.code === "maitrise" ? "ok" : st.code === "difficile" || st.code === "due" ? "mal" : "")),
        h("div", { class: "boutons" }, h("button", { class: "petit primaire", on: { click: () => { const ctx = ctxDepuisCarte(id, c); if (ctx) lancer(ctx, "reviser"); } } }, "Réviser")),
        h("div", { class: "coups" }, `Échecs : ${c.echecs} · facilité ${c.facilite.toFixed(2)}`)));
    });
    bloc.append(liste);
  }
  const fichier = h("input", { type: "file", accept: "application/json", hidden: true, on: { change: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { S.store.importer(await f.text()); majBadge(); renderPanneau(); msg("Progression importée.", "ok"); }
    catch (err) { msg("Import impossible : " + err.message, "mal"); }
  } } });
  bloc.append(h("h3", {}, "Sauvegarde"), h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" },
    h("button", { class: "petit", on: { click: () => {
      const a = h("a", { href: URL.createObjectURL(new Blob([S.store.exporter()], { type: "application/json" })), download: "progression-echecs.json" });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } } }, "Exporter ma progression"),
    h("button", { class: "petit", on: { click: () => fichier.click() } }, "Importer"), fichier),
    h("p", { class: "petit-texte" }, "Ta progression est stockée dans ce navigateur. Exporte-la pour la sauvegarder ou la déplacer vers un autre appareil."));
  return bloc;
}

// ───────────────────────── Tactiques ─────────────────────────
async function chargerPuzzles() {
  if (S.puzzles) return S.puzzles;
  try {
    const rep = await fetch("data/puzzles.json");
    if (!rep.ok) throw new Error("HTTP " + rep.status);
    S.puzzles = await rep.json();
  } catch (e) { S.puzzles = { erreur: e.message, puzzles: [], themes: {} }; }
  return S.puzzles;
}

const NOM_CAT = (cat) => (S.puzzles.themes[cat] ? S.puzzles.themes[cat].nom : cat);
const recPuzzle = (id) => S.store.data.puzzles[id] || null;

function puzzlesFiltres() {
  const { theme, niveau } = S.puz.filtre;
  return S.puzzles.puzzles.filter((p) => (!theme || p.cat === theme) && (!niveau || p.niveau === niveau));
}

function lancerPuzzle(p) {
  quitterMode();
  S.mode = "tactique"; S.puz.courant = p; S.puzzleFini = false; S.erreursCoup = 0; S.indiceNiv = 0;
  S.drill = new Puzzle(p);
  board.orienter(S.drill.couleur);
  majBarreOrientation();
  board.setFen(p.fen);
  board.marquerDernier();
  majEval(p.fen);
  demarrerTour();
  majControles();
  renderPanneau();
}

function puzzleSuivant() {
  const l = puzzlesFiltres();
  if (!l.length) return;
  const cur = S.puz.courant ? l.findIndex((p) => p.id === S.puz.courant.id) : -1;
  const ordre = [...l.slice(cur + 1), ...l.slice(0, cur + 1)];
  lancerPuzzle(ordre.find((p) => !(recPuzzle(p.id) || {}).ok) || ordre[0]);
}

/** Révèle la solution en la jouant coup par coup (compte comme un échec). */
function voirSolution() {
  const d = S.drill;
  if (!d || d.termine || S.verrou) return;
  annulerPremove();
  d.aides++;
  S.verrou = true;
  board.autorise = null;
  board.effacerFleches();
  msg("Solution :", "info");
  const pas = () => {
    if (S.drill !== d) return;
    if (d.termine) { S.verrou = false; finPuzzle(); return; }
    let m;
    if (d.auTraitDeLEleve) { const a = d.coupAttendu(); m = d.tenter(a.from, a.to, a.promotion || "q").coup; } else m = d.jouerAdversaire();
    if (m) board.jouer(m);
    S.timer = setTimeout(pas, 750);
  };
  pas();
}

function finPuzzle() {
  const d = S.drill, p = S.puz.courant;
  board.autorise = null;
  board.effacerFleches();
  S.puzzleFini = true;
  const ok = d.reussi;
  const r = S.store.data.puzzles[p.id] || { essais: 0, ok: 0, echecs: 0 };
  r.essais++; if (ok) r.ok++; else r.echecs++;
  r.dernier = Date.now();
  S.store.data.puzzles[p.id] = r;
  S.store.touche("puzzles", p.id);
  S.store.sauver();
  S.serie = ok ? S.serie + 1 : 0;
  majEval(d.fen);
  let texte, type = "ok";
  if (ok) texte = d.mateAlternatif ? "Bravo ! Un autre mat que celui prévu : c'est valable aussi." : "Bravo ! Trouvé du premier coup.";
  else if (d.aides) { texte = "Solution affichée : ce problème reviendra dans ta liste."; type = "mal"; }
  else texte = "Résolu, mais avec des essais ratés. Refais-le pour bien l'ancrer.";
  if (type === "ok") Son.ok(); else Son.erreur();
  msg(texte, type, [["Problème suivant", puzzleSuivant, true], ["Recommencer", () => lancerPuzzle(p)], ["Analyse libre", passerLibre]]);
  majControles();
  renderPanneau();
}

function bandeauLibre() {
  return S.mode === "libre" ? h("div", { class: "message info" }, "Analyse libre en cours. ", h("button", { class: "petit", on: { click: retour } }, "Quitter l'analyse")) : null;
}

function panneauTactiquesAccueil() {
  const bloc = h("div", {});
  if (!S.puzzles) { chargerPuzzles().then(() => { if (!S.mode && S.onglet === "tactiques") renderPanneau(); }); return h("div", { class: "vide" }, "Chargement des problèmes…"); }
  if (S.puzzles.erreur) return h("div", { class: "message mal" }, "Problèmes indisponibles : " + S.puzzles.erreur);
  const tous = S.puzzles.puzzles, rec = S.store.data.puzzles;
  const resolus = tous.filter((p) => (rec[p.id] || {}).ok).length;
  bloc.append(bandeauLibre() || "", h("h2", {}, "Tactiques"),
    h("p", {}, `${resolus} / ${tous.length} problèmes résolus. Trouve le meilleur coup : pas de limite de temps, l'évaluation est cachée jusqu'à la fin.`),
    h("div", { class: "progres" }, h("i", { style: `width:${(100 * resolus / tous.length).toFixed(0)}%` })));
  const cats = [...new Set(tous.map((p) => p.cat))];
  const F = S.puz.filtre;
  bloc.append(h("div", { class: "filtres" },
    h("label", {}, "Thème ", h("select", { on: { change: (e) => { F.theme = e.target.value || null; renderPanneau(); } } },
      h("option", { value: "" }, "Tous"), ...cats.map((c) => h("option", { value: c, selected: F.theme === c }, NOM_CAT(c))))),
    h("label", {}, "Niveau ", h("select", { on: { change: (e) => { F.niveau = +e.target.value; renderPanneau(); } } },
      h("option", { value: 0 }, "Tous"), ...[1, 2, 3, 4, 5].map((n) => h("option", { value: n, selected: F.niveau === n }, "★".repeat(n)))))));
  const l = puzzlesFiltres();
  bloc.append(h("button", { class: "primaire", disabled: !l.length, on: { click: puzzleSuivant } }, l.length ? `Commencer (${l.length} problèmes)` : "Aucun problème avec ces filtres"));
  bloc.append(h("h3", {}, "Par thème"));
  const grille = h("div", { class: "grille" });
  for (const c of cats) {
    const ps = tous.filter((p) => p.cat === c), fait = ps.filter((p) => (rec[p.id] || {}).ok).length;
    grille.append(h("button", { class: "carte", on: { click: () => { F.theme = c; F.niveau = 0; puzzleSuivant(); } } },
      h("div", { class: "titre" }, NOM_CAT(c)),
      h("div", { class: "meta" }, `${fait} / ${ps.length}`, h("span", { class: "petit-texte" }, S.puzzles.themes[c] ? S.puzzles.themes[c].desc : "")),
      h("div", { class: "progres" }, h("i", { style: `width:${(100 * fait / ps.length).toFixed(0)}%` }))));
  }
  bloc.append(grille);
  return bloc;
}

function panneauTactique() {
  const p = S.puz.courant, d = S.drill;
  const th = (p.themes || []).filter((t) => S.puzzles.themes[t]);
  const bloc = h("div", {}, h("h2", {}, `Problème ${p.id.slice(1)}`),
    h("div", { class: "meta" }, pastille(NOM_CAT(p.cat), "info"), " ", etoiles(p.niveau), " ", pastille("Série : " + S.serie, S.serie ? "ok" : "")),
    h("p", {}, d.couleur === "w" ? "Tu joues les Blancs." : "Tu joues les Noirs.", " L'adversaire vient de jouer : à toi de trouver la suite."));
  if (S.puzzleFini) {
    bloc.append(h("h3", {}, "Ce qu'il fallait voir"),
      h("ul", { class: "puces" }, th.map((t) => h("li", {}, h("b", {}, S.puzzles.themes[t].nom), " : ", S.puzzles.themes[t].desc))));
    const ex = expliquerPuzzle(p);
    bloc.append(h("h3", {}, "Solution expliquée"),
      ...ex.theme.map((t) => h("p", {}, t)),
      h("ol", { class: "etapes" }, ex.etapes.map((e) => h("li", { class: e.eleve ? "eleve" : "adverse" }, h("b", {}, sanFr(e.san)), e.eleve ? " (toi) — " : " (adversaire) — ", e.texte))));
  } else bloc.append(h("p", { class: "petit-texte" }, "Indice : 1er clic = la pièce à bouger, 2e clic = le coup. Les thèmes sont révélés à la fin."));
  bloc.append(h("button", { class: "petit", on: { click: retour } }, "← Retour aux tactiques"));
  return bloc;
}

// ───────────────────────── Finales ─────────────────────────
async function chargerFinales() {
  if (S.finales) return S.finales;
  try {
    const rep = await fetch("data/finales.json");
    if (!rep.ok) throw new Error("HTTP " + rep.status);
    S.finales = (await rep.json()).finales;
  } catch (e) { S.finales = { erreur: e.message }; }
  return S.finales;
}

const OBJECTIFS = { mat: "Gagner : mater", promotion: "Gagner : promouvoir le pion", nulle: "Tenir la nulle" };
const pctEleve = (sb) => { const part = partBlancs(sb); return S.drill.couleur === "w" ? part : 100 - part; };
const matEleve = (sb) => (sb.mate === undefined ? null : S.drill.couleur === "w" ? sb.mate : -sb.mate); // >0 : l'élève mate en n coups

function lancerFinale(def) {
  quitterMode();
  S.mode = "finale"; S.puzzleFini = false;
  S.drill = new Finale(def);
  S.finale = { def, avant: null, matAvant: null, dernierEleve: false, retour: null, typeRetour: "info" };
  board.orienter(def.eleve);
  majBarreOrientation();
  board.setFen(S.drill.fen);
  board.marquerDernier();
  majControles();
  renderPanneau();
  const d = S.drill;
  if (!S.moteurPret) { demarrerTour(); return; }
  S.moteur.analyser(d.fen, { movetime: 500, depth: 20 }).then((r) => {
    if (S.drill !== d) return;
    if (r) { afficherScore(r.scoreBlancs, r.depth); S.finale.avant = pctEleve(r.scoreBlancs); const m = matEleve(r.scoreBlancs); S.finale.matAvant = m > 0 ? m : null; }
    demarrerTour();
  });
}

function msgFinale() {
  const d = S.drill, F = S.finale;
  const base = `${OBJECTIFS[F.def.objectif]} · coup ${Math.min(d.coups + 1, d.limite)} / ${d.limite}`;
  msg(F.retour ? h("span", {}, h("b", {}, F.retour), " — ", base) : base, F.retour ? F.typeRetour : "info");
}

/** Tour de l'adversaire : Stockfish analyse (ce qui donne aussi la note du coup de l'élève), puis joue son meilleur coup. */
async function tourMoteurFinale(essai = 0) {
  const d = S.drill, F = S.finale, tok = ++S.evalToken;
  if (!S.moteurPret && essai < 20) { msg("Chargement du moteur…", "info"); S.timer = setTimeout(() => S.drill === d && tourMoteurFinale(essai + 1), 500); return; }
  msg("L'adversaire réfléchit… (tu peux préparer un premove)", "info");
  let r = null;
  if (S.moteurPret) r = await S.moteur.analyser(d.fen, { movetime: 500, depth: 20 });
  if (S.drill !== d || tok !== S.evalToken || d.termine) return;
  F.retour = null; F.typeRetour = "info";
  if (r) {
    afficherScore(r.scoreBlancs, r.depth);
    const apres = pctEleve(r.scoreBlancs), mat = matEleve(r.scoreBlancs);
    if (F.dernierEleve && F.avant !== null) {
      const chute = F.avant - apres;
      if (chute >= 20) { d.erreurs++; F.retour = "Grosse erreur : ton avantage a fondu"; F.typeRetour = "mal"; Son.erreur(); }
      else if (chute >= 10) { F.retour = "Imprécision"; F.typeRetour = "mal"; }
      else if (F.matAvant !== null && mat !== null && mat > 0 && mat > F.matAvant - 1) { F.retour = `Ce coup retarde le mat (mat en ${mat} au lieu de ${F.matAvant - 1})`; F.typeRetour = "info"; }
    }
    F.avant = apres;
    F.matAvant = mat !== null && mat > 0 ? mat : null;
  }
  F.dernierEleve = false;
  S.timer = setTimeout(() => {
    if (S.drill !== d) return;
    const m = d.jouerAdverse(r && r.bestmove ? r.bestmove : "");
    if (m) board.jouer(m);
    S.verrou = false;
    demarrerTour();
    lancerPremove();
    board.rafraichirSelection();
  }, 450);
}

function finFinale() {
  const d = S.drill, F = S.finale, def = F.def;
  board.autorise = null;
  board.effacerFleches();
  const r = S.store.data.finales[def.id] || { essais: 0, reussi: 0 };
  r.essais++; if (d.resultat === "ok") r.reussi++;
  r.dernier = Date.now();
  S.store.data.finales[def.id] = r;
  S.store.touche("finales", def.id);
  S.store.sauver();
  const ok = d.resultat === "ok";
  if (ok) Son.fin(); else Son.erreur();
  const net = ok && d.reussi;
  const texte = d.raison + (ok ? (net ? " Propre : aucune grosse erreur, aucune aide." : ` (${d.erreurs} grosse(s) erreur(s), ${d.aides} aide(s))`) : "");
  const suiv = S.finales.findIndex((f) => f.id === def.id) + 1;
  const actions = [["Recommencer", () => lancerFinale(def), !ok]];
  if (d.peutAnnuler) actions.push(["Annuler mon dernier coup", annulerFinale]);
  if (S.finales[suiv]) actions.push(["Finale suivante", () => lancerFinale(S.finales[suiv]), ok]);
  actions.push(["Analyse libre", passerLibre]);
  msg(texte, ok ? "ok" : "mal", actions);
  majControles();
  renderPanneau();
}

async function indiceFinale() {
  const d = S.drill, F = S.finale, tok = ++S.evalToken;
  if (!d || !d.auTraitDeLEleve || S.verrou || !S.moteurPret) return;
  msg("Recherche du meilleur coup…", "info");
  const r = await S.moteur.analyser(d.fen, { movetime: 600, depth: 20 });
  if (!r || S.drill !== d || tok !== S.evalToken || !d.auTraitDeLEleve || !r.bestmove) return;
  d.aides++;
  const c = new Chess(d.fen), from = r.bestmove.slice(0, 2), to = r.bestmove.slice(2, 4);
  const m = c.move({ from, to, promotion: r.bestmove[4] });
  board.effacerFleches();
  board.fleche(from, to, "indice");
  afficherScore(r.scoreBlancs, r.depth);
  F.avant = pctEleve(r.scoreBlancs);
  msg(`Meilleur coup : ${sanFr(m.san)} (compte comme une aide).`, "info");
}

function annulerFinale() {
  const d = S.drill, F = S.finale;
  if (!d || S.verrou || !d.annuler()) return;
  clearTimeout(S.timer);
  annulerPremove();
  board.effacerFleches();
  board.setFen(d.fen);
  if (d.dernierCoup) board.marquerDernier(d.dernierCoup.from, d.dernierCoup.to); else board.marquerDernier();
  F.retour = null; F.dernierEleve = false; F.avant = null; F.matAvant = null;
  const tok = ++S.evalToken;
  if (S.moteurPret) S.moteur.analyser(d.fen, { movetime: 400, depth: 18 }).then((r) => { if (r && S.drill === d && tok === S.evalToken) { afficherScore(r.scoreBlancs, r.depth); F.avant = pctEleve(r.scoreBlancs); } });
  demarrerTour();
}

function panneauFinalesAccueil() {
  if (!S.finales) { chargerFinales().then(() => { if (!S.mode && S.onglet === "finales") renderPanneau(); }); return h("div", { class: "vide" }, "Chargement des finales…"); }
  if (S.finales.erreur) return h("div", { class: "message mal" }, "Finales indisponibles : " + S.finales.erreur);
  const bloc = h("div", {}, bandeauLibre() || "", h("h2", {}, "Finales"),
    h("p", {}, "Positions de base à connaître. L'adversaire est Stockfish : il se défend au mieux. Pas de panique, tu peux annuler un coup."));
  const groupes = [...new Set(S.finales.map((f) => f.groupe))];
  for (const g of groupes) {
    bloc.append(h("h3", {}, g));
    const grille = h("div", { class: "grille" });
    for (const f of S.finales.filter((x) => x.groupe === g)) {
      const r = S.store.data.finales[f.id];
      grille.append(h("button", { class: "carte", on: { click: () => lancerFinale(f) } },
        h("div", { class: "titre" }, f.titre, r && r.reussi ? pastille("✓ réussie", "ok") : ""),
        h("div", { class: "meta" }, pastille(OBJECTIFS[f.objectif], f.objectif === "nulle" ? "info" : ""), r ? `${r.reussi}/${r.essais} essais` : "")));
    }
    bloc.append(grille);
  }
  return bloc;
}

function panneauFinale() {
  const F = S.finale, def = F.def, d = S.drill;
  return h("div", {}, h("h2", {}, def.titre),
    h("div", { class: "meta" }, pastille(OBJECTIFS[def.objectif], def.objectif === "nulle" ? "info" : ""), " ", pastille(`${d.coups} / ${d.limite} coups`), " ", pastille(`Erreurs : ${d.erreurs}`, d.erreurs ? "mal" : "")),
    h("h3", {}, "L'idée"), h("p", {}, def.idee),
    h("h3", {}, "À retenir"), h("ul", { class: "puces" }, def.conseils.map((c) => h("li", {}, c))),
    h("p", { class: "petit-texte" }, "« Meilleur coup » demande à Stockfish (compte comme une aide). La barre est exacte : elle ne triche pas."),
    h("button", { class: "petit", on: { click: retour } }, "← Retour aux finales"));
}

// ───────────────────────── Compte & synchronisation ─────────────────────────
function majBoutonCompte() {
  const b = $("#b-compte"), y = S.sync;
  b.textContent = y.email ? (y.etat === "erreur" ? "☁ ⚠ " : y.etat === "synchro" ? "☁ … " : "☁ ✓ ") + y.email.split("@")[0] : "☁ Compte";
  b.title = y.message || "Compte et synchronisation PC / téléphone";
}

function ouvrirCompte() {
  const y = S.sync, dlg = $("#dlg-compte");
  const corps = h("div", {});
  const erreur = h("div", { class: "message mal", hidden: true });
  const montrer = (e) => { erreur.hidden = false; erreur.textContent = e.message; };
  const fini = async (changement) => { if (changement) { majBadge(); renderPanneau(); } dlg.close(); };
  corps.append(h("h2", {}, "Compte"));
  if (!y.configure) {
    corps.append(h("p", {}, "La synchronisation n'est pas encore configurée. Suis le guide GUIDE-TELEPHONE.md (partie « Compte »), puis renseigne public/js/config.js."),
      h("p", { class: "petit-texte" }, "En attendant, tu peux sauvegarder à la main avec Exporter / Importer dans l'onglet Révisions."));
  } else if (y.email) {
    corps.append(h("p", {}, "Connecté : ", h("b", {}, y.email)), h("p", { class: "petit-texte" }, y.message || "Ta progression est envoyée automatiquement quelques secondes après chaque modification."),
      h("div", { class: "boutons" },
        h("button", { class: "primaire", on: { click: async () => { const c = await y.synchroniser(); if (y.etat === "erreur") montrer(new Error(y.message)); else fini(c); } } }, "Synchroniser maintenant"),
        h("button", { on: { click: () => { y.deconnecter(); dlg.close(); } } }, "Se déconnecter")));
  } else {
    const email = h("input", { type: "email", placeholder: "Email", autocomplete: "email", required: true });
    const mdp = h("input", { type: "password", placeholder: "Mot de passe (6 caractères min.)", autocomplete: "current-password", required: true });
    const agir = (fn) => async () => { erreur.hidden = true; try { await fn(email.value.trim(), mdp.value); fini(true); } catch (e) { montrer(e); } };
    corps.append(h("p", {}, "Connecte-toi pour retrouver ta progression sur tous tes appareils."), h("div", { class: "filtres" }, email, mdp),
      h("div", { class: "boutons" }, h("button", { class: "primaire", on: { click: agir((e, m) => y.connecter(e, m)) } }, "Se connecter"),
        h("button", { on: { click: agir((e, m) => y.inscrire(e, m)) } }, "Créer un compte")));
  }
  corps.append(erreur, h("div", { class: "boutons", style: "margin-top:10px" }, h("button", { class: "petit", on: { click: () => dlg.close() } }, "Fermer")));
  dlg.replaceChildren(corps);
  dlg.showModal();
}

// ───────────────────────── Démarrage ─────────────────────────
async function demarrer() {
  S.store = new Store();
  S.fleche = S.store.reglages.fleche !== false;
  S.sync = new Sync(S.store);
  S.sync.onEtat = () => majBoutonCompte();
  majBoutonCompte();
  $("#b-compte").addEventListener("click", ouvrirCompte);
  if (S.sync.session) S.sync.synchroniser().then((c) => { if (c) { majBadge(); renderPanneau(); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.sync.session) S.sync.synchroniser().then((c) => { if (c && !S.mode) { majBadge(); renderPanneau(); } }); });
  board = new Board($("#plateau"), {
    cibles: (from) => {
      if (S.mode === "libre") return S.libre.moves({ square: from, verbose: true });
      if (S.drill && !S.drill.termine) {
        if (S.drill.auTraitDeLEleve && !S.verrou) return S.drill.cibles(from);
        return ciblesPremove(S.drill.fen, from, S.drill.couleur);
      }
      return [];
    },
    surCoup,
    surEffacer: annulerPremove,
  });
  board.setFen(new Chess().fen());
  brancherControles();
  document.querySelectorAll("#onglets button[data-onglet]").forEach((b) => b.addEventListener("click", () => {
    S.onglet = b.dataset.onglet; S.detailId = null; S.session = null;
    if (S.mode) retour();
    majOnglets(); renderPanneau();
  }));
  try {
    const rep = await fetch("data/openings.json");
    if (!rep.ok) throw new Error("HTTP " + rep.status);
    S.data = await rep.json();
  } catch (e) {
    $("#panneau").replaceChildren(h("div", { class: "message mal" }, "Impossible de charger les données (" + e.message + "). Lance l'app avec « node server.js » puis ouvre http://localhost:5173 — ouvrir index.html directement ne fonctionne pas."));
    return;
  }
  nettoyerCartes();
  majBadge();
  renderPanneau();
  initMoteur(); // en arrière-plan : n'empêche pas d'utiliser l'app
}

demarrer();
