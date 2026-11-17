// Enveloppe UCI autour de Stockfish (WASM, dans un Web Worker : l'interface ne gèle jamais).
// Une seule recherche à la fois : si une nouvelle position arrive, on envoie "stop" puis on relance
// APRÈS le "bestmove" de la recherche précédente (sinon les lignes "info" se mélangent).
import { versBlancs } from "./evalmath.js";

/** Transport navigateur : un Worker qui parle UCI par postMessage. */
export function transportWorker(url) {
  const w = new Worker(url);
  const t = {
    send: (ligne) => w.postMessage(ligne),
    onmessage: null,
    onerror: null,
    terminate: () => w.terminate(),
  };
  w.onmessage = (e) => t.onmessage && t.onmessage(typeof e.data === "string" ? e.data : String(e.data));
  w.onerror = (e) => t.onerror && t.onerror(e);
  return t;
}

const RE_INFO = /^info .*?\bdepth (\d+)\b.*?\bscore (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?/;
const RE_PV = /\bpv (\S+)/;

export class Engine {
  /** @param {() => {send:Function,onmessage:any,terminate:Function}} creerTransport */
  constructor(creerTransport) {
    this.creerTransport = creerTransport;
    this.pret = false;
    this.occupe = false;
    this.courant = null;
    this.suivant = null;
    this.t = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      try { this.t = this.creerTransport(); } catch (e) { reject(e); return; }
      this.t.onerror = (e) => reject(e);
      const delai = setTimeout(() => reject(new Error("Stockfish ne répond pas")), 15000);
      let envoye = false;
      this.t.onmessage = (ligne) => {
        // Tolérant : certaines enveloppes collent plusieurs réponses ("uciokreadyok").
        if (ligne.includes("uciok") && !envoye) {
          envoye = true;
          this.t.send("setoption name Hash value 32");
          this.t.send("isready");
        }
        if (ligne.includes("readyok")) {
          clearTimeout(delai);
          this.pret = true;
          this.t.onmessage = (l) => this._ligne(l);
          resolve();
        }
      };
      this.t.send("uci");
    });
  }

  /**
   * Analyse une position.
   * @returns {Promise<null | {score:object, scoreBlancs:object, depth:number, bestmove:string|null, pv:string|null}>}
   *   null si la recherche a été remplacée par une plus récente.
   */
  analyser(fen, { movetime = 700, depth = 18, onUpdate = null } = {}) {
    if (!this.pret) return Promise.resolve(null);
    return new Promise((resolve) => {
      const req = { fen, movetime, depth, onUpdate, resolve, trait: fen.split(" ")[1] === "b" ? "b" : "w", dernier: null };
      if (this.occupe) {
        if (this.suivant) this.suivant.resolve(null);
        this.suivant = req;
        this.t.send("stop");
      } else {
        this._lancer(req);
      }
    });
  }

  arreter() {
    if (this.suivant) { this.suivant.resolve(null); this.suivant = null; }
    if (this.occupe) this.t.send("stop");
  }

  detruire() {
    try { this.t && this.t.terminate(); } catch { /* rien */ }
    this.pret = false;
  }

  _lancer(req) {
    this.occupe = true;
    this.courant = req;
    this.t.send(`position fen ${req.fen}`);
    this.t.send(`go depth ${req.depth} movetime ${req.movetime}`);
  }

  _ligne(brut) {
    // Un message peut contenir plusieurs lignes (selon l'enveloppe) : on les traite une par une.
    for (const l of String(brut).split(/\r?\n/)) if (l) this._traiter(l);
  }

  _traiter(ligne) {
    const req = this.courant;
    if (!req) return;
    if (ligne.startsWith("info")) {
      const m = RE_INFO.exec(ligne);
      if (!m || m[4]) return; // on ignore lowerbound/upperbound : valeurs instables
      const score = m[2] === "cp" ? { cp: +m[3] } : { mate: +m[3] };
      const pv = RE_PV.exec(ligne);
      req.dernier = { score, scoreBlancs: versBlancs(score, req.trait), depth: +m[1], pv: pv ? pv[1] : null, bestmove: pv ? pv[1] : null };
      if (req.onUpdate && req.dernier.depth >= 4) req.onUpdate(req.dernier);
    } else if (ligne.startsWith("bestmove")) {
      const bm = ligne.split(/\s+/)[1];
      const fin = req.dernier ? { ...req.dernier, bestmove: bm && bm !== "(none)" ? bm : null } : null;
      this.occupe = false;
      this.courant = null;
      req.resolve(this.suivant ? null : fin);
      if (this.suivant) {
        const s = this.suivant;
        this.suivant = null;
        this._lancer(s);
      }
    }
  }
}
