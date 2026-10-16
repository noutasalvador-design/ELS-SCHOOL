# Migration ELS SCHOOL MANAGER vers Neon + Vercel

## Architecture cible

- GitHub : code source et déploiements automatiques.
- Vercel : hébergement de l'interface React/Vite et des fonctions API.
- Neon : PostgreSQL.
- L'interface React appellera `/api/*`; elle ne doit jamais se connecter directement à PostgreSQL.
- `DATABASE_URL` reste une variable serveur privée et ne doit jamais commencer par `VITE_`.

## Étape 1 — créer la base Neon

1. Créer un projet sur https://neon.tech/.
2. Copier la chaîne de connexion PostgreSQL depuis le tableau de bord Neon.
3. Dans Neon SQL Editor, exécuter `database/neon-schema.sql` sur une base neuve.
4. Ne jamais publier la chaîne de connexion dans GitHub, une capture publique ou le code du navigateur.

## Étape 2 — connecter Vercel

1. Importer le dépôt `noutasalvador-design/ELS-SCHOOL` depuis https://vercel.com/.
2. Utiliser la commande de build `npm run build` et le dossier de sortie `dist`.
3. Ajouter `DATABASE_URL` dans Project Settings → Environment Variables, pour Preview et Production selon le besoin.
4. Redéployer après avoir ajouté ou changé une variable.
5. Après déploiement, ouvrir `/api/health`. Le résultat attendu est `{"ok":true,"service":"els-school-manager","database":"connected"}`.

## État réel de la migration

Le dépôt contient désormais le premier connecteur Neon côté serveur, un endpoint de santé et le schéma PostgreSQL cible. La migration n'est pas terminée : l'interface `src/App.tsx` utilise encore Supabase Auth et ses requêtes directes. Ne supprime pas encore le projet Supabase et ne considère pas le site prêt pour de vraies écoles. La prochaine étape est de migrer l'authentification et chaque module vers une API serveur sécurisée, puis de tester l'isolation entre écoles.

## Abonnement mensuel

Le schéma prévoit un abonnement par école séparé des paiements de scolarité. Le prix initial indicatif est de 3 000 FCFA/mois, modifiable. Le champ de statut ne constitue pas un système de paiement : il faudra intégrer un prestataire compatible avec le Bénin, vérifier ses notifications côté serveur et ne jamais activer un abonnement sur la seule base d'une redirection du navigateur.

## Sécurité minimale avant production

- Hash de mot de passe côté serveur (bcrypt ou Argon2), jamais en clair.
- Sessions sécurisées (cookies HttpOnly/Secure/SameSite) ou jetons courts vérifiés côté serveur.
- Contrôle d'accès et d'appartenance à l'école sur chaque endpoint.
- Validation de toutes les données, limitation des tentatives de connexion et journaux sans données personnelles.
- Sauvegardes et tests de restauration.
- Ne pas utiliser de vraies informations d'enfants avant les tests et validations nécessaires.
