# ELS SCHOOL MANAGER — Neon + Vercel

## Architecture migrée

- Interface : React + TypeScript + Vite.
- Hébergement et API serveur : Vercel.
- Base de données : Neon PostgreSQL.
- Authentification : endpoints serveur, mots de passe hashés avec scrypt et cookie de session HttpOnly signé.
- Le navigateur appelle uniquement `/api/*`; il ne reçoit jamais la chaîne `DATABASE_URL`.

## 1. Initialiser Neon

1. Crée un projet sur https://neon.tech/.
2. Dans Neon SQL Editor, exécute `database/neon-schema.sql` sur une base neuve.
3. Exécute ensuite `database/migrations/2026-10-neon-payments.sql`.
4. Si tu avais déjà des utilisateurs ou données dans Supabase, ils ne sont pas copiés automatiquement. Il faut les exporter, les transformer pour le schéma Neon, puis les importer avant de fermer Supabase.

Ne relance pas le schéma complet sur une base existante sans examiner son contenu.

## 2. Variables Vercel

Dans Vercel → Project → Settings → Environment Variables, ajoute ces variables pour l’environnement choisi :

- `DATABASE_URL` : chaîne PostgreSQL fournie par Neon, avec SSL.
- `AUTH_SECRET` : secret aléatoire unique d’au moins 32 caractères. Garde-le privé.
- `NEXT_PUBLIC_SITE_URL` : URL canonique du site, par exemple `https://ton-projet.vercel.app`.
- `SASPAY_API_KEY` : clé API privée SasPay.
- `SASPAY_WEBHOOK_SECRET` : secret de signature du webhook SasPay.

Ne mets aucune de ces valeurs dans une variable `VITE_*), dans le dépôt GitHub ou dans un message. Après configuration, relance un déploiement.

## 3. Webhook SasPay

Configure l’URL suivante dans le tableau de bord marchand SasPay :

`https://TON-DOMAINE/api/saspay/callback`

Le démarrage de paiement utilise `POST /api/saspay/start`. Le callback vérifie la signature, relit le statut auprès de SasPay, vérifie le montant et le forfait, puis active l’abonnement dans Neon. Cette intégration doit être testée avec le format de signature, le nom d’événement et l’API de statut exacts fournis par SasPay; aucun paiement réel n’a été validé par le dépôt seul.

## 4. Vérifications après déploiement

1. Ouvre `/api/health`. Attendu : `{"ok":true,"service":"els-school-manager","database":"connected"}`.
2. Crée un compte test avec un mot de passe d’au moins 10 caractères.
3. Crée une école de test, ajoute une classe puis un élève.
4. Crée un deuxième compte et une deuxième école. Vérifie que le second compte ne peut pas lire les données de la première école.
5. Vérifie le plafond du forfait Essentiel et teste les changements de forfait seulement en mode test.
6. Vérifie les événements SasPay dans les journaux Vercel avant toute mise en production.

## Forfaits mensuels

| Code | Prix | Plafond d’élèves |
|---|---:|---:|
| `essentiel` | 5 000 FCFA | 100 |
| `standard` | 10 000 FCFA | 300 |
| `illimite` | 25 000 FCFA | Aucun plafond |

## Sécurité et limites connues

- Les sessions utilisent un cookie HttpOnly, SameSite=Lax, Secure en production, avec signature HMAC et expiration de 7 jours.
- Les mots de passe sont hashés avec scrypt; les mots de passe en clair ne sont jamais stockés.
- Les routes de données contrôlent l’appartenance de l’utilisateur à l’établissement côté serveur.
- Une limitation de tentatives de connexion, une politique de sauvegarde/restauration et des tests d’intrusion restent nécessaires avant une vraie utilisation.
- Les anciens fichiers sous `supabase/` sont des références de l’ancienne version, pas des dépendances du frontend migré.
