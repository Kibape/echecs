// Faux explorateur Lichess : vérifie que le crawler écrit explorer.json et que build-data le fusionne.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { Chess } from "../public/vendor/chess.js";

test("crawl-explorer + build-data", async () => {
  const srv = http.createServer((req, res) => {
    const play = new URL(req.url, "http://x").searchParams.get("play") || "";
    const c = new Chess();
    if (play) for (const u of play.split(",")) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    const ms = c.moves({ verbose: true }).slice(0, 3);
    const poids = [60, 30, 10];
    const moves = ms.map((m, i) => ({ uci: m.from + m.to, san: m.san, white: poids[i] * 5, draws: poids[i], black: poids[i] * 4 }));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ white: moves.reduce((a, m) => a + m.white, 0), draws: moves.reduce((a, m) => a + m.draws, 0), black: moves.reduce((a, m) => a + m.black, 0), moves }));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + srv.address().port;
  const backup = fs.existsSync("tools/explorer.json") ? fs.readFileSync("tools/explorer.json") : null;
  try {
    await new Promise((ok, ko) => {
      import("node:child_process").then(({ execFile }) =>
        execFile("node", ["tools/crawl-explorer.mjs"], { env: { ...process.env, BASE: base, ONLY: "pirc", PROFONDEUR: "8", PAUSE_MS: "0", PARTIES_MIN: "1" } }, (e, out, err) => (e ? ko(new Error(err)) : ok())));
    });
    const j = JSON.parse(fs.readFileSync("tools/explorer.json", "utf8"));
    assert.ok(j.ouvertures.pirc.length >= 2);
    assert.ok(j.ouvertures.pirc.every((l) => l.pgn.split(" ").length === 8));
    const out = execFileSync("node", ["tools/build-data.mjs"], { encoding: "utf8" });
    const d = JSON.parse(fs.readFileSync("public/data/openings.json", "utf8"));
    const p = d.ouvertures.find((o) => o.id === "pirc");
    assert.ok(p.lignes.some((l) => l.source === "explorer"));
    assert.match(out, /0 erreurs/);
  } finally {
    srv.close();
    if (backup) fs.writeFileSync("tools/explorer.json", backup); else fs.rmSync("tools/explorer.json", { force: true });
    execFileSync("node", ["tools/build-data.mjs"]);
  }
});
