# 第15章 Claude と ChatGPT から聞く: MCP

社員が普段使っている Claude・ChatGPT から、社内の資料を検索できるようにします。`search` と `fetch` の2つのツールを持つ MCP サーバーを作り、利用者ごとのトークンで権限を分け、Claude のカスタムコネクタと ChatGPT に追加します。

## この章で要るもの

- 第4章の DB と、5つのサービスの資料
- OpenAI の API キー（質問の埋め込みに使う。答えを書くのは Claude・ChatGPT のモデル）
- Claude・ChatGPT から試すときは、カスタムコネクタを追加できるプランと、cloudflared（手元のサーバーを外から届くようにするトンネル）
- 費用: 手元で試す範囲では、質問の埋め込みの費用だけ（1回 0.01円未満）。Claude・ChatGPT の利用料は、それぞれのプランに含まれます

## この章で使うファイル

- `src/mcp-server.ts`・`src/mcp/server.ts` — MCP サーバー（`npm run mcp`。`http://localhost:8787/mcp`）
- `src/mcp/tools.ts` — `search` と `fetch` の2つのツール。`fetch` でも権限を調べる
- `src/mcp/auth.ts` — 利用者ごとのトークンを、ヘッダーかパスで受け取る
- `mcp-users.yml` — トークンと利用者の対応
- `src/mcp-selftest.ts` — 手元で新旧2つの接続方法を試す（`npm run mcp-selftest`）

## 始める前に

DB は、第4章の `ch04-setup` で起動したものを使います（[ルートの README](../README.md#db-について)）。止めている場合は、`ch04-setup` で `docker compose up -d` を打ちます。

```bash
cd ../ch15-mcp
npm ci --ignore-scripts
cp ../ch14-slack-bot/.env .env
openssl rand -hex 24
```

表示された値を、`.env` の `MCP_TOKEN_KOBAYASHI` に入れます。もう一度 `openssl rand -hex 24` を打ち、`MCP_TOKEN_NAKAMURA` にも入れます。

## 手順

```bash
npm test
npm run mcp   # 別のターミナルで動かしたままにする
```

もう1つのターミナルで、手元から新旧2つの接続方法を試します。

```bash
npm run mcp-selftest -- "障害があったとき、お客様へのご連絡っていつまでにする決まりでしたっけ？"
```

Claude・ChatGPT からつなぐときは、トンネルで外から届くようにします。表示されたホスト名（`….trycloudflare.com`）を `.env` の `MCP_ALLOWED_HOSTS` に入れ、`npm run mcp` を起動し直します。入れないと、トンネル越しのリクエストは 403 になります。

```bash
cloudflared tunnel --url http://localhost:8787
```

書籍の手順で、次の URL を追加します。

- Claude のカスタムコネクタ: `https://<トンネルのホスト名>/mcp`。トークンは、リクエストヘッダーに `Authorization: Bearer <トークン>` で入れる
- ChatGPT のカスタム MCP サーバー: `https://<トンネルのホスト名>/mcp/<トークン>`（ヘッダーを入れる欄が無いため、パスに入れる）。この URL はトークンを含むので、人に見せない

## 確かめ方

- `npm run mcp-selftest` で、2つの接続方法のどちらでも `search` と `fetch` が答える（`out/mcp-selftest.txt`）
- 利用者のトークンを変えると、見える資料が変わる
- Claude・ChatGPT から聞いた答えに、出典の URL が付く

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。MCP サーバーを手元で立て、search と fetch の権限を確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

トンネルと MCP サーバーは、起動したターミナルで Ctrl+C を入力して止めます。Claude と ChatGPT に追加したコネクタは、トンネルを止めるとつながらなくなるので、設定から削除します。`.env` の MCP のトークンは、試し終わったら、新しい値に入れ替えます。

次の章: [第16章 社内の全員に使わせる: AWS で動かす・費用・後片付け](../ch16-aws/)
