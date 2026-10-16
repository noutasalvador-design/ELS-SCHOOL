# ELS SCHOOL MANAGER

Application web SaaS de gestion scolaire pour écoles primaires au Bénin. Le principe : une école possède son espace privé ; les données sont séparées au niveau de la base de données.

## Fonctions disponibles dans le code

- Création de compte et connexion par e-mail et mot de passe.
- Création de l'espace de l'école.
- Gestion des élèves : inscription, matricule, sexe, classe et recherche.
- Gestion des classes : CI, CP, CE1, CE2, CM1 et CM2.
- Présences : feuille quotidienne par classe, avec les statuts présent, absent, en retard et excusé.
- Notes : matière, période, note sur 20, coefficient et commentaire.
- Bulletins imprimables : notes par période, moyenne pondérée, informations de l’élève et zones de signature, avec impression ou export PDF depuis le navigateur.
- Scolarité : enregistrement du paiement en FCFA, choix du moyen de paiement, référence de reçu et reçu imprimable.
- Tableau de bord et affichage adapté au téléphone et à l'ordinateur.
- Premières règles RLS pour isoler les écoles et limiter certaines actions selon le rôle.
- Vérification automatique du build configurée dans GitHub Actions.

**À noter :** la gestion des échéanciers/frais dus, la gestion des utilisateurs du personnel et l’intégration d’un paiement Mobile Money réel restent à construire. Le champ « Mobile Money » indique un moyen de paiement enregistré ; il ne débite aucun compte et ne confirme aucune transaction auprès d'un opérateur.

## Technologies

React, TypeScript, Vite, Supabase Auth, PostgreSQL et Row Level Security (RLS).

## Installation sur un ordinateur

Prérequis : Node.js récent (20 recommandé).

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

La commande `Copy-Item` convient à PowerShell sous Windows. Sur macOS/Linux, utilise `cp .env.example .env`.

Ouvre ensuite l'adresse locale affichée par Vite dans le terminal.

## Configuration de Supabase

1. Crée un projet dans Supabase.
2. Dans **Project Settings / API**, récupère l'URL du projet et la clé publique (*publishable* ou *anon*).
3. Mets ces deux valeurs dans le fichier local `.env` :
   - `VITE_SUPABASE_URL=https://...`
   - `VITE_SUPABASE_ANON_KEY=...`
4. Dans **SQL Editor**, ouvre le contenu de `supabase/schema.sql`, colle-le et exécute-le **une seule fois sur une base neuve**.
5. Redémarre le serveur Vite après toute modification du fichier `.env`.

N'utilise jamais la clé `service_role` dans une variable `VITE_`, dans le navigateur ou dans le dépôt. Ne mets aucune donnée réelle d'enfant dans l'environnement de test.

## Préparer une mise en ligne

Le dépôt peut être connecté à un hébergeur compatible Vite (par exemple Vercel ou Netlify). La commande de construction est `npm run build` et le dossier généré est `dist`. Il faudra ajouter les deux variables Supabase dans les variables d'environnement de l'hébergeur.

## État et sécurité

Le code est en cours de développement. Le dépôt et les migrations ont été écrits, mais l'application n'a pas encore été validée par un build et un test d'intégration avec un projet Supabase réel. Avant un pilote, teste au minimum deux écoles séparées, les rôles du personnel, la création et la modification des données, les sauvegardes, et la restauration. Ne stocke que les informations nécessaires et obtiens l'accord des responsables de l'école avant tout essai avec de vraies données d'élèves.
