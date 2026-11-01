# 第5章 最小の RAG を作る: 新人の『デプロイ手順は？』に答える

新人の渡辺さんが「デプロイ手順は？」と聞くと、Confluence の手順書を探して、出典付きで答える最小の RAG を作ります。資料を共通の形にそろえ、約500字ずつのチャンクに分け、埋め込みを作って pgvector に入れ、Mastra の Agent で答えます。

## この章で要るもの

- 第4章の DB と、Confluence の資料（アカウントが無ければ、記録した応答で進めます）
- OpenAI の API キー（`OPENAI_API_KEY`）
- 費用: OpenAI の API で数円（取り込みの埋め込みと、質問2回分）

## この章で使うファイル

- `src/sources/confluence.ts` — Confluence のページを取り、共通の形（`src/doc.ts`）にそろえる
- `src/record.ts` — API の応答を `records/` に記録し、`OFFLINE=1` のときは記録から返す
- `src/chunk.ts` — 資料を約500字ずつのチャンクに分ける
- `src/embed.ts` — 埋め込みを作る。同じ文の埋め込みは `records/embeddings.jsonl` から使い、2回作らない
- `src/ingest.ts`・`src/ingest-cli.ts` — テーブルを作り、資料を DB に入れる（`npm run ingest`）
- `src/search.ts` — 意味の近いチャンクを上位6件探す
- `src/agent.ts`・`src/ask.ts` — Mastra の Agent で、出典の番号付きで答える（`npm run ask`）

## 始める前に

DB は、第4章の `ch04-setup` で起動したものを使います（[ルートの README](../README.md#db-について)）。止めている場合は、`ch04-setup` で `docker compose up -d` を打ちます。

```bash
cd ../ch05-minimal-rag
npm ci --ignore-scripts
cp .env.example .env
```

`.env` に、第4章の Atlassian の値（`ATL_SITE`・`ATL_EMAIL`・`ATL_TOKEN`）と `OPENAI_API_KEY` を入れます。

## 手順

```bash
npm run ingest
npm run ask -- "デプロイ手順は？"
```

続けて、別の質問もしてみます（書籍「使ってみる」）。

```bash
npm run ask -- "ログは何年保管する？"
```

アカウントもキーも無い場合は、`OFFLINE=1` を付けると、記録した応答で同じ結果になります。DB（第4章）は要りますが、アカウントとキーは要りません。`.env` は `.env.example` を写したままで構いません。記録にあるのは書籍と同じ質問だけです。

```bash
OFFLINE=1 npm run ingest
OFFLINE=1 npm run ask -- "デプロイ手順は？"
```

## 確かめ方

- `npm run ingest` で、資料ごとのチャンクの数が表示される（例: `デプロイ手順（本番環境）: 1 チャンク`）
- `npm run ask` の最初の行に、`デプロイ手順（本番環境）` が1位で並ぶ
- 答えは、踏み台サーバーに SSH して `./deploy.sh production` を打つ古い手順になる。この手順書は、2026年9月に GitHub Actions へ移ったのに更新されていません。第6章で GitHub を足して正します
- 書籍に載せた結果は `out/ask-deploy.txt`・`out/ask-log.txt`

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。記録した応答（`records/`）だけで、Confluence の取り込み・検索・答えまでを通します。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

この章では、第4章の DB にテーブルを作りました。第6章ではテーブルに列を足すので、第6章の手順でテーブルを作り直します。本書を終えるときは、第4章の手順で DB ごと削除します。

次の章: [第6章 複数の資料をまたぐ: GitHub を足して手順の古さを正す](../ch06-github/)
