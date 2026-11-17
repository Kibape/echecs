// Logique d'un puzzle tactique (sans DOM, testable en Node). Même interface que Drill (drill.js),
// ce qui permet de réutiliser tel quel le flux de l'app : premove, marqueur ✕, sons, indices.
//
// Format (identique à la base de puzzles Lichess) :
//   fen   = position AVANT le coup de l'adversaire
//   moves = [coup de l'adversaire, solution élève, réponse adverse, solution élève, …] en notation UCI
// L'élève joue donc les coups d'indice impair ; à la fin d'un mat, n'importe quel autre mat est aussi accepté.
import { Chess } from "../vendor/chess.js";

const versUci = (m) => m.from + m.to + (m.promotion || "");
const depuisUci = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

export class Puzzle {
  /** @param {{fen:string, moves:string[]}} p */
  constructor({ fen, moves }) {
    this.fen0 = fen;
    this.moves = moves;
    this.chess = new Chess(fen);
    this.idx = 0; // nombre de demi-coups déjà joués (le 1er est celui de l'adversaire)
    this.erreurs = 0;
    this.aides = 0;
    this.dernierCoup = null;
    this.mateAlternatif = false;
    const t = new Chess(fen);
    t.move(depuisUci(moves[0]));
    this.couleur = t.turn(); // l'élève joue le camp qui a le trait après la gaffe
    this.notes = {};
  }

  get termine() { return this.idx >= this.moves.length; }
  get auTraitDeLEleve() { return !this.termine && this.idx % 2 === 1; }
  get attendu() { return this.moves[this.idx] || null; }
  get fen() { return this.chess.fen(); }
  get note() { return null; }
  get coups() { return this.moves; }

  _appliquer(uci) {
    const m = this.chess.move(depuisUci(uci));
    this.idx++;
    this.dernierCoup = m;
    return m;
  }

  /** Joue le coup de l'adversaire (la gaffe au départ, puis les réponses). */
  jouerAdversaire() {
    if (this.termine || this.auTraitDeLEleve) return null;
    return this._appliquer(this.attendu);
  }

  cibles(depuis) { return this.chess.moves({ square: depuis, verbose: true }); }

  coupAttendu() {
    if (!this.auTraitDeLEleve) return null;
    const u = depuisUci(this.attendu);
    return this.chess.moves({ verbose: true }).find((m) => m.from === u.from && m.to === u.to && (m.promotion || undefined) === u.promotion) || null;
  }

  /**
   * @returns {{ok:true, coup:object, termine:boolean, alternatif?:boolean}
   *          |{ok:false, illegal:true}|{ok:false, illegal:false, erreurs:number}}
   */
  tenter(from, to, promotion = "q") {
    if (!this.auTraitDeLEleve) return { ok: false, illegal: true };
    const legal = this.chess.moves({ square: from, verbose: true }).find((m) => m.to === to && (!m.promotion || m.promotion === promotion));
    if (!legal) return { ok: false, illegal: true };
    const attendu = depuisUci(this.attendu);
    const memeCoup = legal.from === attendu.from && legal.to === attendu.to && (legal.promotion || undefined) === attendu.promotion;
    if (memeCoup) {
      const coup = this._appliquer(this.attendu);
      return { ok: true, coup, termine: this.termine };
    }
    if (legal.san.endsWith("#")) { // un autre mat est aussi une bonne réponse
      const coup = this.chess.move({ from: legal.from, to: legal.to, promotion: legal.promotion });
      this.idx = this.moves.length;
      this.dernierCoup = coup;
      this.mateAlternatif = true;
      return { ok: true, coup, termine: true, alternatif: true };
    }
    this.erreurs++;
    return { ok: false, illegal: false, erreurs: this.erreurs };
  }

  /** Indice : le coup attendu (compte comme une aide). */
  indice() {
    const m = this.coupAttendu();
    if (m) this.aides++;
    return m;
  }

  /** Réussi du premier coup = ni erreur, ni aide. */
  get reussi() { return this.erreurs === 0 && this.aides === 0; }

  recommencer() {
    this.chess = new Chess(this.fen0);
    this.idx = 0;
    this.erreurs = 0;
    this.aides = 0;
    this.dernierCoup = null;
    this.mateAlternatif = false;
  }
}

export { versUci };
