// Détection de thèmes tactiques (heuristiques simples, vérifiées sur la position avec chess.js).
// Les puzzles eux-mêmes sont validés par Stockfish ; ici on ne fait que les ÉTIQUETER.
import { Chess } from "../public/vendor/chess.js";

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const AUTRE = (c) => (c === "w" ? "b" : "w");
const uci = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

export const THEMES = {
  "mat-en-1": { nom: "Mat en 1", desc: "Un seul coup donne échec et mat." },
  "mat-en-2": { nom: "Mat en 2", desc: "Mat forcé en deux coups, quoi que joue l'adversaire." },
  "mat-en-3": { nom: "Mat en 3", desc: "Mat forcé en trois coups." },
  "mat-du-couloir": { nom: "Mat du couloir", desc: "Le roi est coincé sur sa dernière rangée par ses propres pions." },
  "mat-etouffe": { nom: "Mat étouffé", desc: "Un cavalier mate un roi entouré de ses propres pièces." },
  "piece-en-prise": { nom: "Pièce en prise", desc: "Une pièce adverse n'est pas protégée : prends-la." },
  fourchette: { nom: "Fourchette", desc: "Une pièce attaque deux cibles en même temps." },
  clouage: { nom: "Clouage", desc: "Une pièce ne peut pas bouger sans exposer une pièce plus importante derrière elle." },
  enfilade: { nom: "Enfilade", desc: "Une pièce importante doit s'écarter et laisse prendre celle qui est derrière." },
  promotion: { nom: "Promotion", desc: "Un pion arrive à la dernière rangée." },
  "double-echec": { nom: "Double échec", desc: "Deux pièces donnent échec en même temps : le roi doit bouger." },
  "gain-de-materiel": { nom: "Gain de matériel", desc: "Une suite de coups forcés fait gagner du matériel." },
};

export const matDiff = (chess, couleur) => {
  let s = 0;
  for (const rang of chess.board()) for (const p of rang) if (p) s += (p.color === couleur ? 1 : -1) * VAL[p.type];
  return s;
};

const DIRS = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};
const sq = (f, r) => "abcdefgh"[f] + (r + 1);

/** Pièces adverses attaquées par la pièce posée en `to` (après le coup). */
function cibles(chess, to, couleur) {
  const res = [];
  for (const rang of chess.board()) for (const p of rang) {
    if (!p || p.color === couleur) continue;
    if (chess.attackers(p.square, couleur).includes(to)) res.push(p);
  }
  return res;
}

function rayon(chess, to, type, couleur) {
  const f0 = to.charCodeAt(0) - 97, r0 = +to[1] - 1, out = [];
  for (const [df, dr] of DIRS[type] || []) {
    let f = f0 + df, r = r0 + dr, premiere = null;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const p = chess.get(sq(f, r));
      if (p) {
        if (p.color === couleur) break;
        if (!premiere) premiere = p;
        else { out.push([premiere, p]); break; }
      }
      f += df; r += dr;
    }
  }
  return out;
}

/**
 * @param {string} fen position AVANT le premier coup de l'élève
 * @param {string[]} coups coups UCI de la solution (élève, adversaire, élève…)
 * @returns {{themes:string[], mat:number}}
 */
export function detecterThemes(fen, coups) {
  const themes = new Set();
  const chess = new Chess(fen);
  const eleve = chess.turn();
  let nEleve = 0, dernier = null, avant = null;
  for (let i = 0; i < coups.length; i++) {
    avant = chess.fen();
    const m = chess.move(uci(coups[i]));
    if (i % 2 === 0) { nEleve++; dernier = m; if (i === 0) analysePremier(fen, m, new Chess(chess.fen()), eleve, themes); }
    if (m.promotion && m.color === eleve) themes.add("promotion");
  }
  let mat = 0;
  if (chess.isCheckmate()) {
    mat = nEleve;
    themes.add(`mat-en-${Math.min(3, nEleve)}`);
    const roi = chess.board().flat().find((p) => p && p.type === "k" && p.color === AUTRE(eleve));
    const rangDos = roi.color === "w" ? "1" : "8";
    const att = chess.attackers(roi.square, eleve).map((s) => chess.get(s));
    if (roi.square[1] === rangDos && dernier && ["r", "q"].includes(dernier.piece) && dernier.to[1] === rangDos) themes.add("mat-du-couloir");
    if (dernier && dernier.piece === "n") {
      const f0 = roi.square.charCodeAt(0) - 97, r0 = +roi.square[1] - 1;
      let libre = false;
      for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
        if (!df && !dr) continue;
        const f = f0 + df, r = r0 + dr;
        if (f < 0 || f > 7 || r < 0 || r > 7) continue;
        const p = chess.get(sq(f, r));
        if (!p || p.color !== roi.color) libre = true;
      }
      if (!libre) themes.add("mat-etouffe");
    }
    void att; void avant;
  } else if (![...themes].some((t) => ["fourchette", "clouage", "enfilade", "piece-en-prise", "promotion"].includes(t))) {
    themes.add("gain-de-materiel");
  }
  return { themes: [...themes], mat };
}

function analysePremier(fenAvant, m, apres, eleve, themes) {
  const adv = AUTRE(eleve);
  // double échec : 2 attaquants sur le roi adverse après le coup
  const roi = apres.board().flat().find((p) => p && p.type === "k" && p.color === adv);
  if (apres.isCheck() && roi && apres.attackers(roi.square, eleve).length >= 2) themes.add("double-echec");
  // pièce en prise : capture d'une pièce (>= cavalier) qui n'était pas défendue
  if (m.captured && VAL[m.captured] >= 3) {
    const av = new Chess(fenAvant);
    if (av.attackers(m.to, adv).filter((s) => s !== m.to).length === 0) themes.add("piece-en-prise");
  }
  // fourchette
  const cs = cibles(apres, m.to, eleve);
  const interessantes = cs.filter((p) => p.type === "k" || VAL[p.type] >= Math.max(3, VAL[m.piece] || 0) || apres.attackers(p.square, adv).length === 0 && VAL[p.type] >= 3);
  if (!m.captured && cs.length >= 2 && interessantes.length >= 2 && m.piece !== "k") themes.add("fourchette");
  if (m.captured && cs.length >= 2 && interessantes.length >= 2 && m.piece !== "k" && m.piece !== "p") themes.add("fourchette");
  if (m.piece === "p" && !m.captured && cs.length >= 2 && interessantes.length >= 2) themes.add("fourchette");
  // clouage / enfilade (pièces à longue portée)
  if (["b", "r", "q"].includes(m.piece)) {
    for (const [a, b] of rayon(apres, m.to, m.piece, eleve)) {
      if (b.type === "k" || (VAL[b.type] > VAL[a.type] && a.type !== "k")) themes.add("clouage");
      else if (a.type === "k" || VAL[a.type] > VAL[b.type]) { if (VAL[b.type] >= 3 || b.type === "q") themes.add("enfilade"); }
    }
  }
}

/** Niveau 1 (très facile) à 5, selon le type et la longueur. */
export function niveau({ mat, nEleve, themes }) {
  if (mat === 1) return 1;
  if (themes.includes("piece-en-prise") && nEleve === 1) return 1;
  if (mat === 2) return 3;
  if (mat === 3) return 4;
  if (nEleve === 1) return 2;
  if (nEleve === 2) return 3;
  return 4;
}
