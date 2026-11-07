@echo off
cd /d "%~dp0"
pip install pywebview pyinstaller
pyinstaller --noconsole --onedir --name WiiPC ^
 --add-data "wii.html;." --add-data "mii.html;." --add-data "shop.html;." ^
 --add-data "icons;icons" --add-data "sounds;sounds" --add-data "custom;custom" ^
 launcher.py
echo.
echo Termine : dist\WiiPC\WiiPC.exe
pause