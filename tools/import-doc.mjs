// Convertit le document de répertoire de Kilian (tools/repertoire-source.txt, 9 tomes) en tools/repertoire.mjs.
// Règle d'or : on ne rajoute AUCUN coup. Chaque ligne = exactement les coups écrits dans le document
// (reconstitués à partir de la position de base de chaque variante, validés par chess.js).
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const SRC = new URL("./repertoire-source.txt", import.meta.url);
const OUT = new URL("./repertoire.mjs", import.meta.url);
const TOMES = { 1: "italienne-pianissimo", 2: "london-blancs", 3: "ecossaise", 4: "viennoise", 5: "gambit-dame", 6: "slave", 7: "caro-kann", 8: "scandinave", 9: "francaise", 10: "sicilienne-najdorf" };
const SAN = /^(O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/;
const rapport = [];
// Corrections explicites d'une incohérence du document (signalées dans le rapport) : l'en-tête annonce 5.d3 mais la base écrite est 5.d4.
const CORRECTIONS = { "1|A6": [8, "d4", "d3"], "1|A7": [8, "d4", "d3"] };

// ───────── petits outils de texte ─────────
const PETITS = new Set(["de", "des", "du", "la", "le", "les", "d'", "l'", "à", "au", "aux", "et", "en", "avec", "par", "sans", "contre", "ou", "sur", "pour"]);
function joli(s) {
  s = s.replace(/GIOUOCO/g, "GIUOCO").replace(/Giouoco/g, "Giuoco").replace(/\b([DL])'(?=[A-ZÀ-Ý])/g, (_, a) => a.toLowerCase() + "'");
  let premier = true;
  s = s.replace(/\p{Lu}[\p{Lu}'’]+/gu, (w) => { // mot tout en majuscules → casse normale
    const bas = w.toLowerCase();
    const r = premier ? bas[0].toUpperCase() + bas.slice(1) : PETITS.has(bas) ? bas : bas[0].toUpperCase() + bas.slice(1);
    premier = false; return r;
  });
  s = s.replace(/\b([NBRQK])(x?[a-h][1-8])\b/g, (_, p, r) => ({ N: "C", B: "F", R: "T", Q: "D", K: "R" })[p] + r);
  s = s.replace(/(\d\.+|\.{3})([NBRQK])(?=[a-hx])/g, (_, d, p) => d + ({ N: "C", B: "F", R: "T", Q: "D", K: "R" })[p]);
  s = s.replace(/\.\.\.([NBRQK])(?=[a-hx])/g, (_, p) => "..." + ({ N: "C", B: "F", R: "T", Q: "D", K: "R" })[p]);
  return s.replace(/\s+/g, " ").trim();
}
const frSan = (m) => m.replace(/^[NBRQK]/, (p) => ({ N: "C", B: "F", R: "T", Q: "D", K: "R" })[p]).replace(/=([QRBN])/, (_, p) => "=" + ({ N: "C", B: "F", R: "T", Q: "D" })[p]);

// ───────── lecture d'une suite de coups ─────────
/** s = "5... exd4 6. cxd4 Bb4+ ..." → { segs:[{p, sans}], ok } ; p = demi-coup d'ancrage (0 = 1.e4). split : coupe quand la numérotation saute. */
function suite(s, split) {
  const toks = s.split(/\s+/).filter(Boolean), segs = [];
  let cur = null;
  for (let tok of toks) {
    const m = tok.match(/^(\d+)(\.{1,3}|…)(.*)$/);
    if (m) {
      const p = (+m[1] - 1) * 2 + (m[2].length >= 3 || m[2] === "…" ? 1 : 0);
      if (!cur || (split && p !== cur.p + cur.sans.length)) { cur = { p, sans: [] }; segs.push(cur); }
      tok = m[3];
      if (!tok) continue;
    }
    const clean = tok.replace(/[?!]+$/, "");
    if (!cur || !SAN.test(clean)) break;
    cur.sans.push(clean);
  }
  return segs.filter((x) => x.sans.length);
}

// ───────── analyse du document ─────────
const brut = readFileSync(SRC, "utf8").split(/\r?\n/);
const lignes = [];
for (const l of brut) {
  if (/^[─\-]{3,}$/.test(l.trim())) continue;
  const parts = l.split(/={5,}/).map((x) => x.trim()).filter(Boolean);
  for (const p of parts) lignes.push(p);
}

const tomes = {};
let T = null, ignorer = false;
let root = null, st = [], cur = null, bloc = false;

function nouvelleEntree(niveau, code, titre, tome) {
  const parent = niveau === 0 ? root : (() => { for (let k = niveau - 1; k >= 0; k--) if (st[k]) return st[k]; return root; })();
  const e = { niveau, code, titre, parent, enfants: [], lignes: [], depuisTitre: false, desc: [], baseLen: 0, section: null };
  parent.enfants.push(e);
  st.length = niveau; st[niveau] = e;
  e.section = niveau === 0 ? e : (st[0] || null);
  e.n1 = niveau === 1 ? e : niveau > 1 ? st[1] : null;
  tome.entrees.push(e);
  return e;
}
const mainDe = (e) => (e.lignes.length ? e.lignes[0].moves : e.parent ? mainDe(e.parent) : []);

function base(e, p, titre) {
  const src = e.depuisTitre ? e.lignes[0].moves : mainDe(e.parent);
  if (p <= src.length) return src.slice(0, p);
  // « trou » : la variante part d'une position plus avancée que celle du parent → on cherche dans les frères précédents
  const freres = e.parent.enfants.slice(0, e.parent.enfants.indexOf(e)).reverse();
  for (const f of freres) for (const L of f.lignes) if (L.moves.length >= p) return L.moves.slice(0, p);
  if (titre) return null;
  return src.slice();
}

function appliquer(e, segs, { branche = false, titre = false } = {}) {
  for (const sg of segs) {
    if (!e.lignes.length || (e.depuisTitre && !titre)) {
      const b = base(e, sg.p, titre);
      if (!b) continue;
      const L = { moves: b.concat(sg.sans), de: b.length };
      e.lignes = [L]; e.depuisTitre = titre; e.last = L; e.baseLen = L.moves.length;
      continue;
    }
    const L = e.last;
    if (!branche && sg.p === L.moves.length) { L.moves.push(...sg.sans); continue; }
    let b = sg.p <= L.moves.length ? L.moves.slice(0, sg.p) : null;
    if (!b) { const r = e.lignes.find((x) => x.moves.length >= sg.p); b = r ? r.moves.slice(0, sg.p) : L.moves.slice(); }
    const N = { moves: b.concat(sg.sans), de: b.length };
    e.lignes.push(N); e.last = N;
  }
}

for (const brutL of lignes) {
  const l = brutL.trim();
  const mt = l.match(/^TOME (\d+)\b/);
  if (mt) {
    const n = +mt[1];
    T = tomes[n] = { n, entrees: [] };
    root = { niveau: -1, code: "", titre: "", parent: null, enfants: [], lignes: [], desc: [], baseLen: 0 };
    st = []; cur = null; ignorer = false; bloc = false; T.root = root; continue;
  }
  if (!T) continue;
  if (/^FIN DU TOME/.test(l) || /^(?:\d+\.\s+|[A-Z]\.\s+)?(RÉCAPITULATIF|POINTS THÉORIQUES)/.test(l)) { ignorer = true; continue; }
  const tomeAncien = T.n <= 5;

  // en-tête de section « 2. DÉFENSE DES DEUX CAVALIERS — 3...Nf6 »
  let m;
  if (tomeAncien && (m = l.match(/^(\d+)\.\s+([A-ZÀ-ÝŒ]{3}.*)$/)) && /^[A-ZÀ-ÝŒ]{3}/.test(m[2])) {
    bloc = false;
    ignorer = /RÉCAPITULATIF|POINTS THÉORIQUES/.test(m[2]);
    if (!ignorer) cur = nouvelleEntree(0, m[1], joli(m[2]), T);
    continue;
  }
  // en-tête de niveau 1/2/3 : "A)", "A1)", "A1.1)" ou "A.", "A1.", "A1.1."
  m = l.match(/^([A-Z])(\d+)?(?:\.(\d+))?[).]\s+(.*)$/);
  if (m && !/\s[B-H]\)\s/.test(l) && !(m[4] === "" )) {
    const niveau = 1 + (m[2] ? 1 : 0) + (m[3] ? 1 : 0);
    const code = m[1] + (m[2] || "") + (m[3] ? "." + m[3] : "");
    bloc = false;
    ignorer = /RÉCAPITULATIF|POINTS THÉORIQUES/.test(m[4]);
    if (ignorer) continue;
    let titre = m[4];
    let coupsTitre = [];
    if (!tomeAncien) {
      const sep = titre.match(/^(.*?)\s+(?:—|:)\s+(.*)$/);
      if (sep) { const sg = suite(sep[2], true); if (sg.length) { coupsTitre = sg; titre = sep[1]; } }
    }
    cur = nouvelleEntree(niveau, code, joli(titre), T);
    if (coupsTitre.length) appliquer(cur, coupsTitre, { titre: true });
    continue;
  }
  if (ignorer) continue;
  if (/^(POSITION DE DÉPART|Notation\b|Répertoire\b|Réponses principales des Noirs)/.test(l)) { bloc = false; continue; }
  if (/^[A-Z]\)\s/.test(l)) continue; // récapitulatifs « A) … B) … » sur une ligne

  const cible = cur || root;
  // ligne de coups ?
  const depart = l.match(/^Départ\s*:\s*(.*)$/);
  let segs = null, branche = false;
  if (depart) segs = suite(depart[1], true);
  else if (/^\d+\.+/.test(l) || /^\d+…/.test(l)) {
    segs = suite(l, !tomeAncien);
    if (segs.length && tomeAncien && bloc && cible.lignes.length) { // numérotation de liste décalée : on continue la ligne en cours
      const toks = suite("1. " + l.replace(/^\d+\.+\s*/, ""), false);
      cible.last.moves.push(...toks[0].sans);
      continue;
    }
  } else if ((m = l.match(/^([^:]{3,90}?)\s*:\s*(\d+\.+.*)$/)) && !/^\d/.test(m[1])) {
    segs = suite(m[2], true);
    branche = /^(Autres?|Réponses?|La réponse)\b/i.test(m[1]) || /réponse/i.test(m[1]);
  }
  if (segs && segs.length) {
    bloc = true;
    if (cible === root) { // ligne de départ du tome
      const sg = segs[0]; root.lignes = [{ moves: sg.sans.slice(), de: 0 }]; root.last = root.lignes[0];
    } else appliquer(cible, segs, { branche });
    continue;
  }
  bloc = false;
  if (cible !== root && !/ :\s*$/.test(l) && !/^(Autres?\b|Réponses?\b|Position principale|Suite )/.test(l)) cible.desc.push(l);
}

// ───────── génération + validation ─────────
function valider(moves) {
  const c = new Chess();
  for (let i = 0; i < moves.length; i++) {
    let r = null;
    try { r = c.move(moves[i]); } catch { /* illégal */ }
    if (!r) return { n: i, san: moves.slice(0, i) };
    moves[i] = r.san.replace(/[+#]$/, "");
  }
  return { n: moves.length, san: moves };
}

const sortie = {};
for (const [n, id] of Object.entries(TOMES)) {
  const t = tomes[n];
  if (!t) { rapport.push(`Tome ${n} absent du document`); continue; }
  const tous = [];
  const noms = new Set();
  for (const e of t.entrees) {
    e.lignes.forEach((L, k) => {
      if (!L.moves.length) return;
      const groupe = e.section ? e.section.titre.replace(/^/, e.section.code + ". ") : e.n1 ? `${e.n1.code}. ${e.n1.titre}` : `${e.code}. ${e.titre}`;
      const pref = e.niveau > 0 && e.section ? `${e.section.code}.` : "";
      let nom = e.niveau === 0 ? `${e.code}. ${e.titre}` : `${pref}${e.code} · ${e.titre}`;
      if (k > 0) {
        const lab = L.moves.slice(L.de, L.de + 3).map((x, i) => { const ply = L.de + i; return (ply % 2 === 0 ? `${ply / 2 + 1}.` : i === 0 ? `${(ply - 1) / 2 + 1}...` : "") + frSan(x); }).join(" ");
        nom += ` — ${lab}`;
      }
      const cor = CORRECTIONS[`${n}|${e.code}`];
      if (cor && L.moves[cor[0]] === cor[1]) { L.moves[cor[0]] = cor[2]; rapport.push(`Tome ${n} — ${e.code} : l'en-tête annonce 5.d3, la base du document écrit 5.d4 → j'ai utilisé 5.d3.`); }
      const v = valider(L.moves.slice());
      if (v.n < L.moves.length) {
        rapport.push(`Tome ${n} — ${nom} : coup illégal « ${L.moves[v.n]} » (demi-coup ${v.n + 1}) ; ligne coupée avant ce coup.`);
        if (v.n <= L.de) return;
      }
      tous.push({ nom, groupe, moves: v.san, notes: e.desc.length && e.baseLen ? { [Math.min(e.baseLen, v.n)]: joli(e.desc.join(" ")) } : {} });
    });
  }
  // supprime les lignes qui ne sont que le début d'une autre (ou des doublons exacts)
  const garde = [];
  tous.forEach((a, i) => {
    const s = a.moves.join(" ") + " ";
    const dup = tous.some((b, j) => j !== i && (b.moves.length > a.moves.length ? (b.moves.join(" ") + " ").startsWith(s) : b.moves.length === a.moves.length && j < i && b.moves.join(" ") === a.moves.join(" ")));
    if (!dup) garde.push(a);
    else {
      const hote = tous.find((b, j) => j !== i && b.moves.length >= a.moves.length && (b.moves.join(" ") + " ").startsWith(s));
      if (hote) { Object.assign(hote.notes, { ...a.notes, ...hote.notes }); (hote.inclut ||= []).push(a.nom); }
    }
  });
  for (const g of garde) { let nom = g.nom, k = 2; while (noms.has(nom)) nom = `${g.nom} (${k++})`; g.nom = nom; noms.add(nom); }
  sortie[id] = garde;
}

let js = `// Répertoire = le document de Kilian (tools/repertoire-source.txt), converti par tools/import-doc.mjs.\n// Aucun coup n'est ajouté : chaque ligne est exactement celle du document. 'groupe' = section du document (sert au changement rapide de ligne).\nexport const REPERTOIRE = {\n`;
for (const [id, ls] of Object.entries(sortie)) {
  js += `  ${JSON.stringify(id)}: [\n`;
  for (const l of ls) js += `    ${JSON.stringify({ nom: l.nom, groupe: l.groupe, coups: l.moves.join(" "), ...(Object.keys(l.notes).length ? { notes: l.notes } : {}), ...(l.inclut ? { inclut: l.inclut } : {}) })},\n`;
  js += `  ],\n`;
}
js += `};\n\nexport * from "./fiches.mjs"; // fiches, conseils, liens, « à retenir » (textes de Kilian)\n`;
writeFileSync(OUT, js);
writeFileSync(new URL("./import-rapport.txt", import.meta.url), rapport.join("\n") + "\n");
console.log(Object.entries(sortie).map(([k, v]) => `${k}: ${v.length}`).join("\n"));
console.log(`${rapport.length} avertissement(s) → tools/import-rapport.txt`);
