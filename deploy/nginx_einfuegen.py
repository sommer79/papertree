# -*- coding: utf-8 -*-
"""Trägt PaperTree in eine bestehende nginx-Konfiguration ein.

PaperTree muss unter derselben Adresse erscheinen wie Paperless – nur dann
gilt dessen Sitzungs-Cookie, und ohne den ist niemand angemeldet. Dieses
Skript sucht den passenden server-Block und hängt die nötigen location-
Regeln davor.

Angefasst wird nichts ohne Netz: vorher eine Sicherung, danach `nginx -t`.
Beanstandet nginx die Datei, wird die Sicherung zurückgespielt – eine
kaputte Konfiguration bliebe sonst stehen, und beim nächsten Neustart wäre
auch Paperless nicht mehr erreichbar.

Aufruf (als root, weil /etc/nginx nur diesem gehört):

    sudo python3 deploy/nginx_einfuegen.py --host paperless.example.org
    sudo python3 deploy/nginx_einfuegen.py --host … --pfad papertree --port 8080
    sudo python3 deploy/nginx_einfuegen.py --datei /etc/nginx/sites-available/xy

Ohne --neuladen wird am Ende nur gesagt, was noch zu tun ist.
"""
import argparse
import datetime
import glob
import os
import re
import shutil
import subprocess
import sys

SUCHORTE = (
    "/etc/nginx/sites-available/*",
    "/etc/nginx/conf.d/*.conf",
    "/etc/nginx/http.d/*.conf",
)
# Die Sicherung darf NICHT in sites-enabled liegen: nginx liest dort mit
# "include sites-enabled/*" jede Datei ein und meldete sonst
# "conflicting server name".
SICHERUNGEN = "/etc/nginx/papertree-sicherungen"


def block(pfad: str, port: int) -> list:
    return [
        "    # PaperTree - eigene Navigations- und Leseoberflaeche ueber Paperless.",
        "    # Laeuft unter derselben Domain, damit der Sitzungs-Cookie gilt.",
        "    location = /%s {" % pfad,
        "        return 301 /%s/;" % pfad,
        "    }",
        "",
        "    location /%s/ {" % pfad,
        "        proxy_pass http://127.0.0.1:%d/;" % port,
        "        proxy_http_version 1.1;",
        "",
        "        proxy_set_header Host              $host;",
        "        proxy_set_header X-Real-IP         $remote_addr;",
        "        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;",
        "        proxy_set_header X-Forwarded-Proto $scheme;",
        "        proxy_set_header X-Forwarded-Prefix /%s;" % pfad,
        "",
        "        # PDF-Vorschau und Download laufen als Strom durch",
        "        proxy_buffering off;",
        "        proxy_read_timeout 120s;",
        "    }",
        "",
    ]


def datei_suchen(host: str):
    """Die Konfigurationsdatei, deren server_name auf diesen Host passt."""
    treffer = []
    for muster in SUCHORTE:
        for pfad in sorted(glob.glob(muster)):
            if os.path.isdir(pfad):
                continue
            try:
                with open(pfad, encoding="utf-8", errors="replace") as datei:
                    inhalt = datei.read()
            except OSError:
                continue
            for namen in re.findall(r"^\s*server_name\s+([^;]+);", inhalt, re.M):
                if host in namen.split():
                    treffer.append(pfad)
                    break
    return treffer


def einfuegestelle(zeilen: list):
    """Das mehrzeilige 'location / {' – bevorzugt im TLS-Block.

    Der HTTP-Block leitet meist nur um und hat ein einzeiliges
    'location / { return 301 … }'. Dort gehört PaperTree nicht hin: die
    Weiterleitung würde es nie erreichen.
    """
    kandidaten = [n for n, z in enumerate(zeilen) if z.strip() == "location / {"]
    if not kandidaten:
        return None
    for nummer in kandidaten:
        davor = "\n".join(zeilen[max(0, nummer - 60):nummer])
        if "ssl_certificate" in davor or "listen 443" in davor:
            return nummer
    return kandidaten[-1]


def nginx_pruefen():
    try:
        fertig = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
        return fertig.returncode == 0, (fertig.stderr or fertig.stdout).strip()
    except FileNotFoundError:
        return None, "nginx nicht gefunden – die Datei wurde nicht geprüft."


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument("--host", help="Adresse, unter der Paperless läuft")
    zerleger.add_argument("--datei", help="Konfigurationsdatei, statt sie zu suchen")
    zerleger.add_argument("--pfad", default="papertree", help="Unterpfad (Vorgabe: papertree)")
    zerleger.add_argument("--port", type=int, default=8080, help="Port von PaperTree auf 127.0.0.1")
    zerleger.add_argument("--neuladen", action="store_true", help="nginx danach neu laden")
    argumente = zerleger.parse_args()

    pfad = argumente.pfad.strip("/")
    if not pfad:
        print("FEHLER: --pfad darf nicht leer sein.")
        return 1

    ziel = argumente.datei
    if not ziel:
        if not argumente.host:
            print("FEHLER: entweder --host oder --datei angeben.")
            return 1
        treffer = datei_suchen(argumente.host)
        if not treffer:
            print("FEHLER: keine nginx-Datei mit server_name %s gefunden." % argumente.host)
            print("        Mit --datei den Pfad selbst angeben.")
            return 1
        if len(treffer) > 1:
            print("Mehrere Dateien nennen diesen server_name:")
            for t in treffer:
                print("   " + t)
            print("Mit --datei entscheiden, welche gemeint ist.")
            return 1
        ziel = treffer[0]

    if not os.path.isfile(ziel):
        print("FEHLER: %s gibt es nicht." % ziel)
        return 1
    print("Datei: %s" % ziel)

    with open(ziel, encoding="utf-8") as datei:
        zeilen = datei.read().split("\n")

    if any(("/%s/" % pfad) in z and "location" in z for z in zeilen):
        print("PaperTree steht bereits in dieser Datei – nichts geändert.")
        return 0

    stelle = einfuegestelle(zeilen)
    if stelle is None:
        print("FEHLER: kein mehrzeiliges 'location / {' gefunden – nichts geändert.")
        print("        Den Inhalt von deploy/nginx-papertree.conf von Hand einfügen.")
        return 1

    marke = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    os.makedirs(SICHERUNGEN, exist_ok=True)
    sicherung = os.path.join(
        SICHERUNGEN, "%s.vor-papertree-%s" % (os.path.basename(ziel), marke))
    shutil.copy2(ziel, sicherung)
    print("Sicherung: %s" % sicherung)

    with open(ziel, "w", encoding="utf-8") as datei:
        datei.write("\n".join(zeilen[:stelle] + block(pfad, argumente.port) + zeilen[stelle:]))
    print("Block eingefügt vor Zeile %d." % (stelle + 1))

    gut, meldung = nginx_pruefen()
    if gut is False:
        shutil.copy2(sicherung, ziel)
        print("\nnginx beanstandet die Datei – die Sicherung ist zurückgespielt:")
        print(meldung)
        return 1
    if gut is None:
        print(meldung)
    else:
        print("nginx -t: in Ordnung")

    if argumente.neuladen and gut:
        fertig = subprocess.run(["systemctl", "reload", "nginx"],
                                capture_output=True, text=True)
        if fertig.returncode == 0:
            print("nginx neu geladen.")
        else:
            print("Neuladen fehlgeschlagen: %s" % (fertig.stderr or "").strip())
            return 1
    elif gut:
        print("\nNoch zu tun:  systemctl reload nginx")

    return 0


if __name__ == "__main__":
    sys.exit(main())
