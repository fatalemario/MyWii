"""MyWii Launcher : ouvre la plateforme MyWii dans une fenêtre de bureau dédiée."""
import webview

URL = "https://mywii.netlify.app/"

if __name__ == "__main__":
    webview.create_window(
        title="MyWii — Le monde des jeux",
        url=URL,
        width=1440,
        height=900,
        min_size=(900, 620),
        background_color="#f5fbff",
        text_select=True,
    )
    webview.start(debug=False)
