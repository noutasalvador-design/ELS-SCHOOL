# ELS SCHOOL MANAGER

Application SaaS de gestion scolaire pour écoles primaires au Bénin. Objectif : une interface simple, sans portail parent, avec un espace privé par établissement.

## Fonctions déjà présentes dans l'interface actuelle

- Création de compte et connexion par e-mail et mot de passe.
- Création de l'espace de l'école.
- Gestion des élèves et des classes CI, CP, CE1, CE2, CM1 et CM2.
- Présences quotidiennes.
- Notes et bulletins imprimables.
- Enregistrement des paiements de scolarité en FCFA et reçus imprimables.
- Tableau de bord responsive.

## Migration Neon + Vercel en cours

Le dépôt contient les premiers fichiers de préparation :
- `api/_lib/db.ts` : pool PostgreSQL côté serveur.
- `api/health.ts` : endpoint de vérification de la connexion à Neon.
- `database/neon-schema.sql` : schéma cible, incluant les données scolaires et la table d'abonnement mensuel.
- `docs/NEON-VERCEL.md` : procédure de configuration et état de migration.

**Important : la migration n'est pas terminée.** L'interface dans `src/App.tsx` utilise encore Supabase Auth et les requêtes Supabase. Ne supprime pas Supabase et ne saisis pas de vraies données d'élèves tant que l'authentification et tous les modules n'ont pas été migrés et testés. Le nouvel endpoint `/api/health` teste uniquement la connexion de la base ; il ne prouve pas que l'application scolaire est déjà opérationnelle avec Neon.

## Architecture cible

- Frontend : React, TypeScript, Vite.
- Hébergement : Vercel.
- Base de données : Neon PostgreSQL.
- Backend : fonctions serveur Vercel dans `api/`.
- Source du code : GitHub.

## Configuration locale actuelle

Prérequis : Node.js récent (20 recommandé).

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

La commande `Copy-Item` convient à PowerShell sous Windows. Sur macOS/Linux, utilise `cp .env.example .env`.

Pendant la migration, l'interface actuelle nécessite encore `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. La future variable `DATABASE_URL` est exclusivement serveur : ne jamais la préfixer par `VITE_`, ne jamais l'exposer au navigateur et ne jamais la committer dans GitHub.

## Forfaits mensuels ELS SCHOOL MANAGER

Les forfaits sont définis dans le catalogue PostgreSQL `subscription_plans` et rattachés à chaque école via `school_subscriptions`. Les montants sont mensuels :

| Forfait | Prix mensuel | Limite d'élèves |
|---|---:|---:|
| Essentiel | 5 000 FCFA | Jusqu'à 100 |
| Standard | 10 000 FCFA | Jusqu'à 300 |
| Illimité | 25 000 FCFA | Aucun plafond |

La table d'abonnement conserve le forfait, le statut, la période de facturation et les identifiants éventuels du prestataire. La migration SQL est préparée, mais l'interface de facturation, l'encaissement automatique et le contrôle serveur empêchant de dépasser la limite doivent encore être intégrés avant utilisation réelle. Ne considère pas un abonnement comme payé à partir d'une simple redirection du navigateur.

## Sécurité et tests

Avant tout pilote :
- migrer l'authentification vers des endpoints serveur sécurisés ;
- vérifier le rôle et l'appartenance à l'école sur chaque endpoint ;
- tester l'isolation avec au moins deux écoles de test ;
- ajouter limitation des tentatives de connexion et validation des entrées ;
- préparer et tester les sauvegardes/restaurations ;
- n'utiliser que des données fictives jusqu'à validation de la sécurité.
