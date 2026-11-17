// Sauvegarde locale (localStorage). Tout reste sur ton ordinateur.
// Export / import JSON pour sauvegarder ou transférer la progression (ex. vers ton téléphone plus tard).

const CLE = "echecs-entraineur.v1";

const DEFAUTS = () => ({
  v: 1,
  cartes: {}, // idLigne -> carte SRS
  puzzles: {}, // idPuzzle -> { essais, ok, echecs, dernier }
  finales: {}, // idFinale -> { essais, reussi, dernier }
  reglagesT: 0,
  reglages: { elo: 400, fleche: true, tri: "recommande", montrerAvancees: false, camp: "tous" },
});

export class Store {
  constructor(stockage = (typeof localStorage !== "undefined" ? localStorage : null)) {
    this.stockage = stockage;
    this.surChangement = null; // appelé après chaque sauvegarde locale (la synchro s'y branche)
    this.data = DEFAUTS();
    this.charger();
  }

  charger() {
    try {
      const brut = this.stockage && this.stockage.getItem(CLE);
      if (!brut) return;
      const d = JSON.parse(brut);
      if (d && d.v === 1) {
        this.data = { ...DEFAUTS(), ...d, reglages: { ...DEFAUTS().reglages, ...(d.reglages || {}) }, cartes: d.cartes || {}, puzzles: d.puzzles || {}, finales: d.finales || {} };
      }
    } catch { /* données corrompues : on repart de zéro */ }
  }

  sauver(silencieux = false) {
    try { this.stockage && this.stockage.setItem(CLE, JSON.stringify(this.data)); } catch { /* quota / navigation privée */ }
    if (!silencieux && this.surChangement) this.surChangement();
  }

  /** Marque une entrée comme modifiée maintenant (sert à choisir la version la plus récente lors d'une synchro). */
  touche(collection, id) {
    const e = this.data[collection][id];
    if (e) e.modif = Date.now();
  }

  /**
   * Fusionne une sauvegarde distante : pour chaque carte / problème / finale on garde la version la plus récente
   * (champ `modif`) ; les réglages suivent `reglagesT`. @returns {boolean} vrai si le local a changé.
   */
  fusionner(distant) {
    if (!distant || distant.v !== 1) return false;
    let change = false;
    for (const col of ["cartes", "puzzles", "finales"]) {
      const d = distant[col] || {};
      for (const id of Object.keys(d)) {
        const loc = this.data[col][id];
        if (!loc || (d[id].modif || 0) > (loc.modif || 0)) { this.data[col][id] = d[id]; change = true; }
      }
    }
    if ((distant.reglagesT || 0) > (this.data.reglagesT || 0)) {
      this.data.reglages = { ...DEFAUTS().reglages, ...(distant.reglages || {}) };
      this.data.reglagesT = distant.reglagesT;
      change = true;
    }
    if (change) this.sauver(true);
    return change;
  }

  carte(id) { return this.data.cartes[id] || null; }
  setCarte(id, c) { this.data.cartes[id] = { ...c, modif: Date.now() }; this.sauver(); }
  get reglages() { return this.data.reglages; }
  setReglage(k, v) { this.data.reglages[k] = v; this.data.reglagesT = Date.now(); this.sauver(); }

  exporter() { return JSON.stringify(this.data, null, 1); }

  importer(texte) {
    const d = JSON.parse(texte);
    if (!d || d.v !== 1 || typeof d.cartes !== "object") throw new Error("Fichier de sauvegarde invalide");
    this.data = { ...DEFAUTS(), ...d, reglages: { ...DEFAUTS().reglages, ...(d.reglages || {}) }, puzzles: d.puzzles || {}, finales: d.finales || {} };
    this.sauver();
  }
}
