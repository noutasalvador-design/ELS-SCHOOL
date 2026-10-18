# Configuration SasPay — ELS SCHOOL MANAGER

## Ce qui a été ajouté

- `POST /api/saspay/start` : vérifie le jeton Supabase et le rôle de direction, crée une transaction locale, puis demande une session checkout SasPay pour le forfait choisi.
- `POST /api/saspay/callback` : vérifie la signature HMAC du webhook et son horodatage, relit le statut de la session auprès de SasPay et n’active le forfait qu’après confirmation serveur.
- `supabase/saspay-payments.sql` : registre privé des transactions de forfait.
- L’écran Abonnement propose les trois forfaits et ouvre le checkout hébergé SasPay.

## 1. Appliquer les migrations Supabase

Dans Supabase → SQL Editor :

1. Si la base de données scolaire n’est pas encore installée, exécuter d’abord `supabase/schema.sql`.
2. Exécuter `supabase/subscription-plans.sql`.
3. Exécuter `supabase/saspay-payments.sql`.

Ne réexécute pas le schéma initial sur une base de production déjà utilisée : il contient des créations d’objets qui peuvent échouer si les objets existent déjà.

## 2. Ajouter les variables dans Vercel

Dans Vercel → projet ELS SCHOOL → Settings → Environment Variables, configure les valeurs suivantes pour l’environnement de test d’abord, puis Production :

- `VITE_SUPABASE_URL` — URL publique du projet Supabase utilisée par l’interface.
- `VITE_SUPABASE_ANON_KEY` — clé publique/anon de Supabase.
- `SUPABASE_URL` — URL du même projet Supabase pour les fonctions serveur.
- `SUPABASE_SERVICE_ROLE_KEY` — clé service-role Supabase, privée et serveur uniquement.
- `SASPAY_API_KEY` — clé API SasPay autorisée à créer des encaissements (PAYIN ou BOTH).
- `SASPAY_WEBHOOK_SECRET` — secret de signature du webhook SasPay. Le nom `SASPAY_CALLBACK_SECRET` est aussi accepté pour compatibilité avec le dépôt OTENTIQ.
- `NEXT_PUBLIC_SITE_URL` — URL HTTPS publique du déploiement ELS SCHOOL, sans barre oblique finale.

Ne mets jamais `SUPABASE_SERVICE_ROLE_KEY`, `SASPAY_API_KEY` ou le secret webhook dans une variable préfixée `VITE_`. Ne partage pas ces valeurs dans le chat et ne les committe pas dans GitHub.

## 3. Configurer le webhook dans SasPay

Dans le tableau de bord marchand SasPay, configure l’URL de notification HTTPS :

`https://TON-DOMAINE-ELS-SCHOOL/api/saspay/callback`

Utilise le secret de signature associé au webhook et copie-le dans la variable privée Vercel. Le nom de l’événement attendu pour une confirmation de transaction est `transaction.success`; les événements non réussis sont ignorés. Le code vérifie la signature HMAC-SHA256 sur le corps brut et exige un horodatage à moins de cinq minutes de l’heure serveur.

## 4. Déployer et tester

1. Enregistre les variables puis lance un nouveau déploiement Vercel.
2. Connecte-toi à ELS SCHOOL avec un compte qui a le rôle `school_director`.
3. Ouvre Abonnement, choisis un forfait et teste le checkout avec les identifiants et moyens de test fournis par SasPay.
4. Vérifie dans Supabase que la transaction passe à `paid` et que `school_subscriptions` contient le bon forfait, le statut `active` et une période de 30 jours.
5. Teste également les paiements échoués, les webhooks répétés et une signature invalide.

## Limites connues

- L’intégration n’a pas été validée avec un encaissement réel : il faut configurer les variables, le webhook marchand et exécuter un test de bout en bout.
- Le retour du navigateur ne valide jamais un paiement ; seule la confirmation côté serveur peut activer le forfait.
- Chaque paiement confirmé active une période de 30 jours. Ce code ne suppose pas une facturation automatique récurrente.
- L’application ELS SCHOOL utilise encore Supabase pour l’authentification et les données scolaires. La migration complète vers Neon est un chantier distinct et n’est pas terminée.
