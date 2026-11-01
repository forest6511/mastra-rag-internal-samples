# 第4章 開発環境と架空の会社カナデループを用意する

第5章以降で使う DB（PostgreSQL 17・pgvector・pg_bigm）を Docker で立ち上げ、架空の会社カナデループの資料25件を、Confluence・Jira・Notion・Slack・GitHub に入れます。

> [!TIP]
> **アカウントを作らずに先へ進めます。** 第5章以降の各ディレクトリには、5つのサービスの API の応答を記録したファイル（`records/`）が入っています。その場合は、この README の「1. DB を立ち上げる」と「2. TypeScript のプロジェクトを用意する」だけを行い、[第5章](../ch05-minimal-rag/) に進んでください。

## この章で要るもの

- Node.js 22.12 以上、Docker（`docker compose`）
- GitHub CLI（`gh`。GitHub に資料を入れるときだけ。`gh auth login` でログインしておく）
- `zip` コマンド（Slack のエクスポート形式の ZIP を作るときだけ）
- 無料のアカウント: Atlassian（Jira と Confluence）・Notion・Slack・GitHub の4つ。どれも無料のプランで足ります
- 費用: なし（OpenAI の API はこの章では使いません）

## この章で使うファイル

- `compose.yaml`・`docker/Dockerfile`・`docker/init.sql` — PostgreSQL 17 に pgvector 0.8.2 と pg_bigm 1.2 を入れた DB。ポートは 55432
- `seed/world.yml` — カナデループの世界設定（会社・社員10人・出来事の年表）
- `seed/corpus/` — 資料25件（1件1ファイルの JSON）。わざと入れた古い版・書き写しの誤り・社内用語を含みます
- `src/seed-load.ts`・`src/seed/` — 5つのサービスに資料を入れるスクリプト（`npm run seed -- <サービス>`）
- `src/check-services.ts` — 資料がそろったかを、題名で突き合わせて確かめる（`npm run check:services`。読むだけで何も書き込みません）
- `.env.example` — この章で作るトークンの一覧

## 手順

### 1. DB を立ち上げる

```bash
git clone https://github.com/forest6511/mastra-rag-internal-samples.git
cd mastra-rag-internal-samples/ch04-setup
docker compose up -d --build
docker compose exec db psql -U rag -d rag -c '\dx'
```

`vector` の 0.8.2 と `pg_bigm` の 1.2 が並べば準備ができています。**この DB は、第5章以降もこのまま使います。** 第5章以降のディレクトリで `docker compose exec db …` を打つときは `-p ch04-setup` を付けます（[ルートの README](../README.md#db-について)）。

### 2. TypeScript のプロジェクトを用意する

```bash
npm ci --ignore-scripts
npx tsc --noEmit && npx prettier --check . && npx eslint . && npx vitest run
```

### 3. 5つのサービスのトークンを作る

```bash
cp .env.example .env
```

書籍の「5つのサービスのトークンを作る」の節に沿って、`.env` に値を入れます。

- **Atlassian**: `ATL_SITE`（`https://<サイト名>.atlassian.net`）・`ATL_EMAIL`・`ATL_TOKEN`（スコープの無い API トークン）。先に、Jira のプロジェクト（キー `KAN`）と Confluence のスペース（キー `KANADE`）を画面で作ります
- **Notion**: `NOTION_TOKEN`（コネクションのトークン）・`NOTION_ROOT_PAGE`（コネクションを接続した親ページ）
- **Slack**: `SLACK_TOKEN`（ボットのトークン `xoxb-`）
- **GitHub**: `GH_ORG`（Organization の名前）・`GH_RAG_TOKEN`（fine-grained token）

### 4. 資料を入れる

```bash
npm run seed -- confluence   # Confluence に API で入れる
npm run seed -- notion       # Notion に API で入れる
npm run seed -- jira-csv     # seed/out/jira.csv を作る
npm run seed -- slack-zip    # seed/out/slack-export.zip を作る
```

Jira と Slack は、作ったファイルを画面で取り込みます（手順は書籍の「Jira は CSV で入れる」「Slack はエクスポート形式の ZIP で入れる」の節）。

- `seed/out/jira.csv` を、Jira のプロジェクト `KAN` の CSV のインポートで取り込む
- `seed/out/slack-export.zip` を、Slack のワークスペースの管理画面のデータのインポートで取り込む

ZIP を取り込んでチャンネルができてから、ボットをチャンネルに参加させます。ボットは参加していないチャンネルを読めません。続けて GitHub に入れます。

```bash
npm run seed -- slack-join   # ボットをチャンネルに参加させる（ZIP を取り込んだ後）
npm run seed -- github       # GitHub に gh で入れる
```

> [!NOTE]
> Slack の無料のプランでは、直近90日より古い投稿が見られなくなります。カナデループの Slack の資料は 2026年8月〜10月の日付で、ほかのサービスの資料と結び付いているため、ずらせません。見えないときは、第5章以降の記録した応答で進めてください。
>
> Atlassian の無料のプランは、長い間だれもログインしないとサイトが停止されることがあります。検証の期間中は、ときどきブラウザーでログインしてください。

## 確かめ方

```bash
npm run check:services
```

```text
Confluence: 6/6
Jira: 5/5
Notion: 3/3
Slack: 6/6
GitHub の README: 3/3
GitHub の PR: 2/2
```

左が見つかった件数、右が資料の件数です。足りないときは、見つからない資料の題名がその下に出ます。Confluence・Notion・GitHub は `seed/out/loaded.json` からその資料の行を消して、同じサービスの投入を回し直します。Jira と Slack は全体を取り込み直さず（重複して入るため）、足りない課題やチャンネルだけを足します。

## 後片付け

**第5章以降でも使うので、本書を読み終えるまで削除しないでください。** 読み終えたら、次を削除します。

- DB: `docker compose down -v`（`-v` で、DB のデータを入れたボリュームも消す）
- Atlassian: API トークンを取り消し、サイトの管理画面からサイトを削除する
- Notion: コネクションを削除し、カナデループのページを削除する
- Slack: アプリを削除し、ワークスペースを削除する
- GitHub: fine-grained token を削除し、Organization を削除する
- 手元の `.env` を削除する

次の章: [第5章 最小の RAG を作る](../ch05-minimal-rag/)
