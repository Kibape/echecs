// Notation française : Cavalier=C, Fou=F, Dame=D, Tour=T, Roi=R (les pions n'ont pas de lettre).
const PIECES_FR = { K: "R", Q: "D", R: "T", B: "F", N: "C" };

export function sanFr(san) {
  if (!san) return san;
  if (san.startsWith("O-O")) return san;
  let out = san;
  if (PIECES_FR[out[0]]) out = PIECES_FR[out[0]] + out.slice(1);
  return out.replace(/=([QRBN])/, (_, p) => "=" + PIECES_FR[p]);
}

// ["e4","e5","Nf3"] -> "1. e4 e5 2. Cf3"
export function ligneFr(coups, jusqua = coups.length) {
  const parts = [];
  for (let i = 0; i < jusqua; i++) {
    if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
    parts.push(sanFr(coups[i]));
  }
  return parts.join(" ");
}

// Petit identifiant stable pour une ligne de la bibliothèque ECO.
export function hashCourt(texte) {
  let h = 5381;
  for (let i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
