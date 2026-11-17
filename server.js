// Mini serveur statique (sans dépendance) pour lancer l'app en local :  node server.js
// Envoie les en-têtes COOP/COEP (utiles si tu passes plus tard au Stockfish multi-thread)
// et les bons types MIME (.wasm !).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 5173;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".webmanifest": "application/manifest+json",
};

const serveur = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end("Bad request"); return; }
  if (url === "/sounds/liste.json") { // liste des sons personnalisés présents (évite des dizaines de requêtes 404)
    let l = [];
    try { l = fs.readdirSync(path.join(RACINE, "sounds")).filter((f) => /\.(mp3|ogg|wav)$/i.test(f)); } catch { /* dossier absent */ }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" }).end(JSON.stringify(l));
    return;
  }
  if (url.endsWith("/")) url += "index.html";
  const fichier = path.normalize(path.join(RACINE, url));
  if (!fichier.startsWith(RACINE + path.sep)) { res.writeHead(403).end("Interdit"); return; }
  fs.stat(fichier, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(fichier).toLowerCase()] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": "no-cache",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    fs.createReadStream(fichier).pipe(res);
  });
});

const HOTE = process.env.HOST || "127.0.0.1"; // HOST=0.0.0.0 : accessible depuis le téléphone (même Wi-Fi)
serveur.listen(PORT, HOTE, () => {
  console.log(`Entraîneur d'échecs prêt : http://localhost:${PORT}`);
});
