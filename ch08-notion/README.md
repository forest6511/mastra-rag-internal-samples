# 第8章 Notion を取り込み、どの資料を正とするか決める: チェックシートの回答案

営業の中村さんが「ログって何年残してる？1年で合ってますか？」と聞くと、Notion に書き写された古い値（1年）ではなく、正本のセキュリティ方針の値で答え、食い違いを「要確認」と書くようにします。最後に、お客様のセキュリティのチェックシート10問の回答案を作ります。

## この章で要るもの

- 第4章の DB と、5つのサービスの資料
- OpenAI の API キー
- 費用: OpenAI の API で数円（Notion の資料の埋め込みと、答え4回分）

## この章で使うファイル

- `src/sources/notion.ts` — Notion のページを、親ページから子ページをたどって取る
- `canonical.yml` — どの資料を正とするか（正本）を、話題ごとに書く
- `src/canonical.ts` — 正本を答えの材料に必ず入れる
- `src/agent.ts` — 正本を優先し、食い違いを「要確認」と書かせる指示（`--no-canonical` で正本を使わない）
- `out/checksheet-question.txt` — チェックシートの10問

## 始める前に

DB は、第4章の `ch04-setup` で起動したものを使います（[ルートの README](../README.md#db-について)）。止めている場合は、`ch04-setup` で `docker compose up -d` を打ちます。

```bash
cd ../ch08-notion
npm ci --ignore-scripts
cp ../ch07-jira-slack/.env .env
```

`.env` に、第7章の値に加えて `NOTION_TOKEN` と `NOTION_ROOT_PAGE` を書き足します（`.env.example` には `SLACK_WORKSPACE` の行が無いので、第7章の `.env` から写します）。テーブルを作り直してから取り込みます。

```bash
docker compose -p ch04-setup exec db psql -U rag -d rag \
  -c 'DROP TABLE IF EXISTS chunks, documents'
npm run ingest
```

## 手順

```bash
# 正本を使わないと、新しい日付の Notion の古い値（1年）で答える
npm run ask -- "商談先にログって何年残してるか聞かれたんですけど、1年で合ってますか？Notionで見た気がして" --by-doc --no-canonical

# 正本を使うと、セキュリティ方針の値で答え、食い違いを要確認と書く
npm run ask -- "商談先にログって何年残してるか聞かれたんですけど、1年で合ってますか？Notionで見た気がして" --by-doc

# チェックシートの回答案
npm run ask -- "$(cat out/checksheet-question.txt)" --by-doc
```

続けて、資料に無い予定を聞いてみます（書籍「使ってみる」）。

```bash
npm run ask -- "監査ログのエクスポートはいつできるようになりますか？" --by-doc
```

## 確かめ方

- `--no-canonical` を付けると「1年」と答え、付けないと正本の年数で答えて Notion の記述を要確認と書く
- チェックシートの回答案は、そのまま顧客に出さず、出典を開いて人が確かめる（書籍「そのまま顧客に出してよいか」）
- 書籍に載せた結果は `out/log-years-before.txt`・`out/log-years.txt`・`out/checksheet.txt`

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。記録した応答（`records/`）だけで、Notion の取り込みと、正本を材料に入れることを確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

この章で作ったのは、DB の行と `canonical.yml` だけです。第9章では資料の更新と削除を扱うので、続けて進むときはそのままにします。

次の章: [第9章 毎日変わる資料に追いつく: 差分同期と削除の反映](../ch09-sync/)
