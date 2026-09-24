FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY web/ ./web/

# Der Baum liegt aussen, damit ein neues Abbild ihn nicht mitnimmt.
VOLUME ["/data"]
ENV PAPERTREE_DB=/data/papertree.sqlite3

# Ohne Rechte des Systembenutzers: PaperTree schreibt nur nach /data.
RUN useradd --uid 10001 --create-home papertree \
    && mkdir -p /data && chown papertree:papertree /data
USER papertree

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/gesund', timeout=3).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
