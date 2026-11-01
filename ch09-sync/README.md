# 第9章 毎日変わる資料に追いつく: 差分同期と削除の反映

社内の資料は毎日、書き足され、直され、消されます。5つのサービスの全件の一覧と索引を突き合わせ、追加・変更・削除を索引に反映する同期を作ります。Confluence で「予約 API 仕様」のページを消すと、次の同期で答えの材料から消えることを確かめます。

## この章で要るもの

- 第4章の DB と、5つのサービスの資料
- OpenAI の API キー
- 費用: OpenAI の API で1円未満（質問2回分。資料の本文が変わらなければ、埋め込みを作り直しません）

## この章で使うファイル

- `src/sync.ts`・`src/sync-cli.ts` — 1つのサービスずつ、全件の一覧と索引を突き合わせて同期する（`npm run sync`、`npm run sync -- <サービス>`）。元が0件のときと、取得に失敗したサービスは消さない
- `src/verify-sync.ts` — 索引と元のサービスを突き合わせ、残っている・足りない資料を出す（`npm run verify`）
- `src/fetch-all.ts` — 5つのサービスの全件を取る
- `records-after/` — ページを消した後の API の応答の記録（テストで削除の反映を確かめるのに使う）

## 始める前に

DB は、第4章の `ch04-setup` で起動したものを使います（[ルートの README](../README.md#db-について)）。止めている場合は、`ch04-setup` で `docker compose up -d` を打ちます。

```bash
cd ../ch09-sync
npm ci --ignore-scripts
cp ../ch08-notion/.env .env
```

## 手順

```bash
# 5つのサービスを同期する（2回目は何も変わらない）
npm run sync
npm run sync
```

Confluence の画面で「予約 API 仕様」のページを削除してから、同期し、質問します。

```bash
npm run sync
npm run ask -- "$(cat out/question-api.txt)" --by-doc
```

取得に失敗したサービスは触らないことを確かめます。

```bash
NOTION_TOKEN=invalid npm run sync -- notion
echo $?
docker compose exec db psql -U rag -d rag \
  -c 'SELECT source, synced_at, fetched, failed_at, error FROM sync_state'
```

索引と元のサービスを突き合わせます。

```bash
npm run verify
```

## 確かめ方

- ページを消した後の同期で、削除の件数が表示され、答えの材料から「予約 API 仕様」が消える
- `NOTION_TOKEN=invalid` の同期は「取得に失敗。索引はそのまま」と表示し、Notion の資料を消さない（`sync_state` に失敗が記録される）
- `npm run verify` で、missing（取り込み漏れ）・extra（削除の反映漏れ）・stale（更新の反映漏れ）・empty（チャンクが無い）がすべて0になり、`ok` が `true` になる
- 書籍に載せた結果は `out/sync-again.txt`・`out/sync-after-delete.txt`・`out/api-before.txt`・`out/api-after.txt`・`out/sync-notion-failure.txt`・`out/verify-before.txt`・`out/verify-after.txt`

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。記録した応答（`records/` と、ページを消した後の `records-after/`）だけで、同期と削除の反映を確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

消した Confluence のページは、第10章以降では消えたまま進みます。DB は第10章でそのまま使います。

次の章: [第10章 見せてはいけない資料を守る: 権限と RLS](../ch10-permissions/)
