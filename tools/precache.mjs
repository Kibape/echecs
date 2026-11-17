// Liste tous les fichiers de public/ dans public/precache.json : le service worker les met en cache à la 1re visite
// (l'app marche ensuite sans connexion). À relancer après toute modification : node tools/precache.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const out = [];
(function parcourir(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name), rel = path.relative(PUB, p).split(path.sep).join("/");
    if (e.isDirectory()) { if (e.name !== "sounds") parcourir(p); }
    else if (!/^(precache\.json|sw\.js)$/.test(rel) && !/LISEZMOI|LICENSE/.test(rel)) out.push(rel);
  }
})(PUB);
const version = Date.now().toString(36);
fs.writeFileSync(path.join(PUB, "precache.json"), JSON.stringify({ version, fichiers: ["./", ...out] }));
console.log(out.length + " fichiers, version " + version);
