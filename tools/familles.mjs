// Pour chaque ouverture curée : comment retrouver ses variantes dans la base Lichess (CC0).
//  racine : la ligne doit commencer par ces coups ; motif : le nom ECO doit contenir ce motif (regex, insensible à la casse).
const BERGER = { motif: "Parham|Bishop's Opening|Napoleon|Danvers" };
export const FAMILLES = {
  "italienne-pianissimo": { racine: "e4 e5 Nf3 Nc6 Bc4" },
  "italienne-fried-liver": { racine: "e4 e5 Nf3 Nc6 Bc4 Nf6" },
  "mat-legal": { racine: "e4 e5 Nf3 d6" },
  "mat-berger": BERGER, "defense-berger": BERGER,
  ecossaise: { motif: "Scotch" }, "e5-ecossaise": { motif: "Scotch" },
  viennoise: { motif: "Vienna" },
  espagnole: { racine: "e4 e5 Nf3 Nc6 Bb5" }, "e5-espagnole": { racine: "e4 e5 Nf3 Nc6 Bb5" },
  "e5-italienne": { racine: "e4 e5 Nf3 Nc6 Bc4" },
  "london-blancs": { motif: "London" }, "contre-london": { motif: "London" },
  colle: { motif: "Colle" },
  "gambit-dame": { motif: "Queen's Gambit" },
  anglaise: { motif: "English" },
  "gambit-danois": { motif: "Danish" }, "contre-danois": { motif: "Danish" },
  "gambit-evans": { motif: "Evans" },
  "quatre-cavaliers": { motif: "Four Knights" },
  "ouverture-fou": { motif: "Bishop's Opening" },
  "caro-kann": { motif: "Caro-Kann" },
  scandinave: { motif: "Scandinavian" },
  francaise: { motif: "French Defense" },
  "sicilienne-najdorf": { motif: "Najdorf" },
  "gambit-dame-noirs": { motif: "Queen's Gambit Declined" },
  slave: { motif: "Slav" },
  "est-indienne": { motif: "King's Indian" },
  pirc: { motif: "Pirc" },
};

/** Variantes « feuilles » (lignes qui ne sont pas le début d'une autre), triées dans l'ordre de l'arbre. */
export function variantes(eco, f) {
  const re = f.motif ? new RegExp(f.motif, "i") : null;
  const l = eco.filter((e) => (f.racine ? e[2] === f.racine || e[2].startsWith(f.racine + " ") : re.test(e[1])));
  const pgns = l.map((e) => e[2]);
  const feuilles = l.filter((e) => !pgns.some((q) => q !== e[2] && q.startsWith(e[2] + " ")));
  const vus = new Set();
  return feuilles.filter((e) => (vus.has(e[2]) ? false : vus.add(e[2]))).sort((a, b) => (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
}
