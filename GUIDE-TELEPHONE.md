# Mettre l'app sur ton téléphone (installable + compte de synchronisation)

Au final : une adresse web du type `https://TON_PSEUDO.github.io/echecs/`. Tu l'ouvres sur le téléphone, tu l'installes
comme une vraie application (hors-ligne compris), et un compte synchronise ta progression entre PC et téléphone.
Tout est gratuit. Compte ~20 min la première fois.

## 1. Mettre le site en ligne (GitHub Pages)

1. Crée un compte sur https://github.com puis un dépôt **public** nommé `echecs` (bouton « New repository »).
2. Dans le dossier du projet (celui qui contient `server.js`), dans un terminal :
   ```
   git init
   git add .
   git commit -m "app d'echecs"
   git branch -M main
   git remote add origin https://github.com/TON_PSEUDO/echecs.git
   git push -u origin main
   ```
3. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
4. Onglet **Actions** : attends la coche verte (1 à 2 min). L'adresse du site s'affiche dans Settings → Pages.
   Ensuite, chaque `git push` met le site à jour tout seul.

Ta progression n'est JAMAIS dans le dépôt (elle reste dans le navigateur, ou dans ton compte, voir 4).

## 2. L'installer comme une application

- **Android (Chrome)** : ouvre l'adresse → menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
  Elle s'ouvre ensuite en plein écran, avec son icône, et marche sans connexion.
- **iPhone (Safari)** : Partager → **Sur l'écran d'accueil**.

## 3. Un vrai fichier .apk (Android, optionnel)

1. Va sur https://www.pwabuilder.com, colle l'adresse du site, « Start ».
2. « Package for stores » → **Android** → génère le paquet (l'option sans Google Play convient).
3. Télécharge le zip : il contient l'`.apk` et une clé de signature **à garder précieusement** (nécessaire pour les mises à jour).
4. Envoie l'`.apk` sur le téléphone, ouvre-le et autorise l'installation depuis cette source.

L'APK n'est qu'une enveloppe autour du site : il se met à jour tout seul quand tu fais un `git push`.
(L'interface de PWABuilder change parfois ; les étapes peuvent différer un peu.)

## 4. Le compte de synchronisation (Supabase)

1. Crée un compte sur https://supabase.com → **New project** (nom libre, région Europe, un mot de passe de base de données).
2. Menu **SQL Editor** → colle le contenu de `supabase.sql` → **Run**. (Crée la table protégée : chaque utilisateur
   ne voit que sa propre ligne.)
3. Menu **Authentication → Sign In / Providers → Email** : pour aller vite, désactive « Confirm email ».
   (Si tu le laisses activé, tu devras cliquer le lien reçu par mail à la création du compte.)
4. **Project Settings → API** : copie **Project URL** et la clé **anon public**.
5. Ouvre `public/js/config.js`, colle-les entre les guillemets, puis `git add . && git commit -m "synchro" && git push`.
6. Dans l'app (PC ou téléphone), bouton **☁ Compte** en haut → crée ton compte, puis connecte-toi sur l'autre appareil
   avec le même email.

La synchro est automatique : ~2 secondes après chaque modification, et à chaque retour dans l'app. En cas de
modification sur deux appareils, la version la plus récente de chaque ligne / problème / finale est gardée.

**Sécurité** : la clé « anon public » est faite pour être visible dans le site ; ce sont les règles de la table (RLS)
qui protègent tes données. N'écris **jamais** la clé `service_role` dans le projet.

## Dépannage

- *« Synchro refusée (404) »* → le SQL de l'étape 4.2 n'a pas été exécuté.
- *« Invalid login credentials »* → mauvais mot de passe, ou email pas encore confirmé.
- *Le site n'affiche pas ma mise à jour* → ferme et rouvre l'app une fois (le cache hors-ligne se renouvelle).
- *Le moteur ne démarre pas sur téléphone* → un vieux téléphone peut manquer de mémoire ; l'app reste utilisable sans la barre d'évaluation.
