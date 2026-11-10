#!/usr/bin/env bash
# ==============================================================================
# Instalador Automático — Evolution API v2 na Oracle Cloud Always Free (Ubuntu)
# Suporta ARM64 (VM.Standard.A1.Flex Ampere) e AMD64 (VM.Standard.E2.1.Micro)
# Inclui PostgreSQL 16 + Redis 7 + Caddy (HTTPS gratuito automático via sslip.io)
# ==============================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Por favor execute com sudo: sudo bash instalar-oracle.sh"
  exit 1
fi

DOMINIO_PERSONALIZADO="${1:-}"
PASTA="/opt/evolution-api"

echo "=================================================================="
echo " 1/5 — A atualizar pacotes básicos e utilitários de rede..."
echo "=================================================================="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg openssl iptables-persistent netfilter-persistent

echo "=================================================================="
echo " 2/5 — A instalar Docker e Docker Compose (se necessário)..."
echo "=================================================================="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "Docker já instalado: $(docker --version)"
fi

echo "=================================================================="
echo " 3/5 — A abrir portas 80, 443 e 8080 no iptables da Oracle Ubuntu..."
echo "=================================================================="
# As imagens Ubuntu da Oracle Cloud trazem uma regra REJECT no iptables por omissão.
for PORTA in 80 443 8080; do
  if ! iptables -C INPUT -p tcp --dport "$PORTA" -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 1 -p tcp --dport "$PORTA" -j ACCEPT
  fi
done
netfilter-persistent save || true

echo "=================================================================="
echo " 4/5 — A gerar configuração segura em ${PASTA}..."
echo "=================================================================="
mkdir -p "$PASTA"
cd "$PASTA"

IP_PUBLICO="$(curl -4 -fsSL https://ifconfig.me || curl -4 -fsSL https://api.ipify.org)"
IP_TRACOS="$(echo "$IP_PUBLICO" | tr '.' '-')"

if [ -n "$DOMINIO_PERSONALIZADO" ]; then
  HOST_HTTPS="$DOMINIO_PERSONALIZADO"
else
  HOST_HTTPS="${IP_TRACOS}.sslip.io"
fi

SERVER_URL="https://${HOST_HTTPS}"

if [ -f .env ]; then
  echo "Ficheiro .env existente detetado — a preservar chaves atuais."
  # shellcheck disable=SC1091
  source .env
else
  POSTGRES_PASSWORD="$(openssl rand -hex 18)"
  EVOLUTION_API_KEY="evo_$(openssl rand -hex 24)"
  cat > .env <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
SERVER_URL=${SERVER_URL}
HOST_HTTPS=${HOST_HTTPS}
EOF
  chmod 600 .env
fi

cat > Caddyfile <<EOF
${HOST_HTTPS} {
    reverse_proxy evolution-api:8080
}
EOF

cat > docker-compose.yml <<'EOF'
services:
  postgres:
    image: postgres:16-alpine
    container_name: evolution_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: evolution_db
    volumes:
      - evolution_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U evolution -d evolution_db"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: evolution_redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - evolution_redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  evolution-api:
    image: evoapicloud/evolution-api:v2.3.7
    container_name: evolution_api
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      SERVER_PORT: 8080
      SERVER_URL: ${SERVER_URL}
      TZ: Africa/Luanda

      AUTHENTICATION_TYPE: apikey
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: "false"

      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:${POSTGRES_PASSWORD}@postgres:5432/evolution_db?schema=public
      DATABASE_CONNECTION_CLIENT_NAME: evolution_academia
      DATABASE_SAVE_DATA_INSTANCE: "true"
      DATABASE_SAVE_DATA_NEW_MESSAGE: "false"
      DATABASE_SAVE_MESSAGE_UPDATE: "true"
      DATABASE_SAVE_DATA_CONTACTS: "false"
      DATABASE_SAVE_DATA_CHATS: "false"

      CACHE_LOCAL_ENABLED: "false"
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://redis:6379/0
      CACHE_REDIS_PREFIX_KEY: evolution:
      CACHE_REDIS_SAVE_INSTANCES: "true"

      DEL_INSTANCE: "false"
      QRCODE_LIMIT: 30
      LOG_LEVEL: ERROR,WARN,INFO
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - evolution_instances:/evolution/instances

  caddy:
    image: caddy:2-alpine
    container_name: evolution_caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - evolution-api

volumes:
  evolution_pgdata:
  evolution_redis:
  evolution_instances:
  caddy_data:
  caddy_config:
EOF

echo "=================================================================="
echo " 5/5 — A iniciar Evolution API + PostgreSQL + Redis + Caddy HTTPS..."
echo "=================================================================="
docker compose pull
docker compose up -d

echo ""
echo "=================================================================="
echo " ✅ EVOLUTION API INSTALADA COM SUCESSO NA ORACLE CLOUD!"
echo "=================================================================="
echo ""
echo " Cole estes dados em Gestão de Academia -> Configurações (/configuracoes):"
echo ""
echo "   Modo WhatsApp:      Produção (Evolution API)"
echo "   URL da API (HTTPS): ${SERVER_URL}"
echo "   (Alternativa HTTP): http://${IP_PUBLICO}:8080"
echo "   Chave API (APIKey): ${EVOLUTION_API_KEY}"
echo "   Nome da Instância:  academia-principal"
echo ""
echo " IMPORTANTE: No painel da Oracle Cloud (VCN -> Security Lists -> Ingress Rules),"
echo " confirme que abriu as portas TCP: 80, 443 e 8080 para 0.0.0.0/0."
echo "=================================================================="
