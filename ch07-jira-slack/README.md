# 第7章 Jira と Slack を取り込む: 障害の振り返りの下書きを作る

開発の小林さんが「明日の振り返り会用に、9/15 の決済が落ちた件の下書きを作って」と頼むと、Jira の課題と Slack の障害のスレッドから、検知から顧客への連絡までの時系列と再発防止を書いた下書きが返るようにします。Slack を投稿単位・スレッド単位で取り込んだときの違いと、資料ごとにまとめて上位を選ぶ方法を比べます。

## この章で要るもの

- 第4章の DB と、Confluence・GitHub・Jira・Slack の資料
- OpenAI の API キー
- 費用: OpenAI の API で数円（Jira と Slack の資料の埋め込みと、下書き3回分）

## この章で使うファイル

- `src/sources/jira.ts` — Jira の課題を取り、ADF（Jira の本文の形式）から文字を取り出す
- `src/sources/slack.ts` — Slack の投稿とスレッドを取り、時刻を日本時間にする
- `src/ingest-cli.ts` — `--posts` で投稿単位、付けなければスレッド単位で取り込む
- `src/search.ts` — `--by-doc` で、チャンクを資料ごとにまとめて上位を選ぶ

## 始める前に

DB は、第4章の `ch04-setup` で起動したものを使います（[ルートの README](../README.md#db-について)）。止めている場合は、`ch04-setup` で `docker compose up -d` を打ちます。

```bash
cd ../ch07-jira-slack
npm ci --ignore-scripts
cp .env.example .env
```

`.env` に、第6章の値に加えて `SLACK_TOKEN`（ボットのトークン）と `SLACK_WORKSPACE`（自分のワークスペースの名前。`https://<名前>.slack.com` の `<名前>`）を入れます。`SLACK_WORKSPACE` は、答えの出典の Slack の URL を作るのに使います。

## 手順

同じ依頼で、取り込み方と選び方を変えて3回比べます。

```bash
Q="明日の振り返り会用に、9/15の決済が落ちた件の下書き作ってほしい。検知から顧客への連絡まで時系列で、再発防止も入れて"

# 1. 投稿単位で取り込む
npm run ingest -- --posts
npm run ask -- "$Q"

# 2. スレッド単位で取り込む
npm run ingest
npm run ask -- "$Q"

# 3. 資料ごとにまとめて上位を選ぶ
npm run ask -- "$Q" --by-doc
```

続けて、別の質問もしてみます（書籍「使ってみる」）。

```bash
npm run ask -- "9/15 の障害の恒久対応の PR はどれ？いつマージした？" --by-doc
```

## 確かめ方

- 投稿単位では、障害スレッドの別々の投稿が上位を占め、検知の時刻・原因・顧客へのメールが抜ける（書籍では必須要点9点のうち2点）
- スレッド単位、さらに `--by-doc` にすると、Jira の課題や PR も材料に入り、必須要点が増える（書籍では `--by-doc` で7点）。残りの2点が入らない理由も、書籍で数字ごと見ます
- 書籍に載せた結果は `out/postmortem-posts.txt`・`out/postmortem-threads.txt`・`out/postmortem-by-doc.txt`

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。記録した応答（`records/`）だけで、Jira と Slack の取り込みと、資料ごとにまとめる検索を確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

DB の行は、第8章でテーブルを作り直すまで残します。本書を終えるときは、第4章の手順で DB ごと削除します。

次の章: [第8章 Notion を取り込み、どの資料を正とするか決める](../ch08-notion/)
