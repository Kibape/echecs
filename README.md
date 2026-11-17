# Entraîneur d'échecs

Application locale (aucun compte, aucune requête réseau pendant l'entraînement) pour apprendre les ouvertures,
avec une barre d'évaluation Stockfish et une répétition espacée façon ChessReps.

## Lancer

Il faut [Node.js](https://nodejs.org) (version 18 ou plus récente).

```
npm install      # une seule fois (récupère chess.js et Stockfish)
npm start        # puis ouvre http://localhost:5173
```

Sous Windows, tu peux aussi double-cliquer sur `lancer.bat`.
Ouvrir `index.html` directement ne marche pas (le navigateur bloque le moteur) : passe par `npm start`.

## Ce que fait l'app

- **Ouvertures** : 29 ouvertures expliquées (42 lignes) (idée, plans, erreurs fréquentes), triées selon ton Elo,
  la facilité et la puissance. Pièges (mat du Berger, Légal, Foie Frit…) signalés.
- **3 modes par ligne** : *Découvrir* (naviguer avec ◀ ▶), *Apprendre* (flèche qui montre le coup),
  *Réviser* (de mémoire ; indices et erreurs comptent dans ta note).
- **Révisions** : répétition espacée (variante de SM-2), file « à réviser », export/import de la progression.
- **Bibliothèque** : les 3 865 lignes de la base d'ouvertures Lichess, cherchables, jouables dans les 3 modes.
- **Barre d'évaluation** : Stockfish 19 (version lite, WASM) dans un Web Worker, donc l'interface ne se fige pas.
  Flèche du meilleur coup en *Analyse libre*.
- **Échiquier façon chess.com** : cases vertes, flèches (cavalier en L), surbrillance des coups, **sons** (coup, prise,
  échec, roque, erreur…), pastille ✕ sur la case en cas de mauvais coup (plus de tremblement), **premove**
  (joue ton coup pendant que l'adversaire « réfléchit »), **clic droit** : flèches et cases colorées
  (Maj = vert, Ctrl = rouge, Alt = bleu ; clic gauche pour effacer).
- **Variantes à la ChessReps** : chaque ouverture propose toutes ses variantes (de 7 à 170, ~1 800 au total, tirées de la
  base Lichess). Option « Commencer là où ça change » : les coups communs avec la variante précédente sont joués
  d'office, tu travailles seulement la divergence ; « Enchaîner » passe d'une variante à la suivante. Les
  entraînements partiels ne comptent pas dans les révisions (utilise « Ligne entière » pour cela).
- **Tactiques** : ~370 problèmes (mat en 1/2/3, fourchettes, clouages, enfilades, double échec, pièces en prise…),
  niveau 1–5, évaluation cachée pendant le problème, indice en 2 temps, solution animée, thèmes expliqués à la fin.
  Ils sont générés par `tools/gen-puzzles.mjs` (parties simulées + vérification Stockfish), au format Lichess.
- **Finales** : 10 positions de base (mats Dame/Tour/2 Tours/2 Fous, pions et opposition, Lucena, Philidor).
  Chaque position est vérifiée par Stockfish (`tools/build-finales.mjs`). L'adversaire est Stockfish ; chaque coup est
  noté (imprécision / grosse erreur / mat retardé), tu peux annuler un coup ou demander le meilleur coup.
- **Compte / synchro, site installable, APK** : voir `GUIDE-TELEPHONE.md` (GitHub Pages + Supabase, gratuit).
- **Téléphone en Wi-Fi local** : installable (PWA). Sur le PC lance `lancer-telephone.bat` (ou `HOST=0.0.0.0 npm start`), ouvre
  `http://<IP-du-PC>:5173` sur le téléphone (même Wi-Fi). Le mode hors-ligne exige HTTPS (hébergement statique) ;
  en Wi-Fi local l'app marche mais sans cache hors-ligne. Les flèches clic droit n'existent pas au tactile.

## Sources et honnêteté sur les données

| Donnée | Origine |
|---|---|
| Noms et coups des ouvertures (bibliothèque) | [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), licence CC0 |
| Résultats à ~400 Elo (blancs / nulles / noirs) | [Chessiverse](https://chessiverse.com/resources/openings/) (parties Lichess), relevés le 13/11/2026 |
| Conversion centipions → % de victoire | formule publiée par [Lichess](https://lichess.org/page/accuracy) |
| Textes des leçons | écrits pour ce projet (pas de copie de livres : droits d'auteur) |
| **Facilité et puissance (1 à 5), niveau conseillé** | **avis éditorial** pour un joueur de moins de 1000 Elo, pas une mesure |

Chaque ligne du répertoire est vérifiée au build (`npm run build:data`) : tous les coups sont légaux
et la position finale doit porter un nom cohérent dans la base Lichess.
Je n'ai pas pu récupérer de leçons de grands maîtres : elles sont protégées par le droit d'auteur.

## Structure

```
public/            l'app (HTML/CSS/JS sans framework)
  js/engine.js     Stockfish en UCI, une recherche à la fois
  js/drill.js      logique d'entraînement (sans DOM, testée)
  js/srs.js        répétition espacée
  js/board.js      échiquier (glisser-déposer, clic-clic, promotion, flèches)
  data/            openings.json (répertoire) et eco.json (bibliothèque)
tools/             curated.mjs (le répertoire) et build-data.mjs (validation + génération)
tests/             npm test (14 tests, dont vrai Stockfish)
```

## Licences

Stockfish et les pièces « cburnett » sont sous GPL-3.0 (copies de licence dans `public/vendor/` et `public/pieces/`).
chess.js : BSD-2. Base d'ouvertures Lichess : CC0.

## Fiabilité des ouvertures (audit)

- Chaque coup de chaque ligne (46 lignes curées + 1 880 variantes, 4 483 positions) a été passé à Stockfish
  (`tools/audit-lignes.mjs`, résultat dans `tools/audit-lignes.json`). Une erreur trouvée et corrigée dans mes lignes
  (London contre ...c5 : un fou en prise). Les 3 lignes qui « perdent » volontairement sont des pièges (mat de Légal,
  mat du Berger, Fried Liver).
- 26 variantes de la base Lichess sont des gambits/pièges douteux : elles sont signalées ⚠ dans la liste.
- Sources : noms et coups des variantes = base Lichess `chess-openings` (CC0) ; vérification des coups = Stockfish ;
  textes = écrits pour ce projet. Les lignes curées sont rallongées à ~15 coups avec la meilleure suite de Stockfish
  (`tools/extend-lignes.mjs`), marquée comme telle dans l'app : ce n'est pas de la théorie de base de parties de maîtres.

## Prochaines étapes

1. Importer la vraie base de puzzles Lichess (CC0) pour avoir des milliers de problèmes
2. Plus de finales (tour contre pion, dame contre pion, cavalier…)
3. Flèches au tactile (appui long)
