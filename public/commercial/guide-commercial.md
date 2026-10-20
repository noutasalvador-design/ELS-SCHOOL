# ELS SCHOOL MANAGER
## Guide commercial — Gestion scolaire pour les écoles primaires au Bénin

**Promesse :** centraliser les opérations scolaires courantes dans un espace organisé, accessible sur téléphone et ordinateur, sans portail parent.

## 1. Présentation
ELS SCHOOL MANAGER est un logiciel en ligne conçu pour aider la direction et le personnel d’une école primaire à organiser les informations de l’établissement. Il réunit les fonctions essentielles de gestion des élèves, des classes, des présences, des notes et des frais scolaires.

## 2. Fonctionnalités principales
### Élèves et classes
- Création et mise à jour des fiches élèves.
- Matricule automatique, archivage et fiches imprimables.
- Organisation des classes du CI au CM2.
- Import et export des listes au format CSV.

### Suivi scolaire
- Enregistrement des présences quotidiennes.
- Saisie des notes et préparation de bulletins imprimables.
- Consultation des informations scolaires selon l’accès attribué.

### Frais et suivi financier
- Définition des frais par classe ou par élève.
- Suivi des montants attendus, encaissés et restant à payer.
- Enregistrement des paiements en FCFA et impression de reçus.
- Export de données utiles en CSV.

### Comptes et accès
- Un espace séparé pour chaque établissement.
- Accès d’équipe organisés par rôle selon la configuration de l’application.
- Fonctions d’administration globale distinctes des espaces des écoles.

## 3. Forfaits mensuels
| Forfait | Prix par mois | Capacité |
|---|---:|---|
| Essentiel | 5 000 FCFA | Jusqu’à 100 élèves |
| Standard | 10 000 FCFA | Jusqu’à 300 élèves |
| Illimité | 25 000 FCFA | Nombre d’élèves illimité |

Le choix du forfait dépend de l’effectif de l’établissement. Les limites et conditions appliquées doivent correspondre à la configuration active de l’application.

## 4. Bénéfices
- Retrouver plus facilement les informations scolaires.
- Structurer les listes d’élèves et les classes.
- Suivre les présences, notes et paiements depuis un même espace.
- Réduire les saisies répétitives grâce aux imports et exports CSV.
- Permettre à plusieurs membres du personnel de travailler selon leurs rôles.

## 5. Présentation orale courte
« ELS SCHOOL MANAGER est un logiciel de gestion conçu pour les écoles primaires au Bénin. Il permet de centraliser les fiches des élèves, les classes, les présences, les notes et le suivi des frais scolaires. Votre équipe peut y accéder depuis un téléphone ou un ordinateur. Les forfaits commencent à 5 000 FCFA par mois pour une école comptant jusqu’à 100 élèves, avec des formules à 10 000 FCFA jusqu’à 300 élèves et à 25 000 FCFA pour un effectif illimité. »

## 6. Questions fréquentes
**Le logiciel propose-t-il un portail parent ?**  
Non. Le périmètre actuel est centré sur la direction et le personnel de l’établissement.

**Peut-on l’utiliser sur téléphone ?**  
Oui, l’interface est conçue pour s’adapter aux écrans de téléphone et d’ordinateur. Une connexion Internet est nécessaire.

**Le paiement SasPay est-il validé en production ?**  
Le projet contient le démarrage de checkout et le traitement serveur du callback, mais le parcours complet doit être vérifié avec les identifiants réels, les notifications du fournisseur et un paiement de test. Ne présentez pas le paiement comme validé tant que ce test n’a pas réussi.

## 7. Vérifications avant commercialisation
- Tester l’inscription, la connexion et la séparation des données entre deux écoles.
- Vérifier les limites d’élèves des trois forfaits.
- Tester les modules élèves, classes, présences, notes, frais, reçus et exports.
- Tester le paiement SasPay de bout en bout et la confirmation serveur.
- Vérifier la sauvegarde et la restauration de la base de données.
- Présenter clairement le prix, la période d’abonnement et le canal d’assistance.

*Document de présentation commerciale. Les paiements en ligne et les limites d’abonnement doivent être vérifiés dans l’environnement de production avant toute promesse commerciale.*
