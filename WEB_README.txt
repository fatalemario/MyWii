MYWII — VERSION WEB + LAUNCHER

SITE WEB : connexion/inscription obligatoire, Wishop (téléchargement des jeux PC .exe), Mon Mii, Classements et Profil. Les sections Amis/Salons et la gestion de la communauté sont réservées au launcher Wii.

LAUNCHER : le pack Windows ouvre https://mywii.netlify.app/launcher.html. Le menu Wii hébergé propose les chaînes Amis et Salons via launcher-social.html. La session Supabase est partagée avec le site car les pages sont sur le même domaine.

DEPLOIEMENT : publier le contenu du dossier myWii à la racine du dépôt GitHub connecté à Netlify. Publish directory = web_public ; Functions directory = netlify/functions. Conserver les variables Netlify existantes. Aucun changement SQL Supabase n'est requis pour cette refonte de l'interface.

NOTE : les téléchargements de jeux restent servis par /api/games/:id/download. Les jeux doivent être approuvés et les joueurs connectés.
