// Logique d'entraînement d'une ligne d'ouverture (sans aucun DOM : testable en Node).
import { Chess } from "../vendor/chess.js";
import { qualite } from "./srs.js";

export class Drill {
  /**
   * @param {object} p
   * @param {string[]} p.coups  ligne en SAN anglais
   * @param {'blancs'|'noirs'} p.camp  camp joué par l'élève
   * @param {Record<string,string>} [p.notes] notes par numéro de demi-coup (1-based)
   * @param {number} [p.depart] demi-coups joués d'office avant de commencer (reprise à une divergence)
   */
  constructor({ coups, camp, notes = {}, depart = 0 }) {
    this.coups = coups;
    this.couleur = camp === "blancs" ? "w" : "b";
    this.notes = notes;
    this.chess = new Chess();
    this.idx = 0; // nombre de demi-coups déjà joués
    this.erreurs = 0;
    this.aides = 0;
    this.dernierCoup = null;
    this.depart = Math.max(0, Math.min(depart, coups.length - 1)); // l'entraînement reprend après ce nombre de demi-coups
    for (let i = 0; i < this.depart; i++) this._appliquer(coups[i]);
  }

  get termine() { return this.idx >= this.coups.length; }
  get auTraitDeLEleve() { return !this.termine && this.chess.turn() === this.couleur; }
  get attendu() { return this.coups[this.idx] || null; }
  get fen() { return this.chess.fen(); }
  get note() { return this.notes[this.idx] || null; } // note du dernier coup joué (idx = nb de demi-coups joués)
  get qualite() { return qualite(this.erreurs, this.aides); }

  _appliquer(san) {
    const m = this.chess.move(san);
    this.idx++;
    this.dernierCoup = m;
    return m;
  }

  /** Joue le coup de l'adversaire si c'est son tour. Renvoie le coup (objet chess.js) ou null. */
  jouerAdversaire() {
    if (this.termine || this.auTraitDeLEleve) return null;
    return this._appliquer(this.attendu);
  }

  /** Coups légaux depuis une case (pour afficher les cibles). */
  cibles(depuis) {
    return this.chess.moves({ square: depuis, verbose: true });
  }

  /**
   * L'élève tente un coup.
   * @returns {{ok:true, coup:object, note:string|null, termine:boolean}
   *          |{ok:false, illegal:true}
   *          |{ok:false, illegal:false, erreurs:number}}
   */
  tenter(from, to, promotion = "q") {
    if (!this.auTraitDeLEleve) return { ok: false, illegal: true };
    const legal = this.chess.moves({ square: from, verbose: true }).find((m) => m.to === to && (!m.promotion || m.promotion === promotion));
    if (!legal) return { ok: false, illegal: true };
    if (legal.san === this.attendu) {
      const coup = this._appliquer(legal.san);
      return { ok: true, coup, note: this.note, termine: this.termine };
    }
    this.erreurs++;
    return { ok: false, illegal: false, erreurs: this.erreurs };
  }

  /** Indice : renvoie le coup attendu (from/to/san). Compte comme une aide. */
  indice() {
    const m = this.coupAttendu();
    if (m) this.aides++;
    return m;
  }

  /** Coup attendu sans pénalité (utilisé par le mode "apprendre"). */
  coupAttendu() {
    if (!this.auTraitDeLEleve) return null;
    return this.chess.moves({ verbose: true }).find((m) => m.san === this.attendu) || null;
  }

  recommencer() {
    this.chess = new Chess();
    this.idx = 0;
    this.erreurs = 0;
    this.aides = 0;
    this.dernierCoup = null;
  }
}

/** Positions successives d'une ligne (pour le mode "découvrir" : naviguer ◀ ▶). */
export function positionsDeLigne(coups) {
  const c = new Chess();
  const fens = [c.fen()];
  const coupsVerbose = [];
  for (const san of coups) {
    coupsVerbose.push(c.move(san));
    fens.push(c.fen());
  }
  return { fens, coups: coupsVerbose };
}
