// Logique d'une finale (sans DOM, testable en Node). Interface compatible avec Drill/Puzzle :
// termine, auTraitDeLEleve, couleur, fen, cibles, tenter, idx, note.
// L'élève joue un camp ; l'adversaire est joué par Stockfish (côté main.js) via jouerAdverse().
//
// objectif : "mat"       → gagner en donnant mat
//            "promotion" → gagner : promouvoir un pion (ou mater)
//            "nulle"     → tenir la nulle (pat, matériel insuffisant, répétition, 50 coups, ou survivre `limite` coups)
import { Chess } from "../vendor/chess.js";

export class Finale {
  /** @param {{fen:string, eleve:'w'|'b', objectif:string, limite:number}} def */
  constructor(def) {
    this.def = def;
    this.couleur = def.eleve;
    this.limite = def.limite;
    this.recommencer();
  }

  recommencer() {
    this.chess = new Chess(this.def.fen);
    this.coups = 0; // coups joués par l'élève
    this.erreurs = 0; // grosses erreurs (chute de l'évaluation)
    this.aides = 0;
    this.resultat = null; // null | "ok" | "rate"
    this.raison = "";
    this.dernierCoup = null;
    this.pile = []; // pour annuler : nombre de demi-coups ajoutés à chaque tour de l'élève
    this.demi = 0;
    this.note = null;
    this._verifier();
  }

  get idx() { return this.chess.history().length; }
  get fen() { return this.chess.fen(); }
  get termine() { return this.resultat !== null; }
  get auTraitDeLEleve() { return !this.termine && this.chess.turn() === this.couleur; }
  get reussi() { return this.resultat === "ok" && this.erreurs === 0 && this.aides === 0; }
  get peutAnnuler() { return this.pile.length > 0; }

  cibles(depuis) { return this.chess.moves({ square: depuis, verbose: true }); }

  /** L'élève joue. @returns {{ok:true,coup}|{ok:false,illegal:true}} */
  tenter(from, to, promotion = "q") {
    if (!this.auTraitDeLEleve) return { ok: false, illegal: true };
    const legal = this.chess.moves({ square: from, verbose: true }).find((m) => m.to === to && (!m.promotion || m.promotion === promotion));
    if (!legal) return { ok: false, illegal: true };
    const coup = this.chess.move({ from, to, promotion: legal.promotion });
    this.dernierCoup = coup;
    this.coups++;
    this.pile.push(1);
    this._verifier(coup);
    return { ok: true, coup, termine: this.termine };
  }

  /** Joue le coup de l'adversaire (UCI, donné par le moteur). */
  jouerAdverse(uci) {
    if (this.termine || this.auTraitDeLEleve) return null;
    let coup = null;
    try { coup = this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { coup = null; }
    if (!coup) { // sécurité : coup moteur illisible → premier coup légal
      const l = this.chess.moves({ verbose: true });
      if (!l.length) return null;
      coup = this.chess.move(l[0]);
    }
    if (this.pile.length) this.pile[this.pile.length - 1]++;
    this.dernierCoup = coup;
    this._verifier(coup);
    return coup;
  }

  /** Annule le dernier tour de l'élève (son coup et la réponse adverse). */
  annuler() {
    if (!this.pile.length) return false;
    const n = this.pile.pop();
    for (let i = 0; i < n; i++) this.chess.undo();
    this.coups--;
    this.resultat = null;
    this.raison = "";
    const h = this.chess.history({ verbose: true });
    this.dernierCoup = h.length ? h[h.length - 1] : null;
    return true;
  }

  _fin(res, raison) { this.resultat = res; this.raison = raison; }

  _verifier(coup) {
    const c = this.chess, o = this.def.objectif, moi = this.couleur;
    if (c.isCheckmate()) {
      const maten = c.turn() !== moi; // le camp au trait est mat : c'est moi qui ai maté si le trait est à l'adversaire
      return this._fin(maten ? "ok" : "rate", maten ? "Échec et mat !" : "Tu t'es fait mater.");
    }
    if (c.isStalemate()) return o === "nulle" ? this._fin("ok", "Pat : nulle obtenue !") : this._fin("rate", "PAT ! La partie est nulle : il fallait laisser une case au roi adverse.");
    if (c.isInsufficientMaterial()) return o === "nulle" ? this._fin("ok", "Matériel insuffisant : nulle obtenue !") : this._fin("rate", "Plus assez de matériel pour mater : nulle.");
    if (c.isThreefoldRepetition() || c.isDrawByFiftyMoves()) return o === "nulle" ? this._fin("ok", "Nulle par répétition / 50 coups : bien tenu !") : this._fin("rate", "Nulle par répétition ou règle des 50 coups : tu tournais en rond.");
    if (coup && coup.promotion) {
      if (coup.color === moi && o !== "nulle") return this._fin("ok", "Pion promu : la victoire est assurée !");
      if (coup.color !== moi) return this._fin("rate", "L'adversaire a promu un pion.");
    }
    if (this.coups >= this.limite && c.turn() === moi && !this.termine) {
      return o === "nulle" ? this._fin("ok", `Tu as tenu ${this.limite} coups : bien défendu !`) : this._fin("rate", `Trop lent : il fallait réussir en ${this.limite} coups maximum.`);
    }
  }
}
