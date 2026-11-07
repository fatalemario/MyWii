@echo off
setlocal
cd /d "%~dp0"
title Construction du launcher MyWii

echo ==============================================
echo          CONSTRUIRE MYWII LAUNCHER
 echo ==============================================
echo.
where py >nul 2>nul
if errorlevel 1 (
  echo Python n'est pas installe ou la commande py est introuvable.
  echo Installe Python 3.11 ou 3.12 depuis https://www.python.org/downloads/windows/
  pause
  exit /b 1
)

py -m pip install --upgrade pip
if errorlevel 1 goto erreur
py -m pip install pywebview pyinstaller
if errorlevel 1 goto erreur
py -m PyInstaller --noconfirm --clean --onefile --windowed --name MyWiiLauncher --collect-all webview mywii_launcher.py
if errorlevel 1 goto erreur

echo.
echo ==============================================
echo SUCCES ! Ton launcher est ici :
echo %CD%\dist\MyWiiLauncher.exe
echo ==============================================
start "" "%CD%\dist"
pause
exit /b 0

:erreur
echo.
echo Une erreur est survenue pendant la construction.
echo Verifie que Python 3.11 ou 3.12 est installe et que Windows a acces a Internet.
pause
exit /b 1
