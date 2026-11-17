// Génère public/data/finales.json. Chaque position est VÉRIFIÉE par Stockfish avant d'être écrite :
//  - objectif "mat" ou "promotion" : l'évaluation doit être très favorable à l'élève (>= +450 cp ou mat) ;
//  - objectif "nulle" : l'évaluation doit être égale (|cp| <= 120).
// Les textes sont écrits pour ce projet. Usage : node tools/build-finales.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "../public/vendor/chess.js";

const require = createRequire(import.meta.url);
const sf = require("stockfish");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const FINALES = [
  { id: "kqk", groupe: "Mats élémentaires", titre: "Roi + Dame contre Roi", fen: "8/8/8/4k3/8/8/8/K6Q w - - 0 1", eleve: "w", objectif: "mat", limite: 15,
    idee: "La dame enferme le roi adverse dans une « boîte » de plus en plus petite. Ton roi vient ensuite aider pour donner le mat sur le bord.",
    conseils: ["Place la dame à un saut de cavalier du roi adverse : il ne peut presque plus bouger.", "Rapproche ton roi pendant que la dame garde la boîte.", "ATTENTION AU PAT : avant chaque coup, vérifie que le roi adverse a encore une case libre (sauf si c'est mat)."] },
  { id: "krk", groupe: "Mats élémentaires", titre: "Roi + Tour contre Roi", fen: "8/8/8/4k3/8/8/8/K6R w - - 0 1", eleve: "w", objectif: "mat", limite: 30,
    idee: "La tour coupe le roi adverse sur une rangée ; ton roi s'approche en « opposition » ; puis la tour donne le mat sur le bord.",
    conseils: ["Coupe le roi avec la tour, à distance pour ne pas la laisser prendre.", "Amène ton roi en face du roi adverse (opposition) : la tour peut alors le repousser d'une rangée.", "Répète jusqu'au bord de l'échiquier, puis mat."] },
  { id: "krrk", groupe: "Mats élémentaires", titre: "Mat de l'escalier (deux tours)", fen: "8/8/8/4k3/8/8/R7/K6R w - - 0 1", eleve: "w", objectif: "mat", limite: 25,
    idee: "Deux tours se relaient : l'une donne échec sur une rangée, l'autre coupe la rangée suivante, et le roi adverse recule jusqu'au bord.",
    conseils: ["Une tour coupe une rangée, l'autre donne échec sur la rangée suivante.", "Ne mets jamais une tour à portée du roi adverse sans protection.", "Le mat arrive quand le roi n'a plus de rangée où fuir."] },
  { id: "kbbk", groupe: "Mats élémentaires", titre: "Roi + deux Fous contre Roi", fen: "8/8/8/4k3/8/8/8/KBB5 w - - 0 1", eleve: "w", objectif: "mat", limite: 40,
    idee: "Les deux fous de couleurs opposées forment un mur en diagonale qui repousse le roi adverse vers un coin ; ton roi vient donner le coup final.",
    conseils: ["Mets les fous côte à côte sur des diagonales voisines : ils forment un mur.", "Avance le mur et ton roi ensemble pour pousser le roi adverse vers un coin.", "Dans le coin, surveille le pat : garde toujours une case libre jusqu'au mat."] },
  { id: "kpk-cle", groupe: "Finales de pions", titre: "Roi + pion : la case clé", fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1", eleve: "w", objectif: "promotion", limite: 20,
    idee: "Quand ton roi est devant ton pion, sur une « case clé » (ici d6, e6 ou f6 pour un pion en e5), la victoire est assurée, même sans avoir le trait.",
    conseils: ["Garde ton roi DEVANT le pion, pas à côté.", "Pousse le pion seulement quand ton roi le protège.", "Évite le pat : si le roi adverse est coincé devant son bord, laisse-lui une case."] },
  { id: "kpk-6e", groupe: "Finales de pions", titre: "Roi sur la 6e rangée = victoire", fen: "3k4/8/3K4/3P4/8/8/8/8 b - - 0 1", eleve: "w", objectif: "promotion", limite: 20,
    idee: "Avec ton roi sur la 6e rangée devant un pion, tu gagnes toujours. Joue avec précision pour ne pas laisser le roi adverse revenir.",
    conseils: ["Reste devant le pion, sur la rangée au-dessus.", "Fais avancer le pion au bon moment : quand ton roi est à côté de la case de promotion.", "Si le roi adverse recule, rapproche-toi en gardant l'opposition."] },
  { id: "kpk-opposition", groupe: "Finales de pions", titre: "Roi + pion : prendre l'opposition", fen: "8/8/3k4/8/3K4/3P4/8/8 b - - 0 1", eleve: "w", objectif: "promotion", limite: 30,
    idee: "L'opposition : les deux rois se font face avec une case entre eux. Celui qui n'a PAS le trait doit céder du terrain. Ici le trait est aux Noirs : profites-en.",
    conseils: ["Reste en opposition (une case d'écart) face au roi adverse.", "Quand il cède, avance ton roi pour gagner une case clé.", "Ne pousse le pion que lorsque ton roi est devant lui."] },
  { id: "kpk-defense", groupe: "Finales de pions", titre: "Défendre : rester devant le pion", fen: "8/8/8/8/4k3/8/4P3/4K3 b - - 0 1", eleve: "b", objectif: "nulle", limite: 20,
    idee: "Défenseur : ton roi doit rester devant le pion et gagner l'opposition au bon moment. C'est nulle si tu y arrives.",
    conseils: ["Reste DEVANT le pion avec ton roi.", "Quand les rois sont face à face, ne perds pas l'opposition : bouge pour la regagner.", "Si le pion avance, place ton roi en opposition juste devant lui."] },
  { id: "lucena", groupe: "Finales de tours", titre: "Position de Lucena (gagner)", fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1", eleve: "w", objectif: "promotion", limite: 30,
    idee: "Ton pion est sur la 7e rangée mais ton roi bloque devant lui. Il faut « construire un pont » avec ta tour pour mettre le roi à l'abri des échecs.",
    conseils: ["Éloigne d'abord le roi adverse avec un échec de tour.", "Place la tour sur la 4e rangée : c'est le pont qui protégera ton roi.", "Sors ton roi : quand les échecs arrivent, interpose la tour sur la 4e rangée, puis promeus."] },
  { id: "philidor", groupe: "Finales de tours", titre: "Position de Philidor (tenir la nulle)", fen: "4k3/8/r7/3PK3/8/8/8/4R3 b - - 0 1", eleve: "b", objectif: "nulle", limite: 30,
    idee: "Défenseur : place ta tour sur la 6e rangée pour interdire à son roi d'avancer. Quand son pion avance en 6e, ta tour passe derrière et donne des échecs.",
    conseils: ["Garde la tour sur la 6e rangée tant que le pion reste en 5e.", "Dès que le pion avance en 6e rangée, passe la tour derrière pour donner des échecs sans fin.", "Reste proche de ton roi : ne laisse pas son roi t'attaquer sur le côté."] },
];

let onLine = null;
const inst = sf("lite-single", (l) => { for (const x of String(l).split("\n")) if (x.trim() && onLine) onLine(x.trim()); });
const attendre = (t) => new Promise((r) => { onLine = (l) => { if (l.includes(t)) { onLine = null; r(); } }; });
let p = attendre("uciok"); inst.processCommand("uci"); await p;
p = attendre("readyok"); inst.processCommand("isready"); await p;

async function evaluer(fen) {
  let dernier = null;
  inst.processCommand("setoption name MultiPV value 1");
  inst.processCommand("position fen " + fen);
  await new Promise((r) => {
    onLine = (l) => {
      if (l.startsWith("info") && / score /.test(l) && !/bound/.test(l)) { const m = / depth (\d+).* score (cp|mate) (-?\d+)/.exec(l); if (m) dernier = { depth: +m[1], [m[2]]: +m[3] }; }
      else if (l.includes("bestmove")) { onLine = null; r(); }
    };
    inst.processCommand("go depth 24 movetime 3000");
  });
  return dernier;
}

let echecs = 0;
for (const f of FINALES) {
  const c = new Chess(f.fen); // lève une erreur si la position est illégale
  const trait = c.turn();
  const s = await evaluer(f.fen);
  const signe = trait === f.eleve ? 1 : -1;
  const cp = s.mate !== undefined ? signe * (s.mate > 0 ? 10000 : -10000) : signe * s.cp;
  const ok = f.objectif === "nulle" ? Math.abs(cp) <= 120 : cp >= 450;
  f.verifie = { profondeur: s.depth, ...(s.mate !== undefined ? { mat: signe * s.mate } : { cp }), moteur: "Stockfish 19 lite" };
  console.log(`${ok ? "OK " : "KO "} ${f.id.padEnd(16)} ${f.objectif.padEnd(10)} élève=${f.eleve}  éval(élève)=${s.mate !== undefined ? "mat " + signe * s.mate : cp + " cp"}`);
  if (!ok) echecs++;
}
if (echecs) { console.error(echecs + " position(s) non conformes : rien n'est écrit."); process.exit(1); }
fs.writeFileSync(path.join(ROOT, "public/data/finales.json"), JSON.stringify({ version: 1, finales: FINALES }, null, 1));
console.log("public/data/finales.json écrit : " + FINALES.length + " finales");
process.exit(0);
