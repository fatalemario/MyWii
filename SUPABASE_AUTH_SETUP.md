# Configuration de l'authentification MyWii

MyWii exige une session Supabase pour afficher l'espace communautaire. Les visiteurs non connectés voient uniquement l'écran d'accueil/connexion et le téléchargement du paquet du launcher Windows.

## 1. URL de retour après confirmation e-mail

Dans Supabase : **Authentication → URL Configuration**.

- **Site URL** : `https://mywii.netlify.app`
- **Redirect URLs** : ajouter `https://mywii.netlify.app/**`
- Enregistrer.

Le formulaire d'inscription demande à Supabase de revenir à `https://mywii.netlify.app/` après confirmation. Le client Supabase échange automatiquement le code de confirmation et restaure la session.

Pour tester en local, ajouter aussi `http://localhost:8888/**` si le site local est utilisé.

## 2. Modèle d'e-mail de confirmation plus joli

Dans Supabase : **Authentication → Email Templates → Confirm signup**. Tu peux remplacer le contenu HTML par le contenu du fichier `supabase_confirm_email.html`. Garde bien `{{ .ConfirmationURL }}` dans le bouton.

## 3. Réglage sécurité

- Ne place jamais `SUPABASE_SERVICE_ROLE_KEY` dans le JavaScript du navigateur ou dans GitHub.
- Dans Netlify, garde `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` dans les variables d'environnement.
- La clé `SUPABASE_ANON_KEY` / publishable key est publique, la service role est privée.
- La confirmation e-mail peut rester activée. Après clic sur le lien, le navigateur revient sur MyWii et la session est restaurée si les URL de retour ci-dessus sont autorisées.

## 4. Launcher Windows

Le bouton du site télécharge `web_public/downloads/MyWiiLauncher_Windows.zip`. Sur Windows, extraire le ZIP et lancer `build_launcher.bat`. Le script fabrique `dist/MyWiiLauncher.exe` avec PyInstaller. C'est une fenêtre de bureau qui affiche le site MyWii hébergé, pas un client de jeu natif.
