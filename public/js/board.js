// Échiquier DOM : pièces déplacées par transform (animation CSS, aucun re-rendu complet pendant la partie).
// Glisser-déposer + clic-clic, coups légaux affichés, choix de promotion, premove (surbrillance),
// flèches et cases dessinées au clic droit (couleur selon Maj/Ctrl/Alt), marqueur d'erreur ✕ sur la case.
import { Son } from "./sound.js";

const FICHIERS = "abcdefgh";
const NS = "http://www.w3.org/2000/svg";
const idx = (sq) => ({ f: sq.charCodeAt(0) - 97, r: +sq[1] - 1 });
const nom = (f, r) => FICHIERS[f] + (r + 1);
const couleurDe = (e) => (e.shiftKey ? "vert" : e.ctrlKey ? "rouge" : e.altKey ? "bleu" : "orange");

export class Board {
  /**
   * @param {HTMLElement} el conteneur
   * @param {object} opts
   * @param {(from:string)=>Array<{to:string,promotion?:string}>} opts.cibles coups possibles depuis une case
   * @param {(from:string,to:string,promotion?:string)=>boolean} opts.surCoup true si le coup est accepté (la pièce reste)
   * @param {()=>void} [opts.surEffacer] appelé quand l'utilisateur clique dans le vide ou fait un clic droit (annule un premove)
   */
  constructor(el, { cibles, surCoup, surEffacer = null }) {
    this.el = el;
    this.cibles = cibles;
    this.surCoup = surCoup;
    this.surEffacer = surEffacer;
    this.orientation = "w";
    this.autorise = null; // 'w' | 'b' | 'both' | null
    this.pieces = new Map();
    this.selection = null;
    this.derniers = [];
    this.fleches = []; // flèches d'aide (indice, meilleur coup)
    this.dessins = { fleches: [], cases: [] }; // dessins de l'utilisateur (clic droit)
    this.premove = null;
    this.instantane = false; // vrai pendant un coup joué à la main : la pièce apparaît tout de suite (pas de glissement)
    this.drag = null;
    this.dessin = null;
    this._tBadge = null;

    el.classList.add("board");
    el.innerHTML = "";
    this.coucheHL = h("div", "hls");
    this.couchePieces = h("div", "pieces");
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("viewBox", "0 0 8 8");
    this.svg.setAttribute("class", "arrows");
    this.coucheBadge = h("div", "badges");
    this.promo = h("div", "promo");
    this.promo.hidden = true;

    this.cases = {};
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const d = h("div", "sq " + ((f + r) % 2 === 0 ? "dark" : "light"));
      d.dataset.sq = nom(f, r);
      el.appendChild(d);
      this.cases[nom(f, r)] = d;
    }
    el.append(this.coucheHL, this.couchePieces, this.svg, this.coucheBadge, this.promo);
    this._placerCases();

    el.addEventListener("pointerdown", (e) => this._down(e));
    el.addEventListener("pointermove", (e) => this._move(e));
    el.addEventListener("pointerup", (e) => this._up(e));
    el.addEventListener("pointercancel", () => { this._annulerDrag(); this.dessin = null; this._redessiner(); });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // ─────────── Géométrie ───────────
  _xy(sq) {
    const { f, r } = idx(sq);
    return this.orientation === "w" ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  }

  _placerCases() {
    for (const sq in this.cases) {
      const { x, y } = this._xy(sq);
      const d = this.cases[sq];
      d.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
      d.dataset.fichier = y === 7 ? sq[0] : "";
      d.dataset.rang = x === 0 ? sq[1] : "";
    }
  }

  _poser(el, sq, instant = false) {
    const { x, y } = this._xy(sq);
    if (instant) this._sansAnim(el);
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    el.dataset.sq = sq;
  }

  /** Coupe la transition CSS le temps d'un déplacement (elle est rétablie après deux images). */
  _sansAnim(el) {
    el.classList.add("instant");
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("instant")));
  }

  _caseSousPointeur(e) {
    const r = this.el.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * 8);
    const y = Math.floor(((e.clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return this.orientation === "w" ? nom(x, 7 - y) : nom(7 - x, y);
  }

  // ─────────── Position ───────────
  _creerPiece(type, couleur, sq) {
    const p = h("div", `piece ${couleur} t${type}`);
    this._poser(p, sq);
    this.couchePieces.appendChild(p);
    this.pieces.set(sq, p);
    return p;
  }

  /** Reconstruit toutes les pièces depuis un FEN (sans animation, sans son). */
  setFen(fen) {
    this.couchePieces.innerHTML = "";
    this.pieces.clear();
    this.premove = null;
    const lignes = fen.split(" ")[0].split("/");
    for (let i = 0; i < 8; i++) {
      let f = 0;
      for (const c of lignes[i]) {
        if (/\d/.test(c)) f += +c;
        else { this._creerPiece(c.toLowerCase(), c === c.toLowerCase() ? "b" : "w", nom(f, 7 - i)); f++; }
      }
    }
    this.effacerSelection();
    this.effacerBadge();
    this.effacerDessins();
  }

  /** Applique un coup (objet chess.js) avec animation et son. */
  jouer(m, { son = true } = {}) {
    if (this.selection) this._selPrec = this.selection.from; // on se souvient de la pièce choisie : elle sera re-sélectionnée après le coup adverse
    this.effacerSelection();
    this.effacerBadge();
    this.effacerDessins();
    const el = this.pieces.get(m.from);
    if (!el) return;
    let capSq = m.to;
    if (m.flags.includes("e")) capSq = m.to[0] + m.from[1];
    const cap = this.pieces.get(capSq);
    if (cap && cap !== el) { cap.remove(); this.pieces.delete(capSq); }
    if (m.flags.includes("k") || m.flags.includes("q")) {
      const rang = m.from[1];
      const [de, vers] = m.flags.includes("k") ? ["h" + rang, "f" + rang] : ["a" + rang, "d" + rang];
      const tour = this.pieces.get(de);
      if (tour) { this.pieces.delete(de); this.pieces.set(vers, tour); this._poser(tour, vers, this.instantane); }
    }
    this.pieces.delete(m.from);
    this.pieces.set(m.to, el);
    el.classList.remove("premoved");
    this._poser(el, m.to, this.instantane);
    if (m.promotion) el.className = `piece ${m.color} t${m.promotion}`;
    this.marquerDernier(m.from, m.to);
    if (son) Son.coup(m);
  }

  marquerDernier(from, to) {
    for (const s of this.derniers) this.cases[s].classList.remove("last");
    this.derniers = from ? [from, to] : [];
    for (const s of this.derniers) this.cases[s].classList.add("last");
  }

  orienter(couleur) {
    if (couleur === this.orientation) return;
    this.orientation = couleur;
    this.el.classList.toggle("flipped", couleur === "b");
    this._placerCases();
    for (const [sq, el] of this.pieces) this._poser(el, sq);
    if (this.premove) { const el = this.pieces.get(this.premove.from); if (el) this._poser(el, this.premove.to, true); }
    this._redessiner();
  }

  // ─────────── Sélection / cibles ───────────
  /** Après un coup adverse : on remet la sélection de l'utilisateur (avec les nouvelles cibles) au lieu de la perdre. */
  rafraichirSelection() {
    const sq = this._selPrec;
    this._selPrec = null;
    if (sq && !this.selection && this.pieces.get(sq) && this._peutJouer(sq)) this._selectionner(sq);
  }

  effacerSelection() {
    this.selection = null;
    for (const d of Object.values(this.cases)) d.classList.remove("sel", "tgt", "tgt-cap");
  }

  _selectionner(sq) {
    this.effacerSelection();
    const coups = this.cibles(sq);
    if (!coups.length) return false;
    this.selection = { from: sq, coups };
    this.cases[sq].classList.add("sel");
    for (const c of coups) this.cases[c.to].classList.add(this.pieces.has(c.to) ? "tgt-cap" : "tgt");
    return true;
  }

  _peutJouer(sq) {
    const p = this.pieces.get(sq);
    if (!p || !this.autorise) return false;
    const couleur = p.classList.contains("w") ? "w" : "b";
    return this.autorise === "both" || this.autorise === couleur;
  }

  _essayer(from, to) {
    const candidats = this.selection ? this.selection.coups.filter((c) => c.to === to) : this.cibles(from).filter((c) => c.to === to);
    if (!candidats.length) return false;
    if (candidats.some((c) => c.promotion)) { this._demanderPromotion(from, to); return true; }
    return this._valider(from, to, undefined);
  }

  _valider(from, to, promotion) {
    this.instantane = true;
    let ok;
    try { ok = this.surCoup(from, to, promotion); } finally { this.instantane = false; }
    const pm = this.premove && this.premove.from === from; // coup préparé d'avance : la pièce reste sur sa case d'arrivée
    if (!ok && !pm) this._rendre(from);
    this.effacerSelection();
    return ok;
  }

  _rendre(sq) { const el = this.pieces.get(sq); if (el) this._poser(el, sq, true); }

  _demanderPromotion(from, to) {
    const p = this.pieces.get(from);
    const couleur = p.classList.contains("w") ? "w" : "b";
    this.promo.innerHTML = "";
    for (const t of ["q", "r", "b", "n"]) {
      const b = h("button", `piece-choix ${couleur} t${t}`);
      b.setAttribute("aria-label", { q: "Dame", r: "Tour", b: "Fou", n: "Cavalier" }[t]);
      b.onclick = () => { this.promo.hidden = true; this._valider(from, to, t); };
      this.promo.appendChild(b);
    }
    this.promo.hidden = false;
  }

  // ─────────── Marqueurs : erreur ✕ / réussite ✓ ───────────
  /** @param {'x'|'ok'} type  affiche un pastille sur la case (comme chess.com) pendant ~1,6 s */
  badge(sq, type = "x") {
    this.effacerBadge();
    const b = h("div", `badge-case ${type}`);
    const { x, y } = this._xy(sq);
    b.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    b.append(h("span", "pico", type === "x" ? "✕" : "✓"));
    this.coucheBadge.appendChild(b);
    clearTimeout(this._tBadge);
    this._tBadge = setTimeout(() => this.effacerBadge(), 1600);
  }

  effacerBadge() { clearTimeout(this._tBadge); this.coucheBadge.innerHTML = ""; }

  // ─────────── Premove ───────────
  /** Comme chess.com : la pièce est déjà affichée sur sa case d'arrivée pendant que l'adversaire réfléchit. */
  marquerPremove(from, to) {
    this._restaurerPremove();
    this.premove = { from, to };
    const el = this.pieces.get(from);
    if (el) { el.classList.add("premoved"); this._poser(el, to, true); }
    this._redessiner();
  }

  _restaurerPremove() {
    if (!this.premove) return;
    const el = this.pieces.get(this.premove.from);
    if (el) { el.classList.remove("premoved"); this._poser(el, this.premove.from, true); }
  }

  effacerPremove() {
    if (!this.premove) return;
    this._restaurerPremove();
    this.premove = null;
    this._redessiner();
  }

  // ─────────── Pointeur ───────────
  _down(e) {
    Son.debloquer();
    if (!this.promo.hidden) return;
    if (e.button === 2) { // clic droit : dessiner
      e.preventDefault();
      const sq = this._caseSousPointeur(e);
      if (!sq) return;
      if (this.surEffacer) this.surEffacer();
      this.dessin = { from: sq, to: sq, couleur: couleurDe(e), id: e.pointerId };
      try { this.el.setPointerCapture(e.pointerId); } catch { /* ok */ }
      return;
    }
    if (e.button !== 0) return;
    if (this.dessins.fleches.length || this.dessins.cases.length) this.effacerDessins();
    const sq = this._caseSousPointeur(e);
    if (!sq) return;
    if (this.selection && this.selection.coups.some((c) => c.to === sq)) { this._essayer(this.selection.from, sq); return; }
    if (this._peutJouer(sq) && this._selectionner(sq)) {
      const el = this.pieces.get(sq);
      this.drag = { from: sq, el, x0: e.clientX, y0: e.clientY, deplace: false, id: e.pointerId };
      try { this.el.setPointerCapture(e.pointerId); } catch { /* ok */ }
    } else {
      this.effacerSelection();
      if (this.surEffacer) this.surEffacer();
    }
  }

  _move(e) {
    if (this.dessin) {
      const sq = this._caseSousPointeur(e) || this.dessin.to;
      if (sq !== this.dessin.to) { this.dessin.to = sq; this._redessiner(); }
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (!d.deplace && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
    d.deplace = true;
    d.el.classList.add("dragging");
    const r = this.el.getBoundingClientRect();
    const t = r.width / 8;
    d.el.style.transform = `translate(${e.clientX - r.left - t / 2}px, ${e.clientY - r.top - t / 2}px)`;
  }

  _up(e) {
    if (this.dessin) {
      const d = this.dessin;
      this.dessin = null;
      try { this.el.releasePointerCapture(d.id); } catch { /* ok */ }
      const sq = this._caseSousPointeur(e) || d.to;
      this._basculer(d.from, sq, d.couleur);
      return;
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.el.classList.remove("dragging");
    try { this.el.releasePointerCapture(d.id); } catch { /* ok */ }
    if (!d.deplace) { this._rendre(d.from); return; }
    const sq = this._caseSousPointeur(e);
    // Les cibles sont recalculées au moment du lâcher : l'adversaire a pu jouer pendant qu'on tenait la pièce.
    if (sq && sq !== d.from && this.cibles(d.from).some((c) => c.to === sq)) this._essayer(d.from, sq);
    else { this._rendre(d.from); this.effacerSelection(); }
  }

  _annulerDrag() {
    if (!this.drag) return;
    this.drag.el.classList.remove("dragging");
    this._rendre(this.drag.from);
    this.drag = null;
    this.effacerSelection();
  }

  // ─────────── Dessins de l'utilisateur ───────────
  /** Même case : bascule la surbrillance ; deux cases : bascule la flèche. Même tracé + autre couleur = remplace. */
  _basculer(from, to, couleur) {
    const D = this.dessins;
    if (from === to) {
      const i = D.cases.findIndex((c) => c.sq === from);
      if (i >= 0) { const same = D.cases[i].couleur === couleur; D.cases.splice(i, 1); if (!same) D.cases.push({ sq: from, couleur }); }
      else D.cases.push({ sq: from, couleur });
    } else {
      const i = D.fleches.findIndex((f) => f.from === from && f.to === to);
      if (i >= 0) { const same = D.fleches[i].couleur === couleur; D.fleches.splice(i, 1); if (!same) D.fleches.push({ from, to, couleur }); }
      else D.fleches.push({ from, to, couleur });
    }
    this._redessiner();
  }

  /** Surbrillance d'une case (utilisée pour les indices). */
  surligner(sq, couleur = "bleu") {
    if (!this.dessins.cases.some((c) => c.sq === sq && c.couleur === couleur)) this.dessins.cases.push({ sq, couleur });
    this._redessiner();
  }

  effacerDessins() {
    if (!this.dessins.fleches.length && !this.dessins.cases.length && !this.dessin) return;
    this.dessins = { fleches: [], cases: [] };
    this.dessin = null;
    this._redessiner();
  }

  // ─────────── Flèches d'aide ───────────
  effacerFleches() { if (!this.fleches.length) return; this.fleches = []; this._redessiner(); }

  fleche(from, to, type = "indice") {
    this.fleches.push({ from, to, type });
    this._redessiner();
  }

  // ─────────── Rendu des couches (surbrillances + flèches) ───────────
  _redessiner() {
    this.coucheHL.innerHTML = "";
    const hl = (sq, cls) => {
      const d = h("div", "hl " + cls);
      const { x, y } = this._xy(sq);
      d.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
      this.coucheHL.appendChild(d);
    };
    if (this.premove) { hl(this.premove.from, "premove"); hl(this.premove.to, "premove"); }
    for (const c of this.dessins.cases) hl(c.sq, c.couleur);
    if (this.dessin && this.dessin.from === this.dessin.to) hl(this.dessin.from, this.dessin.couleur + " apercu");

    this.svg.innerHTML = "";
    for (const f of this.fleches) this._fleche(f.from, f.to, f.type, 0.85);
    for (const f of this.dessins.fleches) this._fleche(f.from, f.to, f.couleur, 0.8);
    if (this.dessin && this.dessin.from !== this.dessin.to) this._fleche(this.dessin.from, this.dessin.to, this.dessin.couleur, 0.55);
  }

  /** Flèche épaisse et translucide ; en L pour les coups de cavalier (comme chess.com). */
  _fleche(from, to, cls, opacite) {
    const a = this._xy(from), b = this._xy(to);
    const x1 = a.x + 0.5, y1 = a.y + 0.5, x2 = b.x + 0.5, y2 = b.y + 0.5;
    const adx = Math.abs(x2 - x1), ady = Math.abs(y2 - y1);
    let pts;
    if ((adx === 1 && ady === 2) || (adx === 2 && ady === 1)) pts = [[x1, y1], adx === 2 ? [x2, y1] : [x1, y2], [x2, y2]];
    else pts = [[x1, y1], [x2, y2]];
    const fin = pts[pts.length - 1], av = pts[pts.length - 2];
    const L = Math.hypot(fin[0] - av[0], fin[1] - av[1]) || 1;
    const ux = (fin[0] - av[0]) / L, uy = (fin[1] - av[1]) / L;
    const tete = 0.34, demi = 0.2;
    const base = [fin[0] - ux * tete, fin[1] - uy * tete];
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "arrow " + cls);
    g.setAttribute("opacity", opacite);
    const chemin = document.createElementNS(NS, "path");
    const corps = pts.slice(0, -1).concat([[base[0] + ux * 0.02, base[1] + uy * 0.02]]);
    chemin.setAttribute("d", "M" + corps.map((p) => p.join(",")).join(" L"));
    chemin.setAttribute("stroke-width", "0.18");
    chemin.setAttribute("stroke-linejoin", "round");
    chemin.setAttribute("stroke-linecap", "round");
    chemin.setAttribute("fill", "none");
    const poly = document.createElementNS(NS, "polygon");
    poly.setAttribute("points", `${fin[0] - ux * 0.04},${fin[1] - uy * 0.04} ${base[0] - uy * demi},${base[1] + ux * demi} ${base[0] + uy * demi},${base[1] - ux * demi}`);
    g.append(chemin, poly);
    this.svg.appendChild(g);
  }
}

function h(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}
