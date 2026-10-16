# ELS SCHOOL MANAGER

SaaS simple de gestion d'école primaire au Bénin.

## Fonctions prévues
- Inscription et connexion du directeur
- Gestion des élèves et de leurs inscriptions
- Classes CI, CP, CE1, CE2, CM1 et CM2
- Présences
- Notes et bulletins
- Frais scolaires, paiements et reçus
- Gestion de plusieurs écoles avec cloisonnement des données

## Technologies
React, TypeScript, Vite, Supabase Auth et PostgreSQL.

## Démarrer
```bash
npm install
cp .env.example .env
npm run dev
```
Sous Windows PowerShell : `Copy-Item .env.example .env`.

Configurer `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env`. Exécuter ensuite `supabase/schema.sql` dans l'éditeur SQL Supabase.

## Important
Version initiale en cours de développement. Ne pas saisir de vraies données d'élèves avant d'avoir configuré Supabase, testé les politiques de sécurité et validé l'application. Les données d'exemple doivent rester fictives.