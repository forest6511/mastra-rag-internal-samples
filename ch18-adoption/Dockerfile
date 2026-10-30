# 第16章: ボットと取り込みを動かすコンテナ（Fargate で使う）
FROM node:22.22.2-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Aurora の証明書を確かめるための、Amazon RDS の CA の束
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-ca.pem
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca.pem PGSSLMODE=verify-full
CMD ["npx", "tsx", "src/slack-bot.ts"]
