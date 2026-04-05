#!/bin/bash
# EC2 t4g.small 초기 세팅 (Amazon Linux 2023 ARM)
set -euo pipefail

echo "=== Docker 설치 ==="
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ec2-user

echo "=== Docker Compose 설치 ==="
COMPOSE_VERSION="v2.29.1"
sudo curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-aarch64" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

echo "=== 디렉토리 구조 ==="
mkdir -p ~/fashion-ai-infra/config

echo "=== 완료 ==="
echo "다음 단계:"
echo "1. ~/fashion-ai-infra/에 docker-compose.yml, config/ 복사"
echo "2. ~/fashion-ai-infra/.env 생성"
echo "3. docker-compose up -d"
echo "4. curl http://localhost:4000/health 확인"
