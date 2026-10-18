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
- `api/plans.ts` : endpoint public `GET /api/plans` qui renvoie le catalogue des forfaits.
- `database/neon-schema.sql` : schéma cible, incluant les données scolaires et les forfaits mensuels.
- `database/migrations/2026-10-subscription-plans.sql` : migration Neon pour une base qui utilise déjà l'ancien schéma.
- `supabase/subscription-plans.sql` : catalogue des forfaits et limites d’élèves.
- `supabase/saspay-payments.sql` : registre de paiement privé utilisé par les fonctions serveur SasPay.
- `api/saspay/start.ts` : crée une session de paiement SasPay après vérification de la session et du rôle de direction.
- `api/saspay/callback.ts` : vérifie la signature du webhook, relit le statut chez SasPay et active le forfait côté serveur.
- `api/_lib/saspay.ts` : catalogue des tarifs et helpers serveur.
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


## Intégration SasPay — configuration avant essai

Le dépôt contient maintenant le flux serveur de création de session et de traitement du webhook. Il reste **à configurer et à tester** avant de considérer l’encaissement comme opérationnel.

1. Dans Supabase SQL Editor, exécute dans cet ordre `supabase/schema.sql` (uniquement si le schéma n’est pas déjà installé), `supabase/subscription-plans.sql`, puis `supabase/saspay-payments.sql`. Ne réexécute pas le schéma initial sur une base déjà utilisée sans examiner les conséquences.
2. Dans Vercel → Project Settings → Environment Variables, ajoute les variables privées listées dans `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SASPAY_API_KEY`, `SASPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`. Les deux variables publiques `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` restent nécessaires à l’interface actuelle.
3. Dans le tableau de bord SasPay, configure l’URL du webhook : `https://TON-DOMAINE/api/saspay/callback`. Configure le secret de signature du webhook et renseigne exactement la même valeur dans `SASPAY_WEBHOOK_SECRET` sur Vercel.
4. Vérifie que la clé SasPay autorise les encaissements (PAYIN ou BOTH), puis redéploie Vercel après avoir configuré les variables.
5. Effectue d’abord un paiement de test avec le compte/environnement de test fourni par SasPay. Vérifie le webhook et l’activation avant de passer en production.

**Important :** ne partage pas les clés API dans le chat et ne les ajoute jamais à GitHub. Le retour du navigateur ne valide pas le paiement : le webhook signé et la vérification du statut côté serveur sont nécessaires. Les renouvellements sont ici des périodes de 30 jours activées après chaque paiement confirmé ; aucune facturation automatique récurrente n’est supposée.
