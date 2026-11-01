# 社内情報を一元化するRAGの構築と運用 — サンプルコード

書籍『社内情報を一元化するRAGの構築と運用 Mastraとpgvectorで実現するConfluence・SlackのAI検索と業務活用』のサンプルコードです。

架空の会社「カナデループ」の Confluence・Jira・Notion・Slack・GitHub にある資料を取り込み、社員が Slack・Claude・ChatGPT から質問すると、出典（元の資料の URL）付きで答える社内 RAG を作ります。言語は TypeScript（Mastra）、データベースは PostgreSQL（pgvector・pg_bigm）です。

> **本書および本リポジトリは、Mastra・Atlassian・Notion・Slack・GitHub・OpenAI・Anthropic・Amazon Web Services とは無関係の非公式なものです。**

## 料金について

> [!CAUTION]
> **第5章以降のコードは OpenAI の API を呼び、第16章は AWS（Aurora Serverless v2・Fargate）にリソースを作ります。どちらも料金が発生します。**
>
> - 第1〜4章は費用がかかりません（第4章で作るアカウントも、すべて無料のプランで足ります）
> - 第5〜15章は OpenAI の API の料金がかかります。1問答えるのに約 $0.005（約1円）です。評価（第11〜13章）を自分で回すと、1回 約 $3 かかります
> - 第16章の AWS は、料金表の単価からの見積もりで月 約 $30 です。データベースが一時停止しないと月 約 $67〜$229 になります。**章末の `npx cdk destroy` で必ず削除し、Cost Explorer で課金が止まったことを確かめてください**
>
> 各章の README と書籍の各章の冒頭に、その章の費用の目安を書いています。

詳細は [DISCLAIMER.md](DISCLAIMER.md) を参照してください。

## 目的別の始め方

読む人の目的によって、用意するものが変わります。アカウントやキーが無くても、本書と同じ結果を手元で確かめられます。

### RAG で何ができるかを、まず見たい（導入を判断する人も）

第1部（第1〜3章）の [`part1-replay/`](part1-replay/) を動かします。Node.js だけで動き、アカウント・API キー・Docker・費用のどれも要りません。社内の資料から、障害の振り返りの下書き・セキュリティのチェックシートの回答案・引き継ぎのメモが、出典付きで返ってくるところを見られます。

```bash
git clone https://github.com/forest6511/mastra-rag-internal-samples.git
cd mastra-rag-internal-samples/part1-replay
npm ci --ignore-scripts
npm run ask -- "$(cat out/question-Q04.txt)"
```

### 作り方を、アカウントを作らずに追いたい

各章のディレクトリには、5つのサービスの API の応答・埋め込み・答えを記録したファイル（`records/`）と、書籍に載せた実行結果（`out/`）が入っています。各章で `npm test` を回すと、記録だけを使って取り込み・検索・答えまでを通します。アカウントもキーも Docker も要らず、費用もかかりません。コードを読みながら、`out/` の実行結果と見比べて進められます。

### 自分の手で、5つのサービスから取り込んで作りたい

第4章の手順で、Atlassian（Jira・Confluence）・Notion・Slack・GitHub の無料のアカウントを作り、カナデループの資料を入れます。OpenAI の API キーも用意します。そのあと第5章から順に進みます。

> [!NOTE]
> Slack の無料のプランでは、直近90日より古い投稿が見られなくなります。カナデループの Slack の資料は 2026年8月〜10月の日付です。読む時期によっては Slack の資料が取り込めないので、そのときは記録した応答（`records/`）で進めてください（書籍 第4章）。

## 動作環境

本書の手順は、次の環境と版で確かめています（2026年10月、macOS・Apple シリコン）。

- Node.js 22.22.2（22.12 以上で動きます）、TypeScript 6.0.3
- Docker（`docker compose` が使えれば、Docker Desktop でもほかの実装でも構いません。第4章以降）
- Mastra（`@mastra/core`）1.80.0、`@mastra/mcp` 2.6.0
- PostgreSQL 17.11、pgvector 0.8.2、pg_bigm 1.2（Aurora PostgreSQL 17.11 と同じ版。DB のイメージは各章の `docker/` で作ります）
- OpenAI の `gpt-5.4-mini-2026-03-17`（答え）と `text-embedding-3-small`（埋め込み）。採点には `gpt-5.5` を使います（第11章）
- GitHub CLI（`gh`。第4章で GitHub に資料を入れるときだけ）
- AWS CLI と AWS CDK（第16章でデプロイするときだけ。CDK は各章の `package.json` に入っています）
- `zip`（第4章で Slack の資料を作るときだけ）、`openssl`（第15章で MCP のトークンを作るときだけ）
- cloudflared（第15章で Claude・ChatGPT からつなぐときだけ）

コマンドは、macOS ではターミナルで打ちます。Windows では WSL2 などの bash の環境で打ってください（`$(cat …)` などの書き方は PowerShell では動きません）。

依存パッケージは版を完全に固定し、`package-lock.json` を同梱しています。**インストールは必ず `npm ci --ignore-scripts` で行ってください。** 2026年6月に `@mastra/*` のパッケージを狙った攻撃があったため、インストール時のスクリプトを実行しない形にしています（書籍 第4章）。

## 章の一覧

各章のディレクトリは独立していて、ディレクトリごとに `npm ci --ignore-scripts` してから使います。コマンドは、その章のディレクトリで打ちます。前の章から移るときは `cd ../ch05-minimal-rag` のように移ります。前の章のコードに、その章の変更を足したものが入っています。各ディレクトリの README に、その章で使うファイル・手順・確かめ方・後片付けをまとめています。

**第1部 まず使ってみる**（費用なし・アカウントもキーも不要）

- [`part1-replay/`](part1-replay/) — 第1〜3章（第1章 社内の「どこに書いてあるか分からない」を、出典付きの答えに変える／第2章 RAG のしくみを、RAG なしと比べて理解する／第3章 既製品で足りる会社、自前が要る会社）。完成品を記録した応答で動かす

**第2部 作る**

- [`ch04-setup/`](ch04-setup/) — 第4章 開発環境と架空の会社カナデループを用意する（DB の起動と、5つのサービスへの資料の投入）
- [`ch05-minimal-rag/`](ch05-minimal-rag/) — 第5章 最小の RAG を作る: 新人の『デプロイ手順は？』に答える（Confluence だけ）
- [`ch06-github/`](ch06-github/) — 第6章 複数の資料をまたぐ: GitHub を足して手順の古さを正す
- [`ch07-jira-slack/`](ch07-jira-slack/) — 第7章 Jira と Slack を取り込む: 障害の振り返りの下書きを作る
- [`ch08-notion/`](ch08-notion/) — 第8章 Notion を取り込み、どの資料を正とするか決める: チェックシートの回答案
- [`ch09-sync/`](ch09-sync/) — 第9章 毎日変わる資料に追いつく: 差分同期と削除の反映
- [`ch10-permissions/`](ch10-permissions/) — 第10章 見せてはいけない資料を守る: 権限と RLS
- [`ch11-eval/`](ch11-eval/) — 第11章 答えが合っているかを数字で確かめる: 評価セット
- [`ch12-hybrid-search/`](ch12-hybrid-search/) — 第12章 検索を改善する: 日本語の全文検索・ハイブリッド・並べ替え
- [`ch13-abstain/`](ch13-abstain/) — 第13章 答えてはいけない質問に正しく振る舞う
- [`ch14-slack-bot/`](ch14-slack-bot/) — 第14章 Slack から聞く: 社内ボット（Socket Mode）
- [`ch15-mcp/`](ch15-mcp/) — 第15章 Claude と ChatGPT から聞く: MCP
- [`ch16-aws/`](ch16-aws/) — 第16章 社内の全員に使わせる: AWS で動かす・費用・後片付け（AWS CDK）

**第3部 業務で使う**

- [`ch17-roles/`](ch17-roles/) — 第17章 役割別の使い方と成果物（新人・開発・PM・営業・サポート・管理職の依頼文）
- [`ch18-adoption/`](ch18-adoption/) — 第18章 導入を決める: 稟議の1ページ・規約・自社データへの置き換え（稟議のひな形と情シスに渡すチェックリスト）

## 各章のディレクトリの中身

章によって増えますが、共通する中身は次のとおりです。

- `src/` — 取り込み・検索・答えのコード（TypeScript）。`src/sources/` に5つのサービスごとの取り込みがあります
- `records/` — 5つのサービスの API の応答・埋め込み・答え・採点を記録したファイル。テストと `OFFLINE=1` を付けた実行は、ここから読みます
- `out/` — 書籍に載せた実行結果。自分の画面と見比べるときに使います
- `test/` — キー無しで回るテスト。DB には PGlite（Node.js の中で動く PostgreSQL）を使うので、Docker も要りません
- `compose.yaml`・`docker/` — PostgreSQL 17 に pgvector と pg_bigm を入れた DB
- `.env.example` — その章で使うトークンとキーの一覧。`.env` にコピーして値を入れます（`.env` は git に入れません）
- `acl.yml`・`users.yml`（第10章〜） — 資料の置き場所ごとに見てよいグループと、利用者とグループの対応
- `canonical.yml`（第8章〜） — どの資料を正とするか（正本）の指定
- `eval/`（第11章〜） — 評価セットの質問・期待する資料・評価の結果（`eval/runs/`）

## DB について

第5章以降の DB は、第4章の `ch04-setup` で `docker compose up -d --build` したものを、そのまま使います。DB は1つだけで、章を進めても作り直しません。

第5章以降のディレクトリの `compose.yaml` には、`name: ch04-setup` を書いています。そのため、どの章のディレクトリで `docker compose exec db …` を打っても、第4章で起動した DB に届きます。書籍のコマンドは、その章のディレクトリでそのまま打てます。

```bash
# 第6章のディレクトリから、第4章で起動した DB のテーブルを見る
cd ../ch06-github
docker compose exec db psql -U rag -d rag -c '\dt'
```

DB を止めたいときは `docker compose stop`、消すときは `docker compose down -v` です（どの章のディレクトリで打っても同じ DB が対象です。`-v` を付けると DB のデータも消えます）。

## 検査

各章のディレクトリで、次を実行します。キーもアカウントも DB も使わず、費用もかかりません。

```bash
npm ci --ignore-scripts
npx tsc --noEmit && npx prettier --check . && npx eslint . && npm test
```

## 利用上の注意

> [!WARNING]
> **このコードは学習用です。本番環境にそのまま使わないでください。**
> 本書の構成は、手順を追いやすくするために単純化しています。実運用では次の検討が必要です。
>
> - DB のバックアップと復旧、冗長化
> - 監視とアラート（第16章は取り込みの失敗の通知と予算のアラートだけです）
> - ネットワークの分離とアクセス制御の強化
> - 質問ログ・API に送るデータの扱い（第18章のチェックリスト）

各サービスのトークンと OpenAI の API キーは `.env` にだけ書き、コミットしないでください。検証のために作ったアカウントと AWS のリソースは、読み終えたら削除します（書籍 第18章「検証用のアカウントを消す」）。

## ライセンス

[MIT License](LICENSE)

ライセンスはコードの利用許諾です。損害の免責については [DISCLAIMER.md](DISCLAIMER.md) を参照してください。
