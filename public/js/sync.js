// Synchronisation par compte (Supabase) SANS bibliothèque : on parle directement à son API REST (fetch).
// Une seule ligne par utilisateur dans la table `progression` (voir supabase.sql), protégée par RLS :
// seul le propriétaire (auth.uid()) peut la lire ou l'écrire. Fusion : version la plus récente de chaque entrée.
import { CONFIG } from "./config.js";

const CLE_SESSION = "echecs-entraineur.session";

export class Sync {
  constructor(store, auFetch = (...a) => fetch(...a)) {
    this.store = store;
    this.fetch = auFetch;
    this.config = CONFIG;
    this.session = null;
    this.etat = "deconnecte"; // deconnecte | synchro | ok | erreur
    this.message = "";
    this.onEtat = () => {};
    this._timer = null;
    try { this.session = JSON.parse(localStorage.getItem(CLE_SESSION) || "null"); } catch { this.session = null; }
    if (this.session) this.etat = "ok";
    store.surChangement = () => this.planifier();
  }

  get configure() { return !!(this.config.url && this.config.cle); }
  get email() { return this.session ? this.session.email : null; }

  _etat(etat, message = "") { this.etat = etat; this.message = message; this.onEtat(etat, message); }
  _garder() { try { this.session ? localStorage.setItem(CLE_SESSION, JSON.stringify(this.session)) : localStorage.removeItem(CLE_SESSION); } catch { /* ignore */ } }

  async _auth(chemin, corps) {
    const r = await this.fetch(`${this.config.url}/auth/v1/${chemin}`, { method: "POST", headers: { apikey: this.config.cle, "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || `Erreur ${r.status}`);
    return j;
  }

  _prendre(j) {
    this.session = { acces: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, uid: j.user.id, email: j.user.email };
    this._garder();
  }

  async inscrire(email, mdp) {
    const j = await this._auth("signup", { email, password: mdp });
    if (!j.access_token) throw new Error("Compte créé. Ouvre l'email de confirmation que tu viens de recevoir, puis reviens te connecter.");
    this._prendre(j);
    await this.synchroniser();
  }

  async connecter(email, mdp) {
    this._prendre(await this._auth("token?grant_type=password", { email, password: mdp }));
    await this.synchroniser();
  }

  deconnecter() { this.session = null; this._garder(); this._etat("deconnecte"); }

  async _jeton() {
    if (!this.session) throw new Error("Non connecté");
    if (Date.now() > this.session.exp - 60000) {
      try { this._prendre(await this._auth("token?grant_type=refresh_token", { refresh_token: this.session.refresh })); }
      catch (e) { this.deconnecter(); throw e; }
    }
    return this.session.acces;
  }

  async _rest(methode, chemin, corps, entetes = {}) {
    const jeton = await this._jeton();
    const r = await this.fetch(`${this.config.url}/rest/v1/${chemin}`, { method: methode, headers: { apikey: this.config.cle, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", ...entetes }, body: corps ? JSON.stringify(corps) : undefined });
    if (!r.ok) throw new Error(`Synchro refusée (${r.status}). La table "progression" existe-t-elle ? (supabase.sql)`);
    return methode === "GET" ? r.json() : null;
  }

  /** Télécharge la sauvegarde du compte, la fusionne avec le local, puis renvoie le résultat fusionné. */
  async synchroniser() {
    if (!this.configure || !this.session) return false;
    this._etat("synchro");
    try {
      const lignes = await this._rest("GET", "progression?select=data");
      const change = lignes.length ? this.store.fusionner(lignes[0].data) : false;
      await this._rest("POST", "progression?on_conflict=user_id", { user_id: this.session.uid, data: this.store.data, updated_at: new Date().toISOString() },
        { Prefer: "resolution=merge-duplicates,return=minimal" });
      this._etat("ok", "Synchronisé à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      return change;
    } catch (e) { this._etat("erreur", e.message); return false; }
  }

  /** Envoi différé (2 s après la dernière modification) pour ne pas écrire à chaque coup. */
  planifier() {
    if (!this.configure || !this.session) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.synchroniser(), 2000);
  }
}
