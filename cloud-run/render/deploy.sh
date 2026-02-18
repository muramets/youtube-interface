#!/bin/bash
# ===========================================================================
#  Render Worker — Deployment Script
#
#  Этот скрипт делает 3 вещи:
#  1. Собирает Docker image из Dockerfile
#  2. Загружает его в Google Artifact Registry
#  3. Создаёт (или обновляет) Cloud Run Job с правильными настройками
#
#  Перед запуском:
#  1. Установи Google Cloud CLI: https://cloud.google.com/sdk/docs/install
#  2. Авторизуйся: gcloud auth login
#  3. Установи Docker Desktop: https://www.docker.com/products/docker-desktop/
#
#  Запуск:  ./deploy.sh
# ===========================================================================

set -euo pipefail  # Остановиться при любой ошибке

# ─── Настройки (можно менять) ───────────────────────────────────────────

PROJECT_ID="mytube-46104"
REGION="us-central1"
JOB_NAME="render-worker"
IMAGE_NAME="render-worker"
REPO_NAME="docker-repo"                    # Artifact Registry repository name
CLOUD_TASKS_QUEUE="render-queue"

# Cloud Run Job ресурсы
CPU="8"                                    # 8 vCPU для параллельного ffmpeg
MEMORY="8Gi"                               # 8 GB RAM (ffmpeg + 100 MB upload buffer)
TIMEOUT="86400"                            # 24 часа максимум
MAX_RETRIES="2"                            # Retry при ошибках (не при отмене)

# ─── Цвета для вывода ──────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Render Worker — Deploy to Cloud Run${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ─── Шаг 0: Проверка зависимостей ──────────────────────────────────────

echo -e "${YELLOW}[0/5]${NC} Проверка зависимостей..."

if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI не установлен."
    echo "   Скачай: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен."
    echo "   Скачай: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

echo -e "  ✅ gcloud и Docker установлены"

# ─── Шаг 1: Установка проекта ──────────────────────────────────────────

echo ""
echo -e "${YELLOW}[1/5]${NC} Устанавливаю активный проект: ${PROJECT_ID}..."
gcloud config set project "$PROJECT_ID"

# Включаем нужные API (если ещё не включены)
echo "  Включаю API (если нужно)..."
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudtasks.googleapis.com \
    --quiet

echo -e "  ✅ Проект настроен"

# ─── Шаг 2: Создание Artifact Registry (если не существует) ────────────

echo ""
echo -e "${YELLOW}[2/5]${NC} Проверяю Artifact Registry..."

if ! gcloud artifacts repositories describe "$REPO_NAME" \
    --location="$REGION" &> /dev/null 2>&1; then
    echo "  Создаю repository: ${REPO_NAME}..."
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --description="Docker images for the project"
    echo -e "  ✅ Repository создан"
else
    echo -e "  ✅ Repository уже существует"
fi

# Настраиваем Docker для работы с Artifact Registry
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ─── Шаг 3: Сборка и загрузка Docker image ────────────────────────────

echo ""
echo -e "${YELLOW}[3/5]${NC} Собираю Docker image..."

FULL_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"

# Собираем image (из текущей директории, где лежит Dockerfile)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
docker build --platform linux/amd64 -t "$FULL_IMAGE" "$SCRIPT_DIR"

echo ""
echo -e "${YELLOW}[3.5/5]${NC} Загружаю image в Artifact Registry..."
docker push "$FULL_IMAGE"

echo -e "  ✅ Image загружен: ${FULL_IMAGE}"

# ─── Шаг 4: Создание / обновление Cloud Run Job ───────────────────────

echo ""
echo -e "${YELLOW}[4/5]${NC} Создаю/обновляю Cloud Run Job: ${JOB_NAME}..."

# Non-secret config vars (safe to set as plain env vars)
ENV_VARS="FIREBASE_STORAGE_BUCKET=${PROJECT_ID}.firebasestorage.app"

# R2 secrets from Secret Manager (injected securely at container start)
SECRETS="R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest"
SECRETS="${SECRETS},R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest"
SECRETS="${SECRETS},R2_ENDPOINT=R2_ENDPOINT:latest"
SECRETS="${SECRETS},R2_BUCKET_NAME=R2_BUCKET_NAME:latest"

# Проверяем, существует ли Job
if gcloud run jobs describe "$JOB_NAME" --region="$REGION" &> /dev/null 2>&1; then
    echo "  Job существует — обновляю..."
    gcloud run jobs update "$JOB_NAME" \
        --image="$FULL_IMAGE" \
        --region="$REGION" \
        --cpu="$CPU" \
        --memory="$MEMORY" \
        --task-timeout="${TIMEOUT}s" \
        --max-retries="$MAX_RETRIES" \
        --set-env-vars="$ENV_VARS" \
        --set-secrets="$SECRETS" \
        --quiet
else
    echo "  Job не существует — создаю..."
    gcloud run jobs create "$JOB_NAME" \
        --image="$FULL_IMAGE" \
        --region="$REGION" \
        --cpu="$CPU" \
        --memory="$MEMORY" \
        --task-timeout="${TIMEOUT}s" \
        --max-retries="$MAX_RETRIES" \
        --set-env-vars="$ENV_VARS" \
        --set-secrets="$SECRETS" \
        --quiet
fi

echo -e "  ✅ Cloud Run Job готов (${CPU} vCPU, ${MEMORY} RAM, timeout ${TIMEOUT}s)"

# ─── Шаг 5: Создание Cloud Tasks Queue (если не существует) ───────────

echo ""
echo -e "${YELLOW}[5/5]${NC} Проверяю Cloud Tasks Queue..."

if ! gcloud tasks queues describe "$CLOUD_TASKS_QUEUE" \
    --location="$REGION" &> /dev/null 2>&1; then
    echo "  Создаю queue: ${CLOUD_TASKS_QUEUE}..."
    gcloud tasks queues create "$CLOUD_TASKS_QUEUE" \
        --location="$REGION" \
        --max-concurrent-dispatches=1 \
        --max-attempts=3 \
        --max-retry-duration=86400s
    echo -e "  ✅ Queue создана"
else
    echo -e "  ✅ Queue уже существует"
fi

# ─── Готово ─────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Деплой завершён!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  📋 Что было сделано:"
echo "     • Docker image собран и загружен"
echo "     • Cloud Run Job: ${JOB_NAME} (${CPU} CPU, ${MEMORY} RAM)"
echo "     • Cloud Tasks Queue: ${CLOUD_TASKS_QUEUE}"
echo ""
echo "  🔗 Посмотреть в Google Cloud Console:"
echo "     https://console.cloud.google.com/run/jobs?project=${PROJECT_ID}"
echo ""
echo "  💡 Не забудь задеплоить Firebase Functions:"
echo "     cd ../../ && npx firebase deploy --only functions"
echo ""
