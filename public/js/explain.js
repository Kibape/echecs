// Explications en français d'un coup, calculées à partir de la position réelle (chess.js).
// Aucune donnée à stocker : marche pour les ouvertures curées, les 3 800 lignes de la bibliothèque et les tactiques.
// Chaque phrase décrit un FAIT vérifiable sur l'échiquier (pièce qui sort, case attaquée, colonne ouverte…).
import { Chess } from "../vendor/chess.js";

const NOM = { p: "pion", n: "cavalier", b: "fou", r: "tour", q: "dame", k: "roi" };
const ART = { p: "le pion", n: "le cavalier", b: "le fou", r: "la tour", q: "la dame", k: "le roi" };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const CENTRE = new Set(["d4", "e4", "d5", "e5"]);
const autre = (c) => (c === "w" ? "b" : "w");
const maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Cases occupées par des pièces adverses (hors roi) que la pièce posée en `sq` attaque, après le coup. */
function cibles(fenApres, sq, couleur) {
  const f = fenApres.split(" ");
  f[1] = couleur; f[3] = "-";
  let c;
  try { c = new Chess(f.join(" ")); } catch { return []; }
  const adv = autre(couleur);
  return c.moves({ square: sq, verbose: true })
    .filter((m) => m.captured && m.captured !== "k")
    .map((m) => ({ sq: m.to, type: m.captured, defendue: c.isAttacked(m.to, adv) }));
}

function colonneOuverte(chess, fichier, couleur) {
  let miens = 0, siens = 0;
  for (let r = 1; r <= 8; r++) {
    const p = chess.get(fichier + r);
    if (p && p.type === "p") { if (p.color === couleur) miens++; else siens++; }
  }
  return miens === 0 && siens === 0 ? "ouverte" : miens === 0 ? "semi" : null;
}

/**
 * @param {string} fenAvant position AVANT le coup
 * @param {string} san      coup en SAN anglais (ex. "Nf3")
 * @returns {string|null}   1 à 3 phrases, ou null si le coup est illégal
 */
export function expliquerCoup(fenAvant, san) {
  const c = new Chess(fenAvant);
  const couleur = c.turn(), adv = autre(couleur);
  const rangDepart = couleur === "w" ? "1" : "8";
  const numero = parseInt(fenAvant.split(" ")[5], 10) || 1;
  let m;
  try { m = c.move(san); } catch { return null; }
  const fenApres = c.fen();
  const phrases = [];
  const t = m.piece, to = m.to;

  // ── Cas spéciaux ──
  if (m.flags.includes("k") || m.flags.includes("q")) {
    phrases.push((m.flags.includes("k") ? "Petit roque" : "Grand roque") + " : le roi se met à l'abri derrière ses pions et la tour entre dans le jeu.");
  } else if (m.promotion) {
    phrases.push(`Le pion arrive à la dernière rangée et devient ${ART[m.promotion].replace("le ", "un ").replace("la ", "une ")}.`);
  } else if (m.captured) {
    const gain = VAL[m.captured] - VAL[t];
    const reprise = c.isAttacked(to, adv);
    let s = `${maj(ART[t])} prend ${ART[m.captured]} en ${to}`;
    if (m.flags.includes("e")) s += " (prise en passant)";
    if (m.captured !== "p" && gain > 0 && reprise) s += " : on gagne du matériel, même si la pièce peut être reprise";
    else if (gain > 0) s += " : gain de matériel";
    else if (gain === 0) s += reprise ? " : un échange de pièces de même valeur" : " : une pièce gagnée sans contrepartie";
    else s += reprise ? " : la pièce prise vaut moins que celle qui prend ; ce n'est intéressant que si la suite est claire (sacrifice ou attaque)" : " : la pièce adverse est prise gratuitement";
    phrases.push(s + ".");
  } else if (t === "p") {
    const dbl = Math.abs(parseInt(m.to[1], 10) - parseInt(m.from[1], 10)) === 2;
    if (dbl && CENTRE.has(to)) phrases.push(`Le pion occupe le centre en ${to} : il prend de l'espace et ouvre la voie au fou et à la dame.`);
    else if (dbl) phrases.push(`Avance le pion de deux cases (${to}) pour prendre de l'espace.`);
    else if (to[0] === "c" || to[0] === "d" || to[0] === "e" || to[0] === "f") phrases.push(`Avance le pion en ${to} : il contrôle de nouvelles cases et prépare la suite.`);
    else phrases.push(`Avance le pion en ${to}, sur le côté : il gagne de l'espace sans toucher au centre.`);
  } else if ((t === "n" || t === "b") && m.from[1] === rangDepart && numero <= 12) {
    const centre = [...CENTRE].some((s) => cibles(fenApres, to, couleur).some((x) => x.sq === s) || c.get(s));
    phrases.push(`Développe ${ART[t]} : une pièce sortie contrôle plus de cases${centre ? " et surveille le centre" : ""}.`);
  } else if (t === "q") {
    phrases.push(numero <= 6 ? "La dame sort très tôt : elle est puissante mais peut être chassée par les pièces mineures, il faut la surveiller." : `La dame se place en ${to} pour peser sur la position.`);
  } else if (t === "r") {
    const o = colonneOuverte(c, to[0], couleur);
    phrases.push(o === "ouverte" ? `La tour s'installe sur la colonne ${to[0]} ouverte (sans pion) : elle y est très active.` : o === "semi" ? `La tour prend la colonne ${to[0]}, semi-ouverte : elle vise les pions adverses.` : `La tour se place en ${to}.`);
  } else if (t === "k") {
    phrases.push("Le roi se déplace sans roquer : il perd donc le droit de roquer, ce qui est rarement souhaitable en ouverture.");
  } else {
    phrases.push(`${maj(ART[t])} va en ${to}.`);
  }

  // ── Échec / mat ──
  if (m.san.endsWith("#")) phrases.push("Échec et mat : le roi ne peut ni fuir, ni parer l'échec, ni prendre la pièce qui le menace.");
  else if (m.san.endsWith("+")) phrases.push("Le roi adverse est en échec : il doit répondre tout de suite.");

  // ── Menaces créées ──
  if (!m.san.endsWith("#") && !m.promotion) {
    const toutes = cibles(fenApres, to, couleur);
    const menaces = toutes.filter((x) => x.type !== "p" || !x.defendue);
    const grosses = menaces.filter((x) => VAL[x.type] >= 3 || !x.defendue);
    const faible = toutes.find((x) => x.type === "p" && (x.sq === "f7" || x.sq === "f2"));
    if (grosses.length >= 2 && !m.san.endsWith("+")) phrases.push(`Fourchette : ${ART[t]} attaque en même temps ${grosses.slice(0, 3).map((x) => `${ART[x.type]} en ${x.sq}`).join(" et ")}.`);
    else if (grosses.length) phrases.push(grosses[0].defendue ? `Attaque ${ART[grosses[0].type]} en ${grosses[0].sq} (il est protégé : ce n'est pas une menace directe, mais cela gêne l'adversaire).` : `Menace de prendre ${ART[grosses[0].type]} en ${grosses[0].sq}, qui n'est pas protégé !`);
    else if (faible) phrases.push(`Vise ${faible.sq} : au départ, cette case n'est protégée que par le roi, c'est le point faible de la position.`);
  }

  // ── Sécurité de la pièce posée ──
  if (t !== "k" && t !== "p" && !m.captured && !m.san.includes("#") && !m.san.includes("+") && c.isAttacked(to, adv)) {
    phrases.push(c.isAttacked(to, couleur) ? "La pièce est attaquée mais protégée : un échange resterait équilibré." : "Attention : la pièce est attaquée et non protégée.");
  }
  return phrases.slice(0, 3).join(" ");
}

/** Explication de tous les coups d'une ligne : tableau indexé comme les notes (ply 1-based → texte). */
export function expliquerLigne(coups) {
  const c = new Chess();
  const out = {};
  for (let i = 0; i < coups.length; i++) {
    const t = expliquerCoup(c.fen(), coups[i]);
    if (t) out[i + 1] = t;
    c.move(coups[i]);
  }
  return out;
}

const THEME_PHRASE = {
  "mat-du-couloir": "Le roi est enfermé sur sa dernière rangée par ses propres pions : une tour ou une dame qui arrive sur cette rangée donne mat.",
  "mat-etouffe": "Le roi est entouré de ses propres pièces : il ne peut pas bouger, et un cavalier (qui ne peut pas être bloqué) donne mat.",
  clouage: "Une pièce adverse est clouée : si elle bouge, elle expose une pièce plus précieuse derrière elle.",
  enfilade: "Quand la pièce de devant s'écarte, la pièce de derrière est prise.",
  "double-echec": "Deux pièces donnent échec en même temps : seul le roi peut répondre, en bougeant.",
  fourchette: "Une même pièce attaque deux cibles : l'adversaire ne peut en sauver qu'une seule.",
  "piece-en-prise": "Une pièce adverse n'est pas protégée : avant de jouer, demande-toi toujours « qu'est-ce qui est en prise ? ».",
  promotion: "Un pion arrive à la dernière rangée et devient une dame : c'est un gain énorme.",
};

/**
 * Explication d'un problème : phrase de thème + déroulé de la solution coup par coup.
 * @param {{fen:string, moves:string[], themes:string[]}} p  (moves en UCI, moves[0] = la gaffe adverse)
 * @returns {{theme:string[], etapes:{san:string, texte:string, eleve:boolean}[]}}
 */
export function expliquerPuzzle(p) {
  const c = new Chess(p.fen);
  const etapes = [];
  p.moves.forEach((u, i) => {
    const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    c.undo();
    const texte = i === 0
      ? `L'adversaire vient de jouer ${m.san} : c'est l'erreur qui rend la tactique possible.`
      : expliquerCoup(c.fen(), m.san);
    c.move(m.san);
    etapes.push({ san: m.san, texte, eleve: i % 2 === 1 });
  });
  const theme = (p.themes || []).map((t) => THEME_PHRASE[t]).filter(Boolean);
  return { theme, etapes };
}
