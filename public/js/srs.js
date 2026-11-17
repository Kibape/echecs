// Répétition espacée (variante simplifiée de SM-2).
// Une "carte" = une ligne d'ouverture à rejouer de mémoire.
// Qualité q : 5 = parfait, 3 = un petit raté, 0-2 = oublié (la carte revient vite).

const JOUR = 24 * 3600 * 1000;

export function carteNeuve(maintenant = Date.now()) {
  return { facilite: 2.5, intervalle: 0, reps: 0, echecs: 0, echeance: maintenant, dernier: null };
}

export function noter(carte, q, maintenant = Date.now()) {
  const c = { ...carte };
  q = Math.max(0, Math.min(5, Math.round(q)));
  c.dernier = maintenant;
  if (q < 3) {
    c.reps = 0;
    c.echecs += 1;
    c.intervalle = 0;
    c.echeance = maintenant + 10 * 60 * 1000; // à revoir dans 10 minutes
  } else {
    c.reps += 1;
    if (c.reps === 1) c.intervalle = 1;
    else if (c.reps === 2) c.intervalle = 3;
    else c.intervalle = Math.max(1, Math.round(c.intervalle * c.facilite));
    c.echeance = maintenant + c.intervalle * JOUR;
  }
  c.facilite = Math.max(1.3, c.facilite + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return c;
}

export function estDue(carte, maintenant = Date.now()) {
  return carte.echeance <= maintenant;
}

/** Statut lisible pour l'interface. */
export function statut(carte, maintenant = Date.now()) {
  if (!carte) return { code: "nouveau", texte: "Nouveau" };
  if (carte.reps === 0) return { code: "difficile", texte: "À revoir" };
  if (carte.intervalle >= 21) return { code: "maitrise", texte: "Maîtrisé" };
  if (estDue(carte, maintenant)) return { code: "due", texte: "À réviser" };
  return { code: "appris", texte: `Revu — dans ${Math.max(1, Math.ceil((carte.echeance - maintenant) / JOUR))} j` };
}

/** Qualité d'une session à partir du nombre d'erreurs + indices utilisés. */
export function qualite(erreurs, aides = 0) {
  return Math.max(0, 5 - 2 * (erreurs + aides));
}
