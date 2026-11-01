# 第13章 答えてはいけない質問に正しく振る舞う

資料に無いこと・資料どうしが食い違うこと・質問の対象が曖昧なこと・見せてはいけないことを聞かれたときに、もっともらしく答えず、「資料に無い」「要確認」「どの件ですか」と振る舞うようにします。答えの冒頭に確度を、末尾に確認先を書かせ、評価の期待も見直します。改善しても残る失敗も、数字ごと見せます。

## この章で要るもの

- 第4章の DB と、5つのサービスの資料
- OpenAI の API キー（評価を自分で回すときと、記録に無い質問をするとき）
- 費用: 評価を自分で回すと約 $3。記録した結果を集計するだけなら、費用はかかりません

## この章で使うファイル

- `events.yml` — 資料に持たせる出来事の名前（「決済GW のときの障害」がどの件かを決める）
- `src/clarify.ts` — 当てはまる出来事が複数あるときに、聞き返す
- `src/agent.ts` — 答えの冒頭に確度、末尾に確認先を書かせる指示
- `eval/expectations-ch13.yml` — 見直した評価の期待（`EXPECT` で渡す）
- `src/eval/behavior.ts` — 答えてはいけない質問への振る舞いを、作りごとに並べる（`npm run behavior`）
- `eval/runs/ch13*.jsonl` — 著者の評価の結果。`-reviewed` は人が見直した採点

## 始める前に

```bash
cd ../ch13-abstain
npm ci --ignore-scripts
cp ../ch12-hybrid-search/.env .env
```

評価を回すときと、記録に無い質問をするときは、DB が要ります。DB は、第4章の `ch04-setup` で起動したものを使います（[ルートの README](../README.md#db-について)）。止めている場合は、`ch04-setup` で `docker compose up -d` を打ちます。

## 手順

```bash
# 著者の結果で、答えてはいけない質問への振る舞いを比べる（費用なし）
npm run behavior -- ch12-hybrid ch13-ask ch13
npm run behavior -- ch12-hybrid-reviewed ch13-ask-reviewed ch13-reviewed

# 改善しても残る失敗
npm run ask -- "決済GWのときの障害、再発防止って終わってる？" --as kobayashi
```

第12章と第13章の作りで、同じ質問の答えを比べます（書籍「使ってみる」）。

```bash
cd ../ch12-hybrid-search
npm run ask -- "障害があったとき、お客様へのご連絡っていつまでにする決まりでしたっけ？" \
  --as nakamura
cd ../ch13-abstain
npm run ask -- "障害があったとき、お客様へのご連絡っていつまでにする決まりでしたっけ？" \
  --as nakamura
```

評価の期待を見直して採点し直すときは、`EXPECT` でファイルを渡します。答えは記録から返るので、採点し直す費用は Q13・Q14 の6回分だけです。

```bash
EXPECT=eval/expectations-ch13.yml npm run eval -- my-hybrid-reviewed hybrid
```

## 確かめ方

- `npm run behavior` の結果が `out/behavior-ch13.txt`・`out/behavior-ch13-reviewed.txt` と同じになる
- 第13章の作りでは、答えの冒頭に確度、末尾に確認先が付く（`out/q10-nakamura-ch12.txt` と `out/q10-nakamura.txt` を比べる）
- 改善しても残る失敗がある（`out/q12-kobayashi.txt`）。数字は `out/summary-ch13.txt`

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。記録した答えと採点だけで、答えてはいけない質問への振る舞いを確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

## 後片付け

DB は第14章でそのまま使います。

次の章: [第14章 Slack から聞く: 社内ボット](../ch14-slack-bot/)
