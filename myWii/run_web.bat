@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MyWii - Serveur local Netlify
if not exist .env (
  copy .env.example .env >nul
  echo.
  echo Fichier .env cree depuis .env.example.
  echo Ouvre .env et renseigne les 3 valeurs Supabase avant de continuer.
  echo Consulte NETLIFY_SUPABASE.md pour les trouver.
  echo.
  pause
  exit /b 1
)
where node >nul 2>nul || (echo Node.js est requis. Installe Node.js 20 ou 22. & pause & exit /b 1)
echo Installation des dependances...
npm install
if errorlevel 1 (echo Echec de npm install. & pause & exit /b 1)
echo Demarrage de MyWii en local...
npx netlify dev
pause
