# Exploitation, sauvegardes et validation — ELS SCHOOL MANAGER

## Variables Vercel privées

Configurer dans **Project → Settings → Environment Variables** (Production, Preview seulement si souhaité) :

- `DATABASE_URL` : chaîne Neon avec TLS, idéalement le pooler.
- `AUTH_SECRET` : secret aléatoire unique de 32 caractères minimum.
- `NEXT_PUBLIC_SITE_URL` : URL publique canonique du site.
- `SASPAY_API_KEY` et `SASPAY_WEBHOOK_SECRET` : secrets privés du compte marchand.
- `ELS_PLATFORM_ADMIN_EMAIL` : adresse exacte du compte qui aura accès à l’administration globale ELS.

Ne jamais préfixer les secrets avec `VITE_`, les committer ou les coller dans un chat. Après modification des variables, redéployer.

## Migrations Neon

Sur une base existante, lire les instructions de chaque migration avant de l’exécuter. Dans Neon SQL Editor, exécuter une seule fois les migrations manquantes, dans cet ordre :

1. `database/migrations/2026-10-neon-payments.sql`
2. `database/migrations/2026-10-school-fees.sql`
3. `database/migrations/2026-10-subscription-plans.sql`
4. `database/migrations/2026-10-security-audit.sql`

Sur une base entièrement neuve, exécuter d’abord `database/neon-schema.sql`, puis les migrations nécessaires qui ne sont pas déjà intégrées au schéma. Vérifier les tables et les colonnes avant toute migration sur une base de production. Ne jamais exécuter le schéma initial sur une base contenant déjà des données sans sauvegarde et revue.

## Sauvegardes et restauration

1. Dans Neon, ouvrir le projet et vérifier la disponibilité de la fonction de restauration / historique de branches correspondant au forfait utilisé.
2. Avant une migration, créer une branche de base de données de sauvegarde ou un export SQL complet via l’outil officiel Neon/pg_dump.
3. Conserver l’export hors du dépôt Git et dans un emplacement privé avec accès limité.
4. Tester régulièrement la restauration dans une base séparée, puis vérifier les comptes, écoles, élèves, paiements, abonnements et journaux.
5. Ne jamais tester la restauration directement sur la base de production.
6. Documenter la date, le responsable et le résultat du test. Le plan gratuit du fournisseur peut limiter la rétention et la restauration ; vérifier les limites affichées dans le compte Neon.

Exemple d’export local (installer PostgreSQL client et remplacer les variables localement, sans partager la chaîne) :

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="els-school-backup.dump"
```

Restauration uniquement vers une base de test vide :

```bash
pg_restore --dbname="$DATABASE_URL_TEST" --no-owner --clean --if-exists "els-school-backup.dump"
```

## Tests de validation avant mise en production

Utiliser deux écoles fictives et des comptes de test distincts.

- [ ] `/api/health` renvoie `ok: true` et `database: connected`.
- [ ] Inscription valide, connexion, déconnexion et session expirée.
- [ ] Après plusieurs tentatives répétées, la connexion/inscription renvoie HTTP 429 avec `Retry-After`.
- [ ] Une école ne peut ni lire ni modifier les élèves, classes, présences, notes, frais ou reçus d’une autre école.
- [ ] Les rôles enseignant, secrétariat et comptabilité ne peuvent pas réaliser les actions réservées à la direction.
- [ ] Les mutations sont bloquées si l’essai ou l’abonnement est expiré/suspendu.
- [ ] Les limites de 100 et 300 élèves sont contrôlées côté serveur et par le déclencheur SQL ; le forfait Illimité ne doit pas avoir de plafond.
- [ ] Import CSV : tester une ligne valide, un matricule en double, une classe étrangère, un fichier trop grand et un dépassement de forfait.
- [ ] Les reçus et fiches d’élèves sont imprimables ; les exports CSV s’ouvrent correctement dans un tableur.
- [ ] SasPay : créer un checkout réel en mode de test si disponible, vérifier la notification signée, la consultation de statut, le montant XOF exact, l’idempotence et l’activation unique.
- [ ] Envoyer un webhook falsifié, expiré, en double ou avec un montant incorrect : aucun ne doit activer un abonnement.
- [ ] Connecter un compte non administrateur à `/api/platform-admin` : il doit recevoir HTTP 403.
- [ ] Tester suspension et réactivation d’une école depuis l’espace administrateur et vérifier le journal.
- [ ] Restaurer une sauvegarde dans une base de test et vérifier les données.

## SasPay : point important

Le build TypeScript réussi ne prouve pas que le compte marchand utilise les mêmes noms d’événements, en-têtes de signature ou structure de réponse que le code. Confirmer ces détails dans la documentation fournie par SasPay pour le compte réel, puis effectuer un paiement de test de bout en bout avant d’annoncer l’intégration comme validée.

## Accès à l’administration globale

Définir `ELS_PLATFORM_ADMIN_EMAIL` sur Vercel avec l’adresse exacte du compte administrateur, redéployer, puis se connecter avec ce compte. L’autorisation est vérifiée côté serveur ; le simple fait d’afficher la page ne donne pas les droits. Ne pas utiliser l’adresse de l’administrateur pour les tests ordinaires des écoles.
