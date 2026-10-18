# Configuration SasPay — ELS SCHOOL MANAGER

## Architecture actuelle

L’application utilise désormais Neon PostgreSQL via les fonctions serveur Vercel. Le navigateur ne se connecte pas directement à Neon et les fonctions SasPay ne dépendent plus de Supabase.

- `POST /api/saspay/start` : vérifie la session signée, le rôle de direction et l’appartenance à l’école, puis crée une session checkout SasPay.
- `POST /api/saspay/callback` : vérifie la signature et l’horodatage, relit le statut chez SasPay, contrôle le montant et le forfait, puis active l’abonnement dans Neon.
- `database/migrations/2026-10-neon-payments.sql` : crée le registre privé des paiements.
- L’écran Abonnement propose 5 000 FCFA / 100 élèves, 10 000 FCFA / 300 élèves et 25 000 FCFA / élèves illimités.

## 1. Initialiser Neon

Dans Neon SQL Editor, sur une base neuve :

1. Exécute `database/neon-schema.sql`.
2. Exécute `database/migrations/2026-10-neon-payments.sql`.

Ne relance pas le schéma initial sur une base déjà utilisée sans examiner son contenu. Les données existantes dans Supabase ne sont pas importées automatiquement.

## 2. Variables privées dans Vercel

Dans Vercel → ELS SCHOOL → Settings → Environment Variables, configure :

- `DATABASE_URL` — chaîne de connexion PostgreSQL copiée depuis Neon, avec SSL.
- `AUTH_SECRET` — secret aléatoire unique d’au moins 32 caractères pour signer les sessions.
- `NEXT_PUBLIC_SITE_URL` — URL HTTPS publique du déploiement, sans barre oblique finale.
- `SASPAY_API_KEY` — clé API privée SasPay autorisée à créer des encaissements.
- `SASPAY_WEBHOOK_SECRET` — secret de signature du webhook SasPay. Le code accepte aussi `SASPAY_CALLBACK_SECRET` comme alias.

Ne préfixe aucune de ces variables par `VITE_`. Ne publie pas les secrets dans GitHub ou dans une conversation. Après leur ajout, redéploie le projet.

## 3. Webhook marchand SasPay

Dans le tableau de bord SasPay, configure l’URL HTTPS :

`https://TON-DOMAINE-ELS-SCHOOL/api/saspay/callback`

Le code attend actuellement l’événement `transaction.success` et les en-têtes `X-Webhook-Signature`, `X-Webhook-Timestamp` et `X-Webhook-Event`. Il calcule une signature HMAC-SHA256 sur l’horodatage et le corps brut, puis interroge l’API de statut SasPay avant toute activation.

**À confirmer avec la documentation de ton compte marchand :** nom exact de l’événement, format de signature, en-têtes, URL de statut et forme de la réponse. Ces détails n’ont pas été vérifiés par un paiement de bout en bout.

## 4. Tests avant production

1. Ouvre `/api/health` et vérifie que Neon est connecté.
2. Crée un compte de test, puis un établissement fictif.
3. Teste le checkout SasPay avec les moyens de test fournis par le marchand.
4. Vérifie dans Neon que la transaction est marquée payée et que l’abonnement utilise le bon forfait et une période de 30 jours.
5. Teste un paiement refusé, un webhook répété, une signature incorrecte et un montant incorrect.

La redirection du navigateur ne valide jamais le paiement. Seule la vérification côté serveur peut activer le forfait. Cette implémentation ne prétend pas fournir de prélèvements automatiques récurrents : elle active 30 jours à la suite d’un paiement confirmé.
