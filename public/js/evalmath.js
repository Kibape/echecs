// Conversions pour la barre d'évaluation. Formules de Lichess (https://lichess.org/page/accuracy).

/** Pourcentage de victoire (0–100) pour le camp qui a l'avantage positif, à partir de centipions. */
export function winPct(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Précision d'un coup (0–100) à partir du % de victoire avant/après (du point de vue du joueur). */
export function moveAccuracy(winBefore, winAfter) {
  const a = 103.1668 * Math.exp(-0.04354 * (winBefore - winAfter)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

/**
 * Stockfish donne le score du point de vue du camp au trait.
 * On le convertit en point de vue des Blancs.
 * @param {{cp?:number, mate?:number}} score
 * @param {'w'|'b'} trait
 */
export function versBlancs(score, trait) {
  const s = trait === "w" ? 1 : -1;
  if (score.mate !== undefined) return { mate: score.mate * s, mateZero: score.mate === 0 ? trait : undefined };
  return { cp: score.cp * s };
}

/** Part de la barre occupée par les Blancs (0–100). */
export function partBlancs(scoreBlancs) {
  if (scoreBlancs.mate !== undefined) {
    if (scoreBlancs.mate === 0) return scoreBlancs.mateZero === "w" ? 0 : 100; // le camp au trait est mat
    return scoreBlancs.mate > 0 ? 100 : 0;
  }
  return winPct(scoreBlancs.cp);
}

/** Texte affiché sur la barre : "+0.3", "-1.2", "M3", "-M2". */
export function texteScore(scoreBlancs) {
  if (scoreBlancs.mate !== undefined) {
    if (scoreBlancs.mate === 0) return scoreBlancs.mateZero === "w" ? "0-1" : "1-0";
    return (scoreBlancs.mate < 0 ? "-" : "") + "M" + Math.abs(scoreBlancs.mate);
  }
  const v = scoreBlancs.cp / 100;
  const t = Math.abs(v).toFixed(1);
  return (v > 0 ? "+" : v < 0 ? "-" : "") + t;
}

/** Phrase simple pour un débutant. */
export function phraseScore(scoreBlancs) {
  if (scoreBlancs.mate !== undefined) {
    if (scoreBlancs.mate === 0) return scoreBlancs.mateZero === "w" ? "Les Noirs ont gagné par mat." : "Les Blancs ont gagné par mat.";
    return scoreBlancs.mate > 0 ? `Les Blancs matent en ${scoreBlancs.mate}.` : `Les Noirs matent en ${-scoreBlancs.mate}.`;
  }
  const cp = scoreBlancs.cp, a = Math.abs(cp);
  if (a < 30) return "Position équilibrée.";
  const camp = cp > 0 ? "Blancs" : "Noirs";
  if (a < 100) return `Léger avantage pour les ${camp}.`;
  if (a < 300) return `Net avantage pour les ${camp}.`;
  if (a < 700) return `Gros avantage pour les ${camp}.`;
  return `Position gagnante pour les ${camp}.`;
}
