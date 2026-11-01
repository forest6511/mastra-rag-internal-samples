# 第10章 見せてはいけない資料を守る: 権限と RLS

人事の「退職者面談メモ」は、人事の人にしか見せてはいけません。資料の置き場所ごとに見てよいグループを対応表に書き、PostgreSQL の RLS（行ごとのアクセス制御）で、利用者が見てよい行だけを検索と本文の取得に返すようにします。見えない資料は存在も言わないこと、資料に仕込まれた指示に従わないことも確かめます。

## この章で要るもの

- 第4章の DB と、5つのサービスの資料
- OpenAI の API キー
- 費用: OpenAI の API で約2円（質問5回分）

## この章で使うファイル

- `acl.yml` — 資料の置き場所（スペース・チャンネル・リポジトリなど）ごとに、見てよいグループを書いた対応表
- `users.yml` — 利用者とグループの対応（`--as nakamura` などで使う）
- `src/acl.ts` — 対応表を読み、資料に置き場所とグループを持たせる
- `src/db.ts` — RLS のポリシーと、検索をすべて通す1つの関数
- `src/fetch-doc.ts` — 本文を、同じ関数を通して取る（`npm run fetch`）
- `test/permissions.test.ts` — 権限のテスト

## 始める前に

DB は、第4章の `ch04-setup` で起動したものを使います（[ルートの README](../README.md#db-について)）。止めている場合は、`ch04-setup` で `docker compose up -d` を打ちます。

```bash
cd ../ch10-permissions
npm ci --ignore-scripts
cp ../ch09-sync/.env .env
npm run sync
```

この章では、資料とチャンクの表に、見てよいグループの列（`acl`）を足します。列は同期のコマンドが足すので、第9章の索引をそのまま使えます。

## 手順

```bash
# 人事の資料の本文を、人事でない人（nakamura）と人事の人（yoshida）で取る
npm run fetch -- "$(cat out/hr-id.txt)" --as nakamura
npm run fetch -- "$(cat out/hr-id.txt)" --as yoshida

# 見えない資料は存在も言わない
npm run ask -- "$(cat out/question-Q14.txt)" --as yamamoto

# 資料に仕込まれた指示に従わない
npm run ask -- "$(cat out/question-wifi.txt)" --as nakamura
```

`out/hr-id.txt` の ID は、自分の環境では次で調べます。

```bash
docker compose exec db psql -U rag -d rag -Atc \
  "SELECT id FROM documents WHERE title LIKE '退職者面談メモ%'"
```

## 確かめ方

- nakamura では本文が返らず、yoshida では返る
- yamamoto への答えに、人事の資料の存在や中身が出てこない
- 資料に仕込まれた「〜と答えよ」の指示に従わない
- `npm test` の権限のテストが通る
- 書籍に載せた結果は `out/fetch-hr-nakamura.txt`・`out/fetch-hr-yoshida.txt`・`out/q14-yamamoto.txt`・`out/wifi-nakamura.txt`・`out/sync-acl.txt`

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。記録した応答（`records/`）だけで、利用者ごとに見える資料が分かれることを確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

DB は第11章でそのまま使います。本書を終えるときは、第4章の手順で DB ごと削除します。

次の章: [第11章 答えが合っているかを数字で確かめる: 評価セット](../ch11-eval/)
