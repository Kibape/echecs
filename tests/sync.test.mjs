import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Faux serveur Supabase (auth + table progression avec RLS simplifiée) pour tester sync.js sans compte réel.
function fauxSupabase() {
  const users = new Map(), lignes = new Map();
  const srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
      const j = b ? JSON.parse(b) : {}, send = (c, o) => res.writeHead(c, { "Content-Type": "application/json" }).end(JSON.stringify(o));
      if (req.headers.apikey !== "CLE") return send(401, { message: "no key" });
      if (req.url.startsWith("/auth/v1/signup")) { users.set(j.email, { id: "u-" + users.size, mdp: j.password }); const u = users.get(j.email); return send(200, { access_token: "t-" + u.id, refresh_token: "r", expires_in: 3600, user: { id: u.id, email: j.email } }); }
      if (req.url.startsWith("/auth/v1/token")) { const u = users.get(j.email); if (!u || u.mdp !== j.password) return send(400, { error_description: "Invalid login credentials" }); return send(200, { access_token: "t-" + u.id, refresh_token: "r", expires_in: 3600, user: { id: u.id, email: j.email } }); }
      const uid = (req.headers.authorization || "").replace("Bearer t-", "");
      if (!uid) return send(401, {});
      if (req.method === "GET") return send(200, lignes.has(uid) ? [{ data: lignes.get(uid) }] : []);
      if (j.user_id !== uid) return send(403, {}); // RLS
      lignes.set(uid, j.data); res.writeHead(201).end();
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, lignes, url: `http://127.0.0.1:${srv.address().port}` })));
}

const { Store } = await import("../public/js/store.js");
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const { Sync } = await import("../public/js/sync.js");
const mem = () => ({ _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; } });

test("Store.fusionner : garde la version la plus récente de chaque entrée", () => {
  const a = new Store(mem()), b = new Store(mem());
  a.data.cartes.x = { reps: 1, modif: 100 }; b.data.cartes.x = { reps: 5, modif: 200 }; b.data.cartes.y = { reps: 2, modif: 50 };
  assert.equal(a.fusionner(b.data), true);
  assert.equal(a.data.cartes.x.reps, 5); assert.equal(a.data.cartes.y.reps, 2);
  a.data.cartes.x.modif = 999; a.data.cartes.x.reps = 9;
  a.fusionner(b.data);
  assert.equal(a.data.cartes.x.reps, 9); // le local plus récent n'est pas écrasé
});

test("Sync : inscription, envoi, 2e appareil récupère et fusionne, mauvais mot de passe refusé", async () => {
  const { srv, url } = await fauxSupabase();
  try {
    const f = (u, o) => fetch(u, o);
    const pc = new Store(mem()), tel = new Store(mem());
    const sPC = new Sync(pc, f), sTel = new Sync(tel, f);
    sPC.config = sTel.config = { url, cle: "CLE" };
    await sPC.inscrire("k@x.fr", "secret1");
    pc.setCarte("ligne1", { reps: 3 });
    pc.data.puzzles.p1 = { ok: 1, essais: 1 }; pc.touche("puzzles", "p1");
    await sPC.synchroniser();
    await assert.rejects(() => sTel.connecter("k@x.fr", "faux"), /Invalid/);
    await sTel.connecter("k@x.fr", "secret1");
    assert.equal(tel.data.cartes.ligne1.reps, 3);
    assert.equal(tel.data.puzzles.p1.ok, 1);
    tel.setCarte("ligne2", { reps: 1 });
    await sTel.synchroniser(); await sPC.synchroniser();
    assert.equal(pc.data.cartes.ligne2.reps, 1);
    assert.equal(sPC.etat, "ok");
  } finally { srv.close(); }
});
