# 第16章 社内の全員に使わせる: AWS で動かす・費用・後片付け

第15章までの仕組みは、開発者の PC で動いています。PC を閉じると、Slack のボットも止まります。AWS CDK で、ボットと毎日の取り込みを AWS（Aurora Serverless v2・Fargate）に置き、社員がいつでも Slack から聞けるようにします。予算のアラートを付け、Cost Explorer で費用を確かめ、最後に `cdk destroy` で全部を消します。

> [!CAUTION]
> **デプロイすると、AWS の利用料金が発生します。** 料金表の単価からの見積もりで月 約 $30 です。Aurora が一時停止せずに 0.5 ACU で動き続けると月 約 $67、構成の最大（2 ACU）で動き続けると月 約 $229 になります。**試し終わったら、必ず「後片付け」の手順で削除してください。**

## この章で要るもの

- AWS のアカウントと AWS CLI（認証できる状態）。リージョンは東京（`ap-northeast-1`）で確かめています
- Docker（コンテナのイメージを作る）
- 第14章の Slack のボットと、5つのサービスのトークン、OpenAI の API キー
- 通知だけに使う Slack のチャンネル（本書では `#rag-alerts`）。資料のある既存のチャンネルは使わない
- 費用: 上のとおり。生成 AI の部分は1問 約 $0.005

## この章で使うファイル

- `infra/app.ts`・`infra/rag-stack.ts` — CDK の構成（VPC・Aurora・ECS・Secrets Manager・定時の取り込み・予算のアラート）
- `Dockerfile` — ボットと取り込みのコンテナ
- `src/notify.ts` — 取り込みの失敗を Slack に知らせる
- `test/infra.test.ts` — 費用に効く設定（最小 0 ACU・NAT ゲートウェイ無し・ボットは1つ）と、消し忘れを防ぐ設定（スナップショットを残さない）のテスト
- `out/cdk-synth.txt`・`out/cdk-resources.txt` — 書籍で作ったテンプレートとリソースの一覧

## 始める前に

```bash
cd ../ch16-aws
npm ci --ignore-scripts
cp ../ch15-mcp/.env .env
```

リージョンは `infra/app.ts` で東京（`ap-northeast-1`）に固定しています。AWS CLI の既定のリージョンが違っても、東京に作られます。

## 手順

デプロイの前に、テンプレートを作り、テストで確かめます。ここまでは AWS にリソースを作らず、費用もかかりません。

```bash
npm run synth
npm test
```

デプロイは、書籍の「デプロイする」の節に沿って、次の順で行います。

1. AWS CLI で、AWS のアカウントに認証する
2. `npx cdk bootstrap`（CDK がデプロイに使うリソースを、アカウントとリージョンごとに1回作る）
3. 下のコマンドでデプロイする（ボットは0台。予算は「これを超えたらおかしい」と気づくための上限として自分で決める）
4. 出力された秘密の名前（`AppSecretName`）の値を、AWS マネジメントコンソールで下の JSON の形にする（`…` に `.env` の値を入れる）
5. 3 と同じ `-c` をすべて付け、`-c botCount=1` を足して、もう一度 `npx cdk deploy` を実行し、ボットを1台にする
6. 取り込みのタスクを1回手で起動して、資料を Aurora に入れる

`-c` の値は `.env` から写します。`slackWorkspace` などを省くと空になり、答えの出典の URL が正しく作れません。

```bash
npx cdk deploy \
  -c budgetEmail=<メールアドレス> -c budgetUsd=<予算（ドル）> \
  -c alertChannel=<通知用のチャンネル ID> \
  -c atlSite=<ATL_SITE> -c atlEmail=<ATL_EMAIL> -c ghOrg=<GH_ORG> \
  -c slackWorkspace=<SLACK_WORKSPACE> -c notionRootPage=<NOTION_ROOT_PAGE>
```

```json
{
  "OPENAI_API_KEY": "…",
  "SLACK_TOKEN": "xoxb-…",
  "SLACK_APP_TOKEN": "xapp-…",
  "ATL_TOKEN": "…",
  "GH_RAG_TOKEN": "…",
  "NOTION_TOKEN": "…"
}
```

```bash
aws ecs run-task --cluster <ClusterName> --launch-type FARGATE \
  --task-definition <IngestTaskDef> \
  --network-configuration "awsvpcConfiguration={subnets=[<PublicSubnet>],securityGroups=[<AppSecurityGroup>],assignPublicIp=ENABLED}"
```

`<ClusterName>` などは、デプロイの出力の値に置き換えます。

## 確かめ方

- Slack でボットにメンションすると、AWS に置いたボットが答える
- 数日たってから、Cost Explorer で日ごとの費用を見る（日付範囲にデプロイした日から今日まで、粒度は「日別」、グループ化はサービス）

## 後片付け（クリーンアップ）

```bash
npx cdk destroy
```

`cdk destroy` は、このスタックで作ったリソースを全部消します。Aurora はスナップショットを残さずに消えます（`removalPolicy: DESTROY`）。翌日以降、Cost Explorer の日ごとの費用に、ECS・RDS・VPC（公開 IPv4）・Secrets Manager・CloudWatch の費用が出ていないことを確かめます（反映は1日ほど遅れます）。

`cdk bootstrap` で作ったスタック（CDKToolkit）と、デプロイのために作った認証情報（IAM ユーザーとアクセスキーなど）も、使い終えたら削除します（第18章「検証用のアカウントを消す」）。

## キー無しで確かめる

アカウントや API キーが無くても、この章のテストは回ります。AWS にリソースを作らずに、CDK のテンプレートの費用と安全の設定（最小 0 ACU・NAT ゲートウェイ無し・ボットは1つ・スナップショットを残さない）を確かめます。DB も費用も要りません。

```bash
npm test
```

書籍に載せた実行結果は `out/` にあります。

AWS に置いた構成を消した後も、`npm test` で第5章から第16章までの仕組みを確かめられます。

次の章: [第17章 役割別の使い方と成果物](../ch17-roles/)
