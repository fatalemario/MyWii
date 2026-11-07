"""MyWii Launcher : ouvre le menu Wii et ses chaînes communautaires."""
import webview

URL = "https://mywii.netlify.app/launcher.html"

if __name__ == "__main__":
    webview.create_window(
        title="MyWii Launcher", url=URL, width=1440, height=900,
        min_size=(900, 620), background_color="#e9eef3", text_select=False,
    )
    webview.start(debug=False)
