# Répartiteur d'étudiants (groups)

Une application web simple pour créer des groupes d'étudiants de façon aléatoire et équitable.

## À quoi ça sert ?

- Créer des classes et ajouter la liste de vos élèves (à la main ou en important un fichier CSV).
- Générer des groupes de taille égale en un clic.
- Ajouter des règles simples si besoin :
  - Garder deux élèves ensemble dans le même groupe.
  - Séparer deux élèves pour qu'ils ne soient pas dans le même groupe.
- Éviter de remettre ensemble les mêmes personnes si vous faites plusieurs tirages d'affilée.
- Exporter les groupes obtenus en fichier CSV.

## Comment lancer le projet

Le plus simple est d'utiliser Docker :

```bash
docker compose up --build
```

Ensuite, ouvrez votre navigateur sur :
- **Application Web** : `http://localhost:5173`
- **Serveur API** : `http://localhost:3001`

Pour lancer manuellement sans Docker :
1. Installer les paquets : `pnpm install`
2. Lancer la base MySQL et exécuter les migrations : `pnpm db:migrate`
3. Lancer le serveur et le site : `pnpm dev`
