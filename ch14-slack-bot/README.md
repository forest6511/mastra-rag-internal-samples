# 第14章 Slack から聞く: 社内ボット

社員が Slack でボットにメンションして質問すると、先に「調べています」と返し、少しあとに出典付きの答えをスレッドに返すボットを作ります。Slack のユーザーを権限のグループに置き換え、社外の人がいるチャンネルでは答えず、質問ログを残します。Socket Mode を使うので、公開の URL は要りません。

## この章で要るもの

- 第4章の DB と、5つのサービスの資料
- OpenAI の API キー
- Slack のアプリのトークン（`xapp-`。Socket Mode の接続に使う）。Slack は無料のプランで動きます
- 費用: OpenAI の API で、質問1回あたり約1円

## この章で使うファイル

- `src/slack-bot.ts` — Socket Mode でメンションを受け取るボット（`npm run bot`）
- `src/slack/handle.ts` — 「調べています」を先に返し、答えをスレッドに書く。社外の人がいるチャンネルでは答えない
- `src/slack/mrkdwn.ts` — 答えを Slack の書式に直し、長い答えを分ける
- `src/slack/question-log.ts` — 質問ログを `logs/` に残す（`logs/` は git に入れない。社員の質問を含むため）
- `slack-users.yml` — Slack のユーザーと、`users.yml` の利用者の対応
- `src/answer-as.ts` — 利用者の権限で答える

## 始める前に

DB は、第4章の `ch04-setup` で起動したものを使います（[ルートの README](../README.md#db-について)）。止めている場合は、`ch04-setup` で `docker compose up -d` を打ちます。

```bash
cd ../ch14-slack-bot
npm ci --ignore-scripts
cp ../ch13-abstain/.env .env
```

書籍の「Socket Mode で動かす」の節に沿って、Slack のアプリで Socket Mode を有効にし、アプリのトークンを作って `.env` の `SLACK_APP_TOKEN` に入れます。メンションのイベント（`app_mention`）を購読します。

`slack-users.yml` に書いてあるのは、本書のワークスペースのユーザー ID だけです。**載っていない人には何も見せない作りなので、書き換えないとボットは資料を1件も材料にしません。** 自分の Slack のプロフィールの「メンバー ID をコピー」で ID を取り、`U0CDYS9H280` をその ID に書き換えます（`kobayashi` の権限で答えます）。

## 手順

```bash
npm test     # Slack につながずに、ボットの振る舞いを確かめる
npm run bot  # Slack につなぐ（Ctrl+C で止める）
```

ボットを招いたチャンネルで、ボットにメンションして質問します。

## 確かめ方

- メンションすると、先に「調べています」が返り、続けてスレッドに出典付きの答えが返る
- Slack コネクトなど社外の人がいるチャンネルでは答えない
- `logs/` に質問ログが残る
- 書籍に載せた答えの例は `out/ito-reply.txt`

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。Slack につながずに、ボットの振る舞い（調べていますの返事・権限・社外のチャンネル・書式）を確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

ボットは Ctrl+C で止めます。`logs/` の質問ログは、試し終わったら削除します。Slack のアプリは、本書を読み終えるとき（第4章の後片付け）に削除します。

次の章: [第15章 Claude と ChatGPT から聞く: MCP](../ch15-mcp/)
