# MyWii Community — déploiement Netlify

Cette version utilise :
- **Netlify** pour le site statique et les fonctions API ;
- **Supabase Auth** pour les comptes ;
- **Supabase Postgres** pour les profils, amis, messages, sessions, jeux et scores ;
- **Supabase Storage** pour stocker les fichiers `.exe` dans un bucket privé.

Le launcher Windows d'origine (`launcher.py`, `wii.html`, boutique et Mii) est conservé. Le site communautaire Netlify est dans `web_public/`.

## 1. Créer le projet Supabase

1. Crée un projet sur https://supabase.com/.
2. Ouvre **SQL Editor** puis **New query**.
3. Copie tout le contenu de `supabase_schema.sql`, exécute-le une seule fois.
4. Dans **Project Settings > API**, récupère :
   - Project URL ;
   - anon / publishable key ;
   - service_role / secret key (à garder strictement privée).
5. Dans **Authentication > URL Configuration**, mets l'URL Netlify comme Site URL et ajoute aussi l'URL de prévisualisation Netlify dans Redirect URLs si tu l'utilises.
6. Pour les tests, tu peux désactiver temporairement la confirmation e-mail dans **Authentication > Providers > Email**. Pour un site public, configure plutôt un SMTP et garde la confirmation activée.

## 2. Configurer les variables Netlify

Dans **Netlify > ton site > Site configuration > Environment variables**, ajoute :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | clé anon / publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service_role / secret — privée |
| `ALLOWED_ORIGIN` | URL publique exacte du site, par exemple `https://mon-site.netlify.app` |

Ne mets jamais la clé `service_role` dans `web_public`, dans le JavaScript du navigateur ou dans GitHub. Elle doit rester uniquement dans les variables Netlify.

## 3. Déployer sur Netlify

Le dossier à déployer est le dossier `myWii` (celui qui contient `netlify.toml`, `package.json` et `web_public`).

**Méthode conseillée : GitHub + Netlify**
1. Crée un dépôt GitHub privé et ajoute le contenu du dossier `myWii`.
2. Dans Netlify, choisis **Add new site > Import an existing project**.
3. Connecte le dépôt.
4. Netlify détecte `netlify.toml` : le dossier publié est `web_public` et les fonctions sont dans `netlify/functions`.
5. Ajoute les quatre variables d'environnement ci-dessus puis lance le déploiement.

Tu peux aussi utiliser Netlify CLI depuis ce dossier : `npm install`, puis `npx netlify login`, `npx netlify link`, puis `npx netlify deploy --prod`.

Un simple glisser-déposer du dossier `web_public` ne suffit **pas** : il ne déploierait pas les fonctions API.

## 4. Donner le rôle administrateur

Après avoir créé ton compte MyWii, récupère ton pseudo puis exécute dans Supabase SQL Editor (remplace `TON_PSEUDO`) :

```sql
update public.profiles
set is_admin = true
where lower(username) = lower('TON_PSEUDO');
```

Reconnecte-toi et ouvre **Créateurs** : tu verras la file de modération. Seul un compte administrateur peut approuver ou refuser une publication.

## 5. Fonctionnement des six fonctionnalités

1. **Amis et messages privés** : demande par pseudo, acceptation, suppression et messages réservés aux amis acceptés.
2. **Sessions entre amis** : création de salons, code d'invitation, liste des membres et chat actualisé périodiquement.
3. **Classements** : classement individuel pour chaque jeu (meilleur score par joueur) et classement général MyWii par points, filtres tout le temps / 7 jours / 30 jours. Les jeux marqués « multijoueur » participent aux classements. Les 10 premiers de chaque jeu gagnent respectivement 10 à 1 points ; les scores bruts de jeux différents ne sont jamais additionnés entre eux.
4. **Profils et trophées** : biographie, statistiques, meilleurs scores et trophées débloqués automatiquement.
5. **Anti-triche de base** : compte MyWii obligatoire pour envoyer un score, clé propre au jeu, plafond de score configuré par le développeur et délai minimum de 5 secondes entre deux scores d'un même joueur pour un même jeu.
6. **Studio développeur** : dépôt d'un EXE, modération, modification du jeu, réglage du plafond de score et rotation de la clé d'intégration.

### Classement général MyWii
Lors de la publication, le créateur coche « Jeu multijoueur avec classement MyWii » pour inclure son jeu. Seuls ces jeux apparaissent dans les classements et peuvent envoyer des scores. Le classement général utilise un barème de points par jeu : 10 points pour la 1re place, 9 pour la 2e, jusqu'à 1 point pour la 10e. Les fonctions SQL `mywii_leaderboards` et `mywii_player_leaderboard` calculent les rangs dans PostgreSQL, sans tronquer l'historique à 1 000 scores. Les classements sont publics et ne demandent pas de connexion. Après ajout des fonctions SQL, exécute à nouveau le fichier `supabase_schema.sql` dans Supabase (les instructions sont idempotentes).

Endpoints publics : `GET /api/leaderboards?period=all|week|month&game_id=UUID` et `GET /api/player-leaderboard?period=all|week|month`.

## 6. Musique Wii

Le fichier `web_public/wii-menu.mp3` est la musique de menu fournie avec le ZIP. L'écran d'entrée lance la musique au clic sur **Entrer dans MyWii**. Les navigateurs bloquent généralement l'audio automatique avec son avant une première interaction : ce clic est donc nécessaire. Le bouton `♫` permet ensuite de couper ou reprendre la musique.

## 7. Limites et sécurité à connaître

- **Aucun jeu ne s'exécute dans le navigateur** : les jeux sont des fichiers Windows `.exe` téléchargés par les joueurs.
- Les EXE restent dans un bucket privé et le téléchargement est disponible seulement après validation. Le serveur MyWii ne lance jamais ces fichiers.
- La vérification `MZ` contrôle seulement la signature basique d'un exécutable Windows ; ce n'est pas un antivirus. Avant une ouverture publique, ajoute un vrai service d'analyse antivirus, un processus de signalement et des règles de modération.
- Le système de score protège contre les erreurs simples et le spam, mais **ne peut pas garantir l'absence de triche universelle** : un client de jeu peut être modifié et une clé embarquée dans un EXE peut être extraite. Pour des classements réellement compétitifs, chaque jeu doit faire vérifier les résultats côté serveur selon ses propres règles (rejeu, événements signés, validation de partie, etc.).
- Configure les quotas et la limite de taille de fichiers selon ton offre Supabase. Le plafond de 500 Mo indiqué dans l'interface doit aussi être autorisé par ton projet Supabase.
- Avant l'ouverture au public, ajoute politique de confidentialité, conditions d'utilisation, procédure de suppression de compte et sauvegardes.

## 8. Vérifications rapides après déploiement

- `/api/config` renvoie l'URL Supabase et la clé publique (jamais la clé service role).
- Crée un compte de test, connecte-toi et complète ton profil.
- Ajoute un deuxième compte test, accepte une demande d'ami et échange un message.
- Crée un salon et rejoins-le avec son code depuis le deuxième compte.
- Publie un petit EXE de test, approuve-le avec le compte admin, puis teste le téléchargement.
- Intègre un jeu de test et vérifie qu'un score trop élevé ou envoyé trop vite est refusé.


## Authentification et confirmation e-mail (mise à jour MyWii)

Consulte `SUPABASE_AUTH_SETUP.md` pour configurer les URL de retour de confirmation. Le site affiche désormais uniquement l’écran de connexion tant qu’aucune session Supabase n’est active. Le lien de confirmation renvoie vers `https://mywii.netlify.app/`. Le modèle d’e-mail HTML est fourni dans `supabase_confirm_email.html`.

Le paquet du launcher Windows est dans `web_public/downloads/MyWiiLauncher_Windows.zip`. Il contient le wrapper PyWebView et `build_launcher.bat` pour construire le fichier EXE sur Windows.
