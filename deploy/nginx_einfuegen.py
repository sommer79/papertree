# -*- coding: utf-8 -*-
"""Fuegt den PaperTree-Block in die nginx-Konfiguration von paperless.example.org ein.

Aufruf auf dem Server:   sudo python3 deploy/nginx_einfuegen.py
oder von aussen:         ssh dem Server "sudo python3" < deploy/nginx_einfuegen.py

Legt vorher eine Sicherung an und tut nichts, wenn der Block schon da ist.
"""
import datetime
import os
import shutil
import sys

# Die Datei selbst, nicht der Symlink in sites-enabled.
ZIEL = "/etc/nginx/sites-available/paperless.example.org"

# Die Sicherung darf NICHT in sites-enabled liegen: nginx liest dort mit
# "include sites-enabled/*" jede Datei ein und meldet sonst
# "conflicting server name".
SICHERUNGEN = "/etc/nginx/sicherungen"

BLOCK = [
    "    # PaperTree - eigene Navigations- und Leseoberflaeche ueber Paperless.",
    "    # Laeuft unter derselben Domain, damit der Session-Cookie gilt (A2, A6).",
    "    location = /papertree {",
    "        return 301 /papertree/;",
    "    }",
    "",
    "    location /papertree/ {",
    "        proxy_pass http://127.0.0.1:8080/;",
    "        proxy_http_version 1.1;",
    "",
    "        proxy_set_header Host              $host;",
    "        proxy_set_header X-Real-IP         $remote_addr;",
    "        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;",
    "        proxy_set_header X-Forwarded-Proto $scheme;",
    "        proxy_set_header X-Forwarded-Prefix /papertree;",
    "",
    "        # PDF-Vorschau und Download laufen als Strom durch",
    "        proxy_buffering off;",
    "        proxy_read_timeout 120s;",
    "    }",
    "",
]


def main() -> int:
    with open(ZIEL, "r", encoding="utf-8") as datei:
        zeilen = datei.read().split("\n")

    if any("/papertree" in z for z in zeilen):
        print("Der PaperTree-Block steht bereits in der Datei - nichts geaendert.")
        return 0

    # Die Einfuegestelle ist das "location /" im HTTPS-Block. Der HTTP-Block
    # darueber hat ein einzeiliges "location / { return 301 ... }".
    stelle = None
    for nummer, zeile in enumerate(zeilen):
        if zeile.strip() == "location / {":
            stelle = nummer
            break

    if stelle is None:
        print("FEHLER: kein mehrzeiliges 'location / {' gefunden - nichts geaendert.")
        return 1

    marke = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    os.makedirs(SICHERUNGEN, exist_ok=True)
    sicherung = os.path.join(SICHERUNGEN, "paperless.example.org.vor-papertree-" + marke)
    shutil.copy2(ZIEL, sicherung)

    with open(ZIEL, "w", encoding="utf-8") as datei:
        datei.write("\n".join(zeilen[:stelle] + BLOCK + zeilen[stelle:]))

    print("Sicherung: " + sicherung)
    print("Block eingefuegt vor Zeile %d." % (stelle + 1))
    print("Jetzt pruefen und neu laden:  nginx -t && systemctl reload nginx")
    return 0


if __name__ == "__main__":
    sys.exit(main())
