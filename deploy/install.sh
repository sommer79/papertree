#!/bin/bash
# Richtet PaperTree neben einem laufenden Paperless-ngx ein.
#
# Das Skript sucht sich zusammen, was es braucht – Docker-Netz, Container,
# Adresse, freier Port – und legt das Gefundene als Vorgabe in die Abfrage.
# Jeder Wert lässt sich überschreiben; Enter übernimmt die Vorgabe. Nichts
# wird stillschweigend angenommen, und geschrieben wird erst am Ende, nach
# einer Bestätigung.
#
#   ./deploy/install.sh              fragt nach und richtet ein
#   ./deploy/install.sh --pruefen    zeigt nur den Befund, ändert nichts
#
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DATEI="$HIER/.env"
NUR_PRUEFEN=0
[ "${1:-}" = "--pruefen" ] && NUR_PRUEFEN=1

rot()   { printf '\033[31m%s\033[0m\n' "$*"; }
gruen() { printf '\033[32m%s\033[0m\n' "$*"; }
grau()  { printf '\033[90m%s\033[0m\n' "$*"; }
titel() { printf '\n\033[1m%s\033[0m\n' "$*"; }

fehler() { rot "FEHLER: $*"; exit 1; }

# Fragt einen Wert ab und bietet das Gefundene als Vorgabe an. Die
# Aufforderung geht nach stderr, damit sie nicht im Rückgabewert landet,
# wenn der Aufrufer die Funktion in $(…) fängt.
frage() {
    local text="$1" vorgabe="${2:-}" eingabe
    if [ "$NUR_PRUEFEN" -eq 1 ]; then
        printf '%s' "$vorgabe"
        return
    fi
    if [ -n "$vorgabe" ]; then
        printf '  %s [%s]: ' "$text" "$vorgabe" >&2
    else
        printf '  %s: ' "$text" >&2
    fi
    read -r eingabe
    printf '%s' "${eingabe:-$vorgabe}"
}

# --- Voraussetzungen ---------------------------------------------------------
titel "Voraussetzungen"
command -v docker >/dev/null || fehler "docker nicht gefunden."
docker compose version >/dev/null 2>&1 \
    || fehler "docker compose (v2) nicht gefunden."
docker info >/dev/null 2>&1 \
    || fehler "Docker antwortet nicht. Läuft der Dienst, und darf dieser Benutzer ihn bedienen?"
gruen "  docker und docker compose sind da"

# --- Paperless finden --------------------------------------------------------
# Erkannt wird am Image, nicht am Namen: den Container darf jeder nennen,
# wie er will, das Image heisst bei allen paperless-ngx. Die Hilfsdienste
# fallen raus, gesucht ist der Webserver.
titel "Paperless suchen"
GEFUNDEN="$(docker ps --format '{{.Names}}\t{{.Image}}' \
    | awk 'tolower($2) ~ /paperless-ngx|paperless_ngx/ {print $1}' \
    | grep -viE 'db|broker|redis|postgres|mariadb|tika|gotenberg' \
    | head -1 || true)"
if [ -n "$GEFUNDEN" ]; then
    gruen "  gefunden: $GEFUNDEN"
else
    grau "  Kein laufender Paperless-Container erkannt – bitte von Hand angeben."
fi
PAPERLESS_CONTAINER="$(frage "Container des Paperless-Webservers" "$GEFUNDEN")"
[ -n "$PAPERLESS_CONTAINER" ] || fehler "Ohne Paperless geht es nicht."
docker inspect "$PAPERLESS_CONTAINER" >/dev/null 2>&1 \
    || fehler "Container '$PAPERLESS_CONTAINER' gibt es nicht."

# Das Netz, in dem dieser Container hängt.
NETZ_GEFUNDEN="$(docker inspect "$PAPERLESS_CONTAINER" \
    --format '{{range $n, $v := .NetworkSettings.Networks}}{{$n}}{{"\n"}}{{end}}' \
    | grep -v '^$' | grep -v '^bridge$' | head -1 || true)"
PAPERLESS_NETZ="$(frage "Docker-Netz" "$NETZ_GEFUNDEN")"
[ -n "$PAPERLESS_NETZ" ] \
    || fehler "Ohne gemeinsames Netz könnte PaperTree Paperless nicht erreichen."
docker network inspect "$PAPERLESS_NETZ" >/dev/null 2>&1 \
    || fehler "Netz '$PAPERLESS_NETZ' gibt es nicht."

# Der Port, auf dem Paperless im Netz lauscht.
PORT_GEFUNDEN="$(docker inspect "$PAPERLESS_CONTAINER" \
    --format '{{range $p, $v := .Config.ExposedPorts}}{{$p}}{{"\n"}}{{end}}' \
    | sed 's|/tcp||' | head -1 || true)"
case "$PORT_GEFUNDEN" in ''|*[!0-9]*) PORT_GEFUNDEN=8000 ;; esac
PAPERTREE_PAPERLESS_URL="$(frage "Paperless im Docker-Netz" \
    "http://$PAPERLESS_CONTAINER:$PORT_GEFUNDEN")"

# --- Öffentliche Adresse -----------------------------------------------------
# Paperless kennt seine eigene Adresse in PAPERLESS_URL. Steht sie dort
# nicht, hilft nur Nachfragen: eine geratene Adresse fiele erst beim
# Anmelden auf, und dann sähe es nach einem Fehler in PaperTree aus.
titel "Adresse für den Browser"
OEFFENTLICH_GEFUNDEN="$(docker inspect "$PAPERLESS_CONTAINER" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | sed -n 's/^PAPERLESS_URL=//p' | head -1 || true)"
[ -n "$OEFFENTLICH_GEFUNDEN" ] \
    && gruen "  aus der Paperless-Konfiguration: $OEFFENTLICH_GEFUNDEN" \
    || grau "  Paperless nennt keine PAPERLESS_URL."
OEFFENTLICH="$(frage "Adresse, unter der Benutzer Paperless aufrufen" \
    "$OEFFENTLICH_GEFUNDEN")"
OEFFENTLICH="${OEFFENTLICH%/}"
[ -n "$OEFFENTLICH" ] \
    || grau "  Ohne diese Adresse bleibt der Knopf 'In Paperless öffnen' wirkungslos."

# --- Pfad und Port -----------------------------------------------------------
titel "Pfad und Port"
BASIS_PFAD="$(frage "Pfad, unter dem PaperTree erscheint" "papertree")"
BASIS_PFAD="$(echo "$BASIS_PFAD" | sed 's|^/*||; s|/*$||')"
[ -n "$BASIS_PFAD" ] || fehler "Der Pfad darf nicht leer sein."

# Einen freien Port vorschlagen, statt 8080 blind zu nehmen.
belegt() {
    if command -v ss >/dev/null 2>&1; then
        ss -ltn 2>/dev/null | grep -q ":$1 "
    else
        docker ps --format '{{.Ports}}' | grep -q ":$1->"
    fi
}
PORT_VORSCHLAG=8080
while belegt "$PORT_VORSCHLAG"; do
    PORT_VORSCHLAG=$((PORT_VORSCHLAG + 1))
    [ "$PORT_VORSCHLAG" -lt 8100 ] || fehler "Kein freier Port zwischen 8080 und 8100 gefunden."
done
PAPERTREE_PORT="$(frage "Port auf 127.0.0.1" "$PORT_VORSCHLAG")"
case "$PAPERTREE_PORT" in ''|*[!0-9]*) fehler "'$PAPERTREE_PORT' ist keine Portnummer." ;; esac
if belegt "$PAPERTREE_PORT"; then
    rot "  Achtung: Port $PAPERTREE_PORT ist bereits belegt."
fi

# --- Befund ------------------------------------------------------------------
titel "Das wird eingetragen"
cat <<UEBERSICHT
  Paperless-Container : $PAPERLESS_CONTAINER
  Docker-Netz         : $PAPERLESS_NETZ
  intern              : $PAPERTREE_PAPERLESS_URL
  öffentlich          : ${OEFFENTLICH:-(nicht gesetzt)}
  Pfad                : /$BASIS_PFAD/
  Port (nur lokal)    : 127.0.0.1:$PAPERTREE_PORT
UEBERSICHT

if [ "$NUR_PRUEFEN" -eq 1 ]; then
    titel "Nur geprüft – es wurde nichts geändert."
    exit 0
fi

printf '\nSo eintragen und PaperTree starten? [j/N] '
read -r ANTWORT
case "$ANTWORT" in
    [jJyY]*) ;;
    *) grau "Abgebrochen – es wurde nichts geändert."; exit 0 ;;
esac

# --- Schreiben und starten ---------------------------------------------------
titel "Einrichten"
if [ -f "$ENV_DATEI" ]; then
    cp "$ENV_DATEI" "$ENV_DATEI.vorher"
    grau "  bisherige .env gesichert als .env.vorher"
fi
cat > "$ENV_DATEI" <<ENV
# Von deploy/install.sh erzeugt. Von Hand änderbar; danach
# "docker compose -f deploy/docker-compose.papertree.yml up -d" aufrufen.
PAPERLESS_NETZ=$PAPERLESS_NETZ
PAPERTREE_PAPERLESS_URL=$PAPERTREE_PAPERLESS_URL
PAPERTREE_PAPERLESS_PUBLIC_URL=$OEFFENTLICH
PAPERTREE_BASE_PATH=$BASIS_PFAD
PAPERTREE_PORT=$PAPERTREE_PORT
ENV
gruen "  $ENV_DATEI geschrieben"

docker compose -f "$HIER/docker-compose.papertree.yml" up -d --build
gruen "  Container gebaut und gestartet"

# --- Nachsehen, ob es wirklich läuft ----------------------------------------
titel "Prüfen"
for _ in $(seq 1 30); do
    curl -fsS "http://127.0.0.1:$PAPERTREE_PORT/gesund" >/dev/null 2>&1 && break
    sleep 1
done
if curl -fsS "http://127.0.0.1:$PAPERTREE_PORT/gesund" >/dev/null 2>&1; then
    gruen "  PaperTree antwortet: $(curl -fsS "http://127.0.0.1:$PAPERTREE_PORT/gesund")"
else
    rot "  PaperTree antwortet nicht."
    grau "  Was sagt das Protokoll?  docker logs \$(docker compose -f deploy/docker-compose.papertree.yml ps -q papertree)"
    exit 1
fi

# Erreicht PaperTree Paperless auch wirklich? Ein 401 ist hier die richtige
# Antwort: der Aufruf kommt ohne Anmeldung, aber die Verbindung steht.
ANTWORT_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:$PAPERTREE_PORT/api/ich" || echo 000)"
case "$ANTWORT_CODE" in
    401) gruen "  Verbindung zu Paperless steht (401 ohne Anmeldung ist richtig)" ;;
    503) rot  "  PaperTree erreicht Paperless nicht – stimmen Netz und interne Adresse?" ;;
    *)   grau "  Antwort von /api/ich: HTTP $ANTWORT_CODE" ;;
esac

# --- Reverse Proxy -----------------------------------------------------------
# PaperTree hört nur auf 127.0.0.1. Damit es im Browser erscheint – und
# damit der Sitzungs-Cookie von Paperless gilt –, muss es unter derselben
# Adresse ausgeliefert werden wie Paperless.
titel "Reverse Proxy"

HOST="$(echo "$OEFFENTLICH" | sed -E 's|^[a-z]+://||; s|[:/].*$||')"
FERTIG=0

if command -v nginx >/dev/null 2>&1 && [ -n "$HOST" ]; then
    gruen "  nginx gefunden"
    if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
        grau "  Für /etc/nginx braucht es root – bitte den Schritt unten von Hand tun."
    else
        printf '  Soll PaperTree in die nginx-Konfiguration eingetragen werden? [j/N] '
        read -r ANTWORT
        case "$ANTWORT" in
            [jJyY]*)
                ALS_ROOT=""
                [ "$(id -u)" -ne 0 ] && ALS_ROOT="sudo"
                if $ALS_ROOT python3 "$HIER/nginx_einfuegen.py"                         --host "$HOST" --pfad "$BASIS_PFAD"                         --port "$PAPERTREE_PORT" --neuladen; then
                    FERTIG=1
                else
                    rot "  Eintrag nicht möglich – bitte von Hand, siehe unten."
                fi
                ;;
        esac
    fi
else
    grau "  Kein nginx gefunden (oder keine Adresse bekannt)."
fi

if [ "$FERTIG" -eq 0 ]; then
    cat <<ANLEITUNG

  Noch zu tun: PaperTree muss unter derselben Adresse erscheinen wie
  Paperless, sonst gilt dessen Sitzungs-Cookie nicht und niemand ist
  angemeldet. Es hört auf 127.0.0.1:$PAPERTREE_PORT.

  nginx:
      sudo python3 deploy/nginx_einfuegen.py --host ${HOST:-DEINE-ADRESSE}            --pfad $BASIS_PFAD --port $PAPERTREE_PORT --neuladen

  Apache, Caddy, Traefik und andere: den Pfad /$BASIS_PFAD/ auf
  http://127.0.0.1:$PAPERTREE_PORT/ leiten. Wichtig sind der abschliessende
  Schrägstrich am Ziel und ein ungepufferter Durchlauf, damit die
  PDF-Vorschau als Strom ankommt. Vorlage: deploy/nginx-papertree.conf
ANLEITUNG
fi

titel "Fertig."
if [ "$FERTIG" -eq 1 ]; then
    gruen "  PaperTree läuft unter ${OEFFENTLICH}/$BASIS_PFAD/"
else
    grau "  Nach dem Schritt oben erreichbar unter: ${OEFFENTLICH:-https://…}/$BASIS_PFAD/"
fi
