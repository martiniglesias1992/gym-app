"""
Serves the app on your computer so you can try it before publishing.

    python tools/serve.py

Then open http://localhost:8000 on the computer. To try it on the iPhone,
connect both to the same Wi-Fi and open the "phone" address it prints.
(Offline mode and "Add to Home Screen" only work fully on the published
https:// version, not on this local test.)
"""

import functools
import http.server
import socket
from pathlib import Path

PORT = 8000
SITE = Path(__file__).resolve().parent.parent / "docs"


def local_ip():
    """Find this computer's address on the Wi-Fi network."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))  # no data is sent; it just picks a network card
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def main():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler) as server:
        print(f"Computer: http://localhost:{PORT}")
        print(f"Phone:    http://{local_ip()}:{PORT}   (same Wi-Fi)")
        print("Press Ctrl+C to stop.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
