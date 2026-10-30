import * as cdk from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export interface RagStackProps extends cdk.StackProps {
  budgetEmail: string; // 予算のアラートを送るメールアドレス
  monthlyBudgetUsd: number; // 月の予算（ドル）
  settings: Record<string, string>; // ATL_SITE など秘密でない設定値
}

export class RagStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RagStackProps) {
    super(scope, id, props);

    // #region network
    // NAT ゲートウェイは置かない（常に料金がかかるため）。コンテナは
    // 公開のサブネットに公開 IP 付きで置き、外（OpenAI・Slack・各
    // サービスの API）へ直接出る。DB は外とつながらないサブネットに置く
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "db", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });
    const appSg = new ec2.SecurityGroup(this, "AppSg", { vpc });
    // #endregion

    // #region database
    // Aurora Serverless v2（PostgreSQL 17.11）。最小 0 ACU にすると、
    // 接続が無い時間が続くと一時停止し、その間はインスタンスの料金が
    // かからない。pgvector 0.8.2 と pg_bigm 1.2 が使える版
    const db = new rds.DatabaseCluster(this, "Db", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.of("17.11", "17"),
      }),
      writer: rds.ClusterInstance.serverlessV2("writer"),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      serverlessV2AutoPauseDuration: cdk.Duration.minutes(10),
      credentials: rds.Credentials.fromGeneratedSecret("rag"),
      defaultDatabaseName: "rag",
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      // 本書は試すための構成なので、cdk destroy でスナップショットを
      // 残さずに消す（残すとストレージの料金がかかり続ける）
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    db.connections.allowDefaultPortFrom(appSg);
    // #endregion

    // #region secrets
    // API のキーとトークンは Secrets Manager に置く。値はデプロイの後に
    // 入れる（CDK のコードにもテンプレートにも書かない）
    const appSecret = new sm.Secret(this, "AppSecret", {
      description: "OpenAI・Slack・各サービスのキーとトークン",
    });
    const fromApp = (key: string) =>
      ecs.Secret.fromSecretsManager(appSecret, key);
    const secrets = {
      ...{ OPENAI_API_KEY: fromApp("OPENAI_API_KEY") },
      ...{ SLACK_TOKEN: fromApp("SLACK_TOKEN") },
      ...{ SLACK_APP_TOKEN: fromApp("SLACK_APP_TOKEN") },
      ...{ ATL_TOKEN: fromApp("ATL_TOKEN") },
      ...{ GH_RAG_TOKEN: fromApp("GH_RAG_TOKEN") },
      ...{ NOTION_TOKEN: fromApp("NOTION_TOKEN") },
      PGPASSWORD: ecs.Secret.fromSecretsManager(db.secret!, "password"),
    };
    // #endregion

    // #region task
    // ボットと取り込みは、同じコンテナのイメージを使う（Dockerfile）
    const image = ecs.ContainerImage.fromAsset(".");
    const environment = {
      ...props.settings,
      PGHOST: db.clusterEndpoint.hostname,
      ...{ PGUSER: "rag", PGDATABASE: "rag" },
    };
    const logGroup = new logs.LogGroup(this, "Logs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const taskDef = (id: string, command: string[]) => {
      const t = new ecs.FargateTaskDefinition(this, id, {
        cpu: 256,
        memoryLimitMiB: 512,
      });
      t.addContainer("app", {
        ...{ image, command, environment, secrets },
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: id, logGroup }),
      });
      return t;
    };
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });
    // #endregion

    // #region bot
    // Slack ボット: Socket Mode なので、外から届く URL もロード
    // バランサーも要らない。常に1つだけ動かす
    new ecs.FargateService(this, "Bot", {
      cluster,
      taskDefinition: taskDef("BotTask", [
        "npx",
        "tsx",
        "src/slack-bot.ts",
      ]),
      desiredCount: 1,
      // 入れ替えるときは、新しいタスクが動いてから古いタスクを止める
      // （その間は2つが接続するが、イベントはどちらか一方にだけ届く）。
      // 新しいタスクが起動できなければ、前の版に戻す
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [appSg],
    });
    // #endregion

    // #region ingest
    // 取り込み: 毎日 3:00（日本時間。UTC では 18:00）に差分同期を回す。
    // 回すたびに Aurora が再開するので、回数は少なめにする
    new events.Rule(this, "IngestSchedule", {
      schedule: events.Schedule.cron({ minute: "0", hour: "18" }),
      targets: [
        new targets.EcsTask({
          cluster,
          taskDefinition: taskDef("IngestTask", [
            ...["npx", "tsx", "src/sync-cli.ts"],
          ]),
          assignPublicIp: true,
          subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
          securityGroups: [appSg],
        }),
      ],
    });
    // #endregion

    // #region budget
    // 予算のアラート: 月の実際の額が予算の 80% を超えたらメールを送る
    new budgets.CfnBudget(this, "Budget", {
      budget: {
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: "USD" },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
          },
          subscribers: [
            { subscriptionType: "EMAIL", address: props.budgetEmail },
          ],
        },
      ],
    });
    // #endregion

    new cdk.CfnOutput(this, "AppSecretName", {
      value: appSecret.secretName,
    });
  }
}
