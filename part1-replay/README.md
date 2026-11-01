# 第1部 まず使ってみる（第1〜3章）

本書で作る社内 RAG の完成品を、記録した応答で動かします。架空の会社カナデループの社員が「障害の振り返りの下書きを作って」「セキュリティのチェックシートに答えて」と頼むと、Confluence・Jira・Notion・Slack・GitHub の資料を探して、出典の番号付きで答えが返ります。

- 第1章 社内の「どこに書いてあるか分からない」を、出典付きの答えに変える
- 第2章 RAG のしくみを、RAG なしと比べて理解する
- 第3章 既製品で足りる会社、自前が要る会社（この章はコードを使いません）

## この章で要るもの

- Node.js 22.12 以上（[Node.js の公式サイト](https://nodejs.org/ja/download) から入れます）
- git（無い場合は、GitHub のこのリポジトリの画面の「Code」→「Download ZIP」で取ってきても構いません）
- 費用: なし。アカウントも API キーも Docker も要りません

コマンドは、macOS ではターミナルで打ちます。Windows では WSL2 などの bash の環境で打ってください（`$(cat …)` の書き方は PowerShell では動きません）。

本書と同じ質問には、記録した答えをそのまま返します。OpenAI の API キーを入れると、記録に無い質問にも答えます（そのときだけ、1問 約 $0.005 以下の料金がかかります）。

## この章で使うファイル

- `src/ask.ts` — 質問を受け取り、資料を探して答える入口（`npm run ask`）
- `src/show-doc.ts` — 出典の資料の本文を表示する（`npm run show-doc`）
- `src/sources/` — 5つのサービスから資料を取り込むコード。この章では `records/` から読みます
- `records/` — 5つのサービスの API の応答・埋め込み・答えの記録
- `out/question-*.txt` — 書籍で使う質問。`out/answer-*.txt` は書籍に載せた答え
- `canonical.yml` — どの資料を正とするか（第8章で説明します）

## 手順

```bash
git clone https://github.com/forest6511/mastra-rag-internal-samples.git
cd mastra-rag-internal-samples/part1-replay
npm ci --ignore-scripts
```

第1章の3つの成果物を出します。

```bash
# セキュリティのチェックシートの回答案
npm run ask -- "$(cat out/question-Q04.txt)"

# 障害の振り返りの下書き
npm run ask -- "$(cat out/question-Q01.txt)"

# 引き継ぎのメモ
npm run ask -- "$(cat out/question-Q16.txt)"
```

答えの `[1]` `[2]` は出典の番号です。最初に並ぶ一覧の資料の ID を渡すと、その資料の本文を読めます。

```bash
npm run show-doc -- "confluence:622593"
```

資料に書かれていないことを聞くと、無いと答えます（第1章「資料に見当たらないとき」）。

```bash
npm run ask -- "$(cat out/question-Q07.txt)"
```

第2章では、資料を渡さずに答えさせ（RAG なし）、比べます。

```bash
npm run ask -- "$(cat out/question-Q01.txt)" --no-rag
npm run ask -- "$(cat out/question-Q04.txt)" --no-rag
npm run ask -- "$(cat out/question-Q04.txt)"
```

ほかにも、書籍で使う質問が `out/` にあります（書籍 第1章「使ってみる」）。

```bash
ls out/question-*.txt
npm run ask -- "$(cat out/question-weekly.txt)"
```

## 自分の質問をする

記録に無い質問をすると、「この質問は記録に無いため、キー無しでは答えられません」と表示されます。OpenAI の API キーを `.env` に書くと、答えるようになります。

```bash
echo "OPENAI_API_KEY=sk-..." > .env
npm run ask -- "決済GW のタイムアウトは何ミリ秒が正しい？"
```

資料は、キーがあっても記録したもの（カナデループの資料）を使います。

## 確かめ方

- `npm run ask` の答えが、`out/answer-*.txt` と同じ内容になる（同じ番号の質問の答え）
- `--no-rag` を付けると、社内の固有の事実（タイムアウトの値・ログの保管年数など）が答えられなくなる
- `npm test` が通る（キーも費用も使いません）

## 後片付け

手元にサンプルを取ってきただけです。不要になったら、`mastra-rag-internal-samples` のディレクトリを削除します。`.env` に API キーを書いた場合は、`.env` も削除します。

次の章: [第4章 開発環境と架空の会社カナデループを用意する](../ch04-setup/)
