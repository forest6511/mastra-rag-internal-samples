# 第6章 複数の資料をまたぐ: GitHub を足して手順の古さを正す

第5章の RAG は、古い Confluence の手順書だけを見て答えていました。GitHub の README・Issue・PR を足し、資料に日付を持たせて、新しい手順（GitHub Actions）を優先して答えるようにします。同じ名前の別物（予約 API の仕様）の区別も見ます。

## この章で要るもの

- 第4章の DB と、Confluence・GitHub の資料
- OpenAI の API キー
- 費用: OpenAI の API で数円（GitHub の資料の埋め込みと、質問4回分）

## この章で使うファイル

- `src/sources/github.ts` — GitHub の README・Issue・PR とコメントを取る。記録に個人のアカウント名を残さない
- `src/ingest.ts` — 資料に日付を持たせ、題名と本文のハッシュで、同じ資料を2回入れても重複しないようにする
- `src/agent.ts` — 新しい日付の資料を優先する指示（`--ch05` を付けると第5章の指示で答える）

## 始める前に

DB は、第4章の `ch04-setup` で起動したものを使います（[ルートの README](../README.md#db-について)）。止めている場合は、`ch04-setup` で `docker compose up -d` を打ちます。

```bash
cd ../ch06-github
npm ci --ignore-scripts
cp .env.example .env
```

`.env` に、第5章の値に加えて `GH_ORG` と `GH_RAG_TOKEN` を入れます。第5章のテーブルに列を足すので、テーブルを作り直します。

```bash
docker compose exec db psql -U rag -d rag \
  -c 'DROP TABLE IF EXISTS chunks, documents'
```

## 手順

```bash
npm run ingest

# 第5章の指示で答える（古い手順が混ざる）
npm run ask -- "デプロイ手順は？" --ch05

# 新しい日付を優先する指示で答える
npm run ask -- "デプロイ手順は？"

# 同じ名前の別物を区別する
npm run ask -- "予約APIの仕様ってどこにある？"
```

`RECORD=1` を付けて自分のサービスの応答を記録したときは、記録に自分の GitHub のアカウント名が残っていないかを確かめます（メールアドレスは記録のときに `user@example.com` に置き換わります）。

```bash
grep -rl '<自分の GitHub のアカウント名>' records/ || echo "見つかりません"
```

## 確かめ方

- `--ch05` を付けた答えと付けない答えで、デプロイの手順が変わる（付けないほうは GitHub Actions の手順を答える）
- `npm run ingest` を2回打っても、2回目は資料を入れ直さない
- 書籍に載せた結果は `out/ask-deploy-before.txt`・`out/ask-deploy.txt`・`out/ask-api.txt`・`out/ask-log.txt`

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。記録した応答（`records/`）だけで、Confluence と GitHub の取り込み・重複しないこと・日付の取り方を確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

DB の行は、第7章でそのまま使います。本書を終えるときは、第4章の手順で DB ごと削除します。

次の章: [第7章 Jira と Slack を取り込む: 障害の振り返りの下書きを作る](../ch07-jira-slack/)
