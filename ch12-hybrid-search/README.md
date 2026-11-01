# 第12章 検索を改善する: 日本語の全文検索・ハイブリッド・並べ替え

「PGのタイムアウトって何msにしとくのが正解？」のように、社内用語や数字そのものを含む質問は、意味の検索だけでは外れます。pg_bigm の日本語の全文検索を足し、2つの検索を RRF でまとめ（ハイブリッド検索）、生成 AI で並べ替え（リランク）、改善のたびに評価で確かめます。

## この章で要るもの

- 第4章の DB と、5つのサービスの資料
- OpenAI の API キー（評価を自分で回すときと、記録に無い質問をするとき）
- 費用: 評価を2つの作りで回すと約 $6（採点に `gpt-5.5` を使う場合）。記録した結果を集計するだけなら、費用はかかりません

## この章で使うファイル

- `src/hybrid.ts` — 質問から語を取り出し、pg_bigm で言葉で探し、意味の検索と RRF でまとめる。`--rerank` で生成 AI による並べ替えを足す
- `src/terms-cli.ts` — 質問から取り出した語を表示する（`npm run terms`）
- `src/eval/by-question.ts` — 質問ごとに、改善が効いたか・効かなかったかを並べる（`npm run by-question`）
- `eval/runs/ch12-hybrid.jsonl`・`eval/runs/ch12-rerank.jsonl` — 著者の評価の結果

## 始める前に

```bash
cd ../ch12-hybrid-search
npm ci --ignore-scripts
cp ../ch11-eval/.env .env
npm run sync
```

`npm run sync` は、テーブルの定義を流してから同期します。この章のテーブルの定義には全文検索のインデックスを足したので、同期のときにインデックスができます。

## 手順

```bash
# 全文検索のインデックスが使われることを確かめる
docker compose -p ch04-setup exec db psql -U rag -d rag -c "SET enable_seqscan=off" \
  -c "EXPLAIN (COSTS OFF) SELECT id FROM chunks
      WHERE content LIKE '%タイムアウト%'"

# 質問から語を取り出す
npm run terms -- "PGのタイムアウトって何msにしとくのが正解？3000で合ってる？" \
  --as kobayashi

# 著者の評価の結果を集計する（費用なし）
npm run summary -- ch10 ch12-hybrid ch12-rerank
npm run by-question -- ch10 ch12-hybrid ch12-rerank
```

評価を自分で回すときは、次を打ちます。

```bash
npm run eval -- my-hybrid hybrid
npm run eval -- my-rerank rerank
npm run summary -- ch10 my-hybrid my-rerank
```

ハイブリッド検索と並べ替えで、同じ質問の答えを比べます（書籍「使ってみる」）。

```bash
npm run ask -- "PGのタイムアウトって何msにしとくのが正解？3000で合ってる？" \
  --as kobayashi
npm run ask -- "PGのタイムアウトって何msにしとくのが正解？3000で合ってる？" \
  --as kobayashi --rerank
```

## 確かめ方

- `EXPLAIN` の結果に `chunks_bigm` のインデックスが出る（`out/explain-bigm.txt`）
- `npm run summary -- ch10 ch12-hybrid ch12-rerank` の結果が `out/summary-ch12.txt` と同じになる
- 並べ替えで良くなる質問と、正解の資料が外れて悪くなる質問の両方がある（`out/by-question-ch12.txt`）。並べ替えは、評価で効く場合だけ付けます

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。記録した応答だけで、語の取り出しとハイブリッド検索を確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

全文検索のインデックスは、第13章以降でもそのまま使います。本書を終えるときは、第4章の手順で DB ごと削除します。

次の章: [第13章 答えてはいけない質問に正しく振る舞う](../ch13-abstain/)
