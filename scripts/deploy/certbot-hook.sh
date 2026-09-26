#!/bin/sh
set -eu

PROJECT_ROOT=/home/ubuntu/Intelligent-Border-Video-Analytics-Platform
CERT_DIR="$PROJECT_ROOT/certs"
DOMAIN=ibvap-uk.duckdns.org

compose() {
  docker compose --project-directory "$PROJECT_ROOT" --env-file "$PROJECT_ROOT/.env" "$@"
}

case "$0" in
  */pre/*)
    compose stop nginx-gateway
    ;;
  */post/*)
    compose start nginx-gateway
    ;;
  */deploy/*)
    lineage=${RENEWED_LINEAGE:-/etc/letsencrypt/live/$DOMAIN}
    install -d -m 0755 "$CERT_DIR"
    install -o root -g root -m 0644 "$lineage/fullchain.pem" "$CERT_DIR/.fullchain.pem.new"
    install -o root -g root -m 0600 "$lineage/privkey.pem" "$CERT_DIR/.privkey.pem.new"
    mv -f "$CERT_DIR/.fullchain.pem.new" "$CERT_DIR/fullchain.pem"
    mv -f "$CERT_DIR/.privkey.pem.new" "$CERT_DIR/privkey.pem"

    if [ -n "$(compose ps --status running -q nginx-gateway)" ]; then
      compose exec -T nginx-gateway nginx -t
      compose exec -T nginx-gateway nginx -s reload
    fi
    ;;
  *)
    printf 'Unsupported Certbot hook path: %s\n' "$0" >&2
    exit 2
    ;;
esac
