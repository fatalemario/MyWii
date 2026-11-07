"""Lanceur Wii PC : fenêtre native + lancement de programmes + gestionnaire de fichiers."""
import os, shutil, string, subprocess, sys, webbrowser
import webview

BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "WiiPC")
os.makedirs(DATA, exist_ok=True)
CFG = os.path.join(DATA, "config.json")


def _open(p):
    if hasattr(os, "startfile"):
        os.startfile(p)
    else:
        subprocess.Popen(["xdg-open", p])


class Api:
    # --- configuration ---
    def load(self):
        return open(CFG, encoding="utf-8").read() if os.path.exists(CFG) else ""

    def save(self, s):
        open(CFG, "w", encoding="utf-8").write(s)
        return True

    # --- lancement ---
    def launch(self, cmd, args=""):
        if not os.path.exists(cmd):
            return "Introuvable : " + cmd
        try:
            if cmd.lower().endswith(".exe") or args:
                subprocess.Popen(f'"{cmd}" {args}', cwd=os.path.dirname(cmd) or None)
            else:
                _open(cmd)
            return "Lancement de " + os.path.basename(cmd)
        except Exception as e:
            return "Erreur : " + str(e)

    def url(self, u):
        webbrowser.open(u)

    def pick(self):
        r = webview.windows[0].create_file_dialog(webview.OPEN_DIALOG)
        return r[0] if r else ""

    def fullscreen(self):
        webview.windows[0].toggle_fullscreen()

    # --- gestionnaire de fichiers ---
    def home(self):
        h = os.path.expanduser("~")
        out = {"Accueil": h}
        for label, sub in (("Bureau", "Desktop"), ("Documents", "Documents"), ("Téléchargements", "Downloads")):
            p = os.path.join(h, sub)
            if os.path.isdir(p):
                out[label] = p
        return out

    def ls(self, path=""):
        if not path:
            if os.name == "nt":
                items = [{"n": L + ":", "d": True, "s": 0, "p": L + ":\\"} for L in string.ascii_uppercase if os.path.exists(L + ":\\")]
            else:
                items = [{"n": "/", "d": True, "s": 0, "p": "/"}]
            return {"path": "", "parent": "", "items": items}
        try:
            names = os.listdir(path)
        except Exception as e:
            return {"error": "Accès impossible : " + str(e)}
        items = []
        for n in names:
            p = os.path.join(path, n)
            try:
                d = os.path.isdir(p)
                items.append({"n": n, "d": d, "s": 0 if d else os.path.getsize(p), "p": p})
            except OSError:
                pass
        items.sort(key=lambda i: (not i["d"], i["n"].lower()))
        par = os.path.dirname(path.rstrip("\\/"))
        return {"path": path, "parent": "" if par in (path, path.rstrip("\\/")) else par, "items": items}

    def fopen(self, p):
        try:
            _open(p)
            return ""
        except Exception as e:
            return "Erreur : " + str(e)

    def mkdir(self, path, name):
        try:
            os.makedirs(os.path.join(path, name), exist_ok=False)
            return ""
        except Exception as e:
            return "Impossible : " + str(e)

    def rename(self, p, new):
        try:
            os.rename(p, os.path.join(os.path.dirname(p), new))
            return ""
        except Exception as e:
            return "Impossible : " + str(e)

    def remove(self, p):
        try:
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
            return ""
        except Exception as e:
            return "Impossible : " + str(e)


webview.create_window("Wii", os.path.join(BASE, "wii.html"), js_api=Api(),
                      width=1280, height=720, min_size=(800, 500), background_color="#e9eef3")
webview.start()
