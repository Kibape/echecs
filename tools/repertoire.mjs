// Répertoire fourni par Kilian (10 ouvertures, niveau 0-1000 Elo). Les variantes et les explications coup par coup
// viennent de son document ; les textes sont traduits avec les lettres de pièces françaises (C, F, T, D, R).
// Chaque ligne : { nom, coups (SAN anglais), notes: tableau d'explications dans l'ordre des demi-coups (null = pas de note) }.
const N = (arr) => Object.fromEntries(arr.map((t, i) => [i + 1, t]).filter(([, t]) => t));

const E4E5 = [
  "e4 : les Blancs occupent le centre et libèrent leur fou et leur dame.",
  "e5 : les Noirs contestent immédiatement le centre.",
  "Cf3 : le cavalier se développe et attaque le pion e5.",
  "Cc6 : les Noirs défendent leur pion et développent une pièce.",
];
const D4D5 = ["d4 : les Blancs prennent le centre et libèrent leur fou c1.", "d5 : les Noirs occupent aussi le centre."];

export const REPERTOIRE = {
  "italienne-pianissimo": [
    { nom: "Giuoco Piano : 4.c3 Cf6 5.d3", coups: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3",
      notes: N([...E4E5, "Fc4 : le fou vise f7 et prend une position active.", "Fc5 : les Noirs développent leur fou symétriquement et pressent f2.", "c3 : les Blancs préparent d4 pour construire un centre de pions plus important.", "Cf6 : les Noirs développent leur deuxième cavalier et attaquent le pion e4.", "d3 : les Blancs consolident leur centre et ouvrent la diagonale du fou c1."]) },
    { nom: "Giuoco Pianissimo : 4.d3", coups: "e4 e5 Nf3 Nc6 Bc4 Bc5 d3",
      notes: N([...E4E5, "Fc4 : le fou vise f7, case sensible puisque seul le roi noir la défend.", "Fc5 : les Noirs développent leur fou et pressent f2.", "d3 : approche plus calme. Les Blancs consolident e4, libèrent leur fou c1 et gardent une structure centrale solide. L'idée : développer tranquillement, roquer, puis progresser au centre sans ouvrir la position tout de suite."]) },
    { nom: "Défense des deux cavaliers : 4.Cg5 d5 5.exd5 Ca5", coups: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5",
      notes: N([...E4E5, "Fc4 : le fou vise f7.", "Cf6 : les Noirs attaquent e4 au lieu de développer leur fou en c5.", "Cg5 : les Blancs attaquent f7 avec leur cavalier, case déjà visée par le fou c4.", "d5 : les Noirs contre-attaquent au centre et attaquent le fou blanc.", "exd5 : les Blancs capturent le pion d5.", "Ca5 : les Noirs attaquent le fou c4 et gagnent du temps (et évitent le piège ...Cxd5? Cxf7). Ligne tactique : comprends les menaces avant de continuer."]) },
  ],
  "london-blancs": [
    { nom: "London : ligne principale contre ...d5 / ...c5", coups: "d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3 b6 Qe2 Bb7",
      notes: N([...D4D5, "Ff4 : on développe le fou AVANT de jouer e3, pour ne pas l'enfermer derrière ses propres pions.", "Cf6 : les Noirs développent leur cavalier et contrôlent le centre.", "e3 : les Blancs renforcent d4 et libèrent leur fou f1.", "c5 : les Noirs attaquent le centre blanc.", "c3 : les Blancs renforcent d4.", "Cc6 : les Noirs développent leur cavalier et accentuent la pression sur d4.", "Cd2 : les Blancs développent leur cavalier et préparent Cf3.", "e6 : les Noirs consolident leur centre et libèrent leur fou f8.", "Cgf3 : le cavalier rejoint f3 et participe au contrôle du centre.", "Fd6 : les Noirs développent leur fou et attaquent le fou f4.", "Fg3 : les Blancs préservent leur fou.", "O-O : les Noirs mettent leur roi en sécurité.", "Fd3 : les Blancs développent leur fou et visent notamment h7.", "b6 : les Noirs préparent le développement de leur fou en b7.", "De2 : les Blancs développent leur dame et soutiennent leur centre.", "Fb7 : les Noirs développent leur fou sur la grande diagonale."]) },
    { nom: "London contre l'indienne (...Cf6 ...g6)", coups: "d4 Nf6 Bf4 g6 Nf3 Bg7 e3 d6",
      notes: N(["d4 : les Blancs prennent le centre.", "Cf6 : les Noirs développent leur cavalier et contrôlent e4.", "Ff4 : les Blancs développent leur fou à l'extérieur de leur chaîne de pions.", "g6 : les Noirs préparent le fianchetto de leur fou.", "Cf3 : les Blancs développent leur cavalier.", "Fg7 : les Noirs placent leur fou sur la grande diagonale.", "e3 : les Blancs renforcent leur centre.", "d6 : les Noirs consolident leur structure et préparent leur développement."]) },
  ],
  ecossaise: [
    { nom: "Écossaise : 4...Cf6", coups: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6",
      notes: N([...E4E5, "d4 : les Blancs attaquent directement le centre noir.", "exd4 : les Noirs capturent le pion d4.", "Cxd4 : les Blancs reprennent avec le cavalier et placent une pièce au centre.", "Cf6 : les Noirs développent leur cavalier et pressent e4. La suite peut devenir tactique ou positionnelle."]) },
    { nom: "Écossaise : 4...Fc5", coups: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5",
      notes: N([...E4E5, "d4 : les Blancs attaquent directement le centre noir.", "exd4 : les Noirs capturent le pion d4.", "Cxd4 : les Blancs reprennent avec le cavalier.", "Fc5 : les Noirs développent leur fou et attaquent directement le cavalier d4 : il faut penser à le protéger."]) },
    { nom: "Écossaise : 4...Fb4+", coups: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bb4+",
      notes: N([...E4E5, "d4 : les Blancs attaquent directement le centre noir.", "exd4 : les Noirs capturent le pion d4.", "Cxd4 : les Blancs reprennent avec le cavalier.", "Fb4+ : les Noirs donnent échec en développant leur fou. Ils cherchent à provoquer c3, ce qui gêne le développement naturel du cavalier b1."]) },
  ],
  viennoise: [
    { nom: "Viennoise : 3.g3 (fianchetto)", coups: "e4 e5 Nc3 Nf6 g3",
      notes: N(["e4 : les Blancs occupent le centre.", "e5 : les Noirs contestent le centre.", "Cc3 : les Blancs développent leur cavalier et défendent e4.", "Cf6 : les Noirs développent leur cavalier et attaquent e4.", "g3 : les Blancs préparent le fianchetto de leur fou en g2. Ce fou contrôlera les cases centrales d5 et e4 depuis la grande diagonale."]) },
    { nom: "Gambit viennois : 3.f4", coups: "e4 e5 Nc3 Nf6 f4",
      notes: N(["e4 : les Blancs occupent le centre.", "e5 : les Noirs contestent le centre.", "Cc3 : les Blancs développent leur cavalier et défendent e4.", "Cf6 : les Noirs développent leur cavalier et attaquent e4.", "f4 : les Blancs proposent un pion pour attaquer le centre et ouvrir la colonne f. Ils cherchent une position active et des chances d'attaque sur le roi. C'est un gambit : on accepte de sacrifier un pion pour gagner du temps et de l'activité."]) },
    { nom: "Viennoise : 2...Cc6", coups: "e4 e5 Nc3 Nc6",
      notes: N(["e4 : les Blancs occupent le centre.", "e5 : les Noirs contestent le centre.", "Cc3 : les Blancs développent leur cavalier et défendent e4.", "Cc6 : les Noirs développent leur cavalier et renforcent e5. Réponse classique à la Viennoise : les Blancs peuvent ensuite choisir Cf3, Fc4 ou Fb5."]) },
  ],
  "gambit-dame": [
    { nom: "Gambit dame refusé : Fg5 et e3", coups: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7",
      notes: N([...D4D5, "c4 : les Blancs attaquent le pion d5.", "e6 : les Noirs défendent leur pion d5 et libèrent leur fou f8.", "Cc3 : les Blancs développent leur cavalier et renforcent le centre.", "Cf6 : les Noirs développent leur cavalier.", "Fg5 : les Blancs développent leur fou et mettent le cavalier f6 sous pression.", "Fe7 : les Noirs développent leur fou et préparent le roque.", "e3 : les Blancs consolident d4 et libèrent leur fou f1.", "O-O : les Noirs mettent leur roi en sécurité.", "Cf3 : les Blancs développent leur deuxième cavalier.", "Cbd7 : les Noirs développent leur cavalier b8 vers d7."]) },
    { nom: "Gambit dame accepté", coups: "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6",
      notes: N([...D4D5, "c4 : les Blancs proposent le pion c4.", "dxc4 : les Noirs acceptent le gambit et prennent le pion.", "Cf3 : les Blancs développent leur cavalier et préparent la récupération du pion.", "Cf6 : les Noirs développent leur cavalier.", "e3 : les Blancs ouvrent la diagonale de leur fou f1 pour récupérer le pion.", "e6 : les Noirs renforcent leur centre et libèrent leur fou f8.", "Fxc4 : les Blancs récupèrent le pion avec leur fou.", "c5 : les Noirs attaquent le centre blanc.", "O-O : les Blancs mettent leur roi en sécurité.", "a6 : les Noirs préparent une expansion à l'aile dame et peuvent envisager ...b5."]) },
  ],
  "caro-kann": [
    { nom: "Caro-Kann classique : 3.Cc3 dxe4 4.Cxe4 Ff5", coups: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5",
      notes: N(["e4 : les Blancs occupent le centre.", "c6 : les Noirs préparent d5 sans bloquer leur fou c8.", "d4 : les Blancs renforcent leur présence centrale.", "d5 : les Noirs attaquent le pion e4 et contestent le centre.", "Cc3 : les Blancs développent leur cavalier et défendent e4.", "dxe4 : les Noirs échangent leur pion d contre le pion e4.", "Cxe4 : les Blancs reprennent avec leur cavalier et gardent une pièce au centre.", "Ff5 : les Noirs développent leur fou AVANT de jouer e6. C'est l'une des idées essentielles de la Caro-Kann classique."]) },
    { nom: "Caro-Kann : variante d'avance 3.e5", coups: "e4 c6 d4 d5 e5 Bf5 Nc3",
      notes: N(["e4 : les Blancs occupent le centre.", "c6 : les Noirs préparent d5.", "d4 : les Blancs renforcent leur centre.", "d5 : les Noirs contestent e4.", "e5 : les Blancs avancent leur pion et ferment le centre.", "Ff5 : les Noirs sortent le fou avant de jouer e6, pour ne pas l'enfermer.", "Cc3 : les Blancs développent leur cavalier et renforcent le contrôle des cases centrales."]) },
    { nom: "Caro-Kann : 4...Cd7 (Karpov)", coups: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7",
      notes: N(["e4 : les Blancs occupent le centre.", "c6 : les Noirs préparent d5.", "d4 : les Blancs renforcent leur centre.", "d5 : les Noirs contestent e4.", "Cc3 : les Blancs défendent e4.", "dxe4 : les Noirs échangent.", "Cxe4 : les Blancs reprennent avec le cavalier.", "Cd7 : les Noirs préparent ...Cf6 sans devoir reprendre avec un pion. Ligne associée à Anatoly Karpov."]) },
  ],
  scandinave: [
    { nom: "Scandinave : 2...Dxd5 3.Cc3 Da5", coups: "e4 d5 exd5 Qxd5 Nc3 Qa5",
      notes: N(["e4 : les Blancs occupent le centre.", "d5 : les Noirs attaquent immédiatement le pion e4.", "exd5 : les Blancs capturent le pion d5.", "Dxd5 : les Noirs reprennent avec la dame.", "Cc3 : les Blancs développent leur cavalier en attaquant la dame : ils gagnent un temps.", "Da5 : la dame se met à l'abri. C'est la réponse la plus courante. Elle pourra se repositionner pendant que les Noirs développent leurs pièces."]) },
    { nom: "Scandinave : 3...Dd6", coups: "e4 d5 exd5 Qxd5 Nc3 Qd6",
      notes: N(["e4 : les Blancs occupent le centre.", "d5 : les Noirs attaquent e4.", "exd5 : les Blancs capturent le pion.", "Dxd5 : les Noirs reprennent avec la dame.", "Cc3 : les Blancs attaquent la dame et gagnent un temps.", "Dd6 : autre case pour la dame, plus flexible, qui permet des structures différentes (notamment avec un grand roque)."]) },
    { nom: "Scandinave moderne : 2...Cf6", coups: "e4 d5 exd5 Nf6",
      notes: N(["e4 : les Blancs prennent le centre.", "d5 : les Noirs attaquent e4 immédiatement.", "exd5 : les Blancs capturent le pion.", "Cf6 : les Noirs développent leur cavalier et préparent de récupérer le pion sans sortir la dame tout de suite. Autre grande famille de la Scandinave, avec des positions différentes de la ligne 2...Dxd5."]) },
  ],
  francaise: [
    { nom: "Française : variante d'avance 3.e5", coups: "e4 e6 d4 d5 e5 c5",
      notes: N(["e4 : les Blancs occupent le centre.", "e6 : les Noirs préparent d5 et libèrent leur fou f8.", "d4 : les Blancs renforcent leur centre.", "d5 : les Noirs attaquent le pion e4.", "e5 : les Blancs avancent leur pion et ferment le centre.", "c5 : les Noirs attaquent la base de la chaîne de pions blanche, notamment d4."]) },
    { nom: "Française : Winawer 3.Cc3 Fb4", coups: "e4 e6 d4 d5 Nc3 Bb4",
      notes: N(["e4 : les Blancs prennent le centre.", "e6 : les Noirs préparent d5.", "d4 : les Blancs renforcent le centre.", "d5 : les Noirs contestent e4.", "Cc3 : les Blancs développent leur cavalier et défendent e4.", "Fb4 : les Noirs clouent le cavalier c3 contre le roi blanc et créent une pression sur la structure centrale."]) },
    { nom: "Française : Tarrasch 3.Cd2", coups: "e4 e6 d4 d5 Nd2",
      notes: N(["e4 : les Blancs prennent le centre.", "e6 : les Noirs préparent d5.", "d4 : les Blancs renforcent le centre.", "d5 : les Noirs contestent e4.", "Cd2 : les Blancs développent le cavalier en d2 au lieu de c3, pour éviter le clouage ...Fb4 de la Winawer. Variante plus positionnelle, avec une structure centrale solide."]) },
  ],
  slave: [
    { nom: "Slave : ligne principale (4...dxc4, 5.a4 Ff5)", coups: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4",
      notes: N([...D4D5, "c4 : les Blancs attaquent le pion d5.", "c6 : les Noirs défendent d5 tout en laissant la diagonale du fou c8 ouverte.", "Cf3 : les Blancs développent leur cavalier.", "Cf6 : les Noirs développent leur cavalier.", "Cc3 : les Blancs développent leur deuxième cavalier et renforcent le centre.", "dxc4 : les Noirs acceptent temporairement le gambit.", "a4 : les Blancs empêchent ...b5, qui permettrait de garder le pion en plus.", "Ff5 : les Noirs sortent le fou c8 avant de jouer e6.", "e3 : les Blancs préparent la récupération du pion c4.", "e6 : les Noirs consolident leur centre et libèrent leur fou f8.", "Fxc4 : les Blancs récupèrent le pion avec leur fou."]) },
    { nom: "Slave : variante calme (e3, Fd3)", coups: "d4 d5 c4 c6 Nf3 Nf6 e3 e6 Bd3 Nbd7 Nbd2",
      notes: N([...D4D5, "c4 : les Blancs attaquent le pion d5.", "c6 : les Noirs défendent d5.", "Cf3 : les Blancs développent leur cavalier.", "Cf6 : les Noirs développent leur cavalier.", "e3 : les Blancs renforcent leur centre et ouvrent la diagonale de leur fou.", "e6 : les Noirs consolident d5 et ouvrent leur fou f8.", "Fd3 : les Blancs développent leur fou vers une diagonale active.", "Cbd7 : les Noirs développent leur cavalier b8 en d7.", "Cbd2 : les Blancs développent leur cavalier b1 vers d2."]) },
  ],
  "gambit-dame-noirs": [
    { nom: "Gambit dame refusé : défense orthodoxe", coups: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7",
      notes: N([...D4D5, "c4 : les Blancs attaquent le pion d5.", "e6 : les Noirs défendent leur pion d5.", "Cc3 : les Blancs développent leur cavalier et renforcent leur centre.", "Cf6 : les Noirs développent leur cavalier.", "Fg5 : les Blancs développent leur fou et clouent le cavalier f6 contre la dame.", "Fe7 : les Noirs développent leur fou et préparent le roque.", "e3 : les Blancs renforcent leur centre et libèrent leur fou f1.", "O-O : les Noirs mettent leur roi en sécurité.", "Cf3 : les Blancs développent leur deuxième cavalier.", "Cbd7 : les Noirs développent leur cavalier b8."]) },
    { nom: "Gambit dame refusé : ligne Harrwitz", coups: "d4 d5 c4 e6 Nc3 Nf6 Nf3 Be7 Bf4 O-O e3 c5 dxc5 Bxc5",
      notes: N([...D4D5, "c4 : les Blancs attaquent le pion d5.", "e6 : les Noirs défendent leur pion.", "Cc3 : les Blancs développent leur cavalier.", "Cf6 : les Noirs développent leur cavalier.", "Cf3 : les Blancs développent leur deuxième cavalier.", "Fe7 : les Noirs développent leur fou et préparent le roque.", "Ff4 : les Blancs développent leur fou à l'extérieur de leur chaîne de pions.", "O-O : les Noirs mettent leur roi en sécurité.", "e3 : les Blancs renforcent d4 et libèrent leur fou f1.", "c5 : les Noirs attaquent le centre blanc et cherchent à libérer leur position.", "dxc5 : les Blancs capturent le pion c5.", "Fxc5 : les Noirs reprennent avec leur fou et activent cette pièce."]) },
  ],
};
