# ELS SCHOOL MANAGER

SaaS simple de gestion scolaire pour les écoles primaires au Bénin, sans portail parent. Frontend React/Vite, API serveur Vercel et PostgreSQL hébergé sur Neon.

## Fonctions

- Création de compte et connexion e-mail/mot de passe avec session en cookie HttpOnly.
- Création d’un espace privé par établissement.
- Gestion des élèves et des classes CI, CP, CE1, CE2, CM1 et CM2.
- Présences quotidiennes.
- Notes et bulletins imprimables.
- Enregistrement des paiements de scolarité en FCFA et reçus imprimables.
- Abonnements SaaS : Essentiel 5 000 FCFA (100 élèves), Standard 10 000 FCFA (300 élèves), Illimité 25 000 FCFA.
- SasPay : démarrage de checkout et traitement serveur du webhook (à valider avec les identifiants réels).

## Architecture actuelle

- `src/App.tsx` appelle les routes `/api/*`, et ne se connecte plus directement à Supabase.
- `api/_lib/db.ts` fournit la connexion PostgreSQL serveur via `DATABASE_URL`.
- `api/_lib/auth.ts` gère les mots de passe hashés (scrypt) et les sessions HMAC dans un cookie HttpOnly.
- `api/auth/*` gère inscription, connexion, vérification de session et déconnexion.
- `api/data.ts` gère les données scolaires et contrôle l’appartenance à l’établissement côté serveur.
- `api/health.ts` vérifie la connexion à Neon.
- `api/saspay/start.ts` et `api/saspay/callback.ts` utilisent Neon pour le registre des paiements et l’activation des forfaits.
- `database/neon-schema.sql` définit le schéma PostgreSQL.
- `database/migrations/2026-10-neon-payments.sql` ajoute le registre des paiements SasPay.
- `docs/NEON-VERCEL.md` contient les étapes de configuration.

Les anciens scripts dans `supabase/` sont conservés comme références pour l’ancienne version, mais l’application migrée n’en dépend plus. Les comptes et données qui se trouvaient déjà dans Supabase ne sont **pas copiés automatiquement** vers Neon. Si tu as des données à conserver, exporte-les et importe-les dans Neon avant de fermer l’ancien projet.

## Installation locale

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

Sous macOS/Linux, utilise `cp .env.example .env`. Remplis `.env` avec les vraies valeurs privées avant d’utiliser les routes API. Vite n’expose au navigateur que les variables préfixées par `VITE_`; aucune clé secrète ne doit porter ce préfixe.

## Configuration Neon + Vercel

1. Crée un projet Neon sur https://neon.tech/.
2. Dans Neon SQL Editor, exécute `database/neon-schema.sql` sur une base neuve.
3. Exécute ensuite `database/migrations/2026-10-neon-payments.sql`.
4. Dans Vercel → Project Settings → Environment Variables, ajoute `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `SASPAY_API_KEY` et `SASPAY_WEBHOOK_SECRET`. Ne colle jamais ces secrets dans une conversation ou dans GitHub.
5. Configure dans le tableau de bord SasPay le webhook `https://TON-DOMAINE/api/saspay/callback`.
6. Redéploie, puis teste `/api/health`. Le résultat attendu est `{"ok":true,"service":"els-school-manager","database":"connected"}`.

Le schéma initial doit être exécuté une seule fois sur une base neuve. Ne l’exécute pas sur une base déjà utilisée sans vérifier son contenu.

## Forfaits

| Forfait | Prix mensuel | Limite |
|---|---:|---:|
| Essentiel | 5 000 FCFA | 100 élèves |
| Standard | 10 000 FCFA | 300 élèves |
| Illimité | 25 000 FCFA | Sans limite |

## État et validation

Le code de l’application a été migré vers des routes Neon côté serveur, mais cela ne signifie pas que le déploiement ou les paiements ont déjà été testés. Avant une utilisation réelle, il faut configurer les variables, exécuter les scripts SQL et valider l’inscription, la connexion, l’isolation entre deux écoles de test, les limites d’élèves et le webhook SasPay. Utilise uniquement des données fictives jusqu’à ces vérifications.

L’intégration SasPay reprend le format d’événements actuellement attendu par le code du projet; confirme le nom des événements, la signature et l’endpoint de statut avec la documentation de ton compte marchand avant une mise en production.
