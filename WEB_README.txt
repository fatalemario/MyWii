MYWII COMMUNITY — VERSION NETLIFY
=================================

Le site communautaire complet est dans web_public/.
Il utilise Netlify Functions + Supabase (Auth, PostgreSQL, Storage).

POUR L'INSTALLATION ET L'HEBERGEMENT : lire NETLIFY_SUPABASE.md.
Executer supabase_schema.sql dans le SQL Editor Supabase, puis configurer
les variables d'environnement Netlify. Le dossier racine a deployer est myWii/.

FONCTIONNALITES :
- Comptes MyWii et profils publics.
- Amis, demandes, messages privés.
- Sessions entre amis avec codes d'invitation et chat.
- Classements par jeu : global, 7 jours et 30 jours.
- Statistiques, meilleurs scores et trophées.
- Publication et gestion de jeux Windows .exe.
- Modération administrateur, clés développeur, plafond de score et cooldown anti-spam.
- Musique du menu Wii après le clic d'entrée (limitation d'autoplay des navigateurs).

AUCUN JEU N'EST EXECUTE DANS LE NAVIGATEUR OU SUR LE SERVEUR.
Les fichiers EXE restent privés jusqu'à leur validation.

IMPORTANT : le déploiement public nécessite un projet Supabase configuré et les
variables Netlify. Le ZIP seul n'est pas un hébergement et ne contient aucune clé.
L'anti-triche générique est une première protection ; un vrai anti-cheat exige
une validation serveur propre à chaque jeu.

Le launcher PC d'origine est conservé (launcher.py, wii.html, shop.html, mii.html).
