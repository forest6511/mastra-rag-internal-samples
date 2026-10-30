import * as cdk from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export interface RagStackProps extends cdk.StackProps {
  budgetEmail: string; // 予算のアラートを送るメールアドレス
  monthlyBudgetUsd: number; // 月の予算（ドル）
  settings: Record<string, string>; // ATL_SITE など秘密でない設定値
  botCount: number; // ボットの数。キーを入れるまでは 0
  alertChannel: string; // 取り込みの失敗を知らせる Slack のチャンネル ID
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
    // API のキーとトークンは Secrets Manager に置く。作るときはキーの名前
    // だけの JSON（値は空）にし、デプロイの後に値を入れる（CDK のコードに
    // もテンプレートにも、キーの値は書かない）
    const keys = [
      ...["OPENAI_API_KEY", "SLACK_TOKEN", "SLACK_APP_TOKEN"],
      ...["ATL_TOKEN", "GH_RAG_TOKEN", "NOTION_TOKEN"],
      "SLACK_AUTH_HEADER", // "Bearer " + SLACK_TOKEN（失敗の通知に使う）
    ];
    const appSecret = new sm.Secret(this, "AppSecret", {
      description: "OpenAI・Slack・各サービスのキーとトークン",
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify(Object.fromEntries(keys.map((k) => [k, ""]))),
      ),
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
    // ボットと取り込みは、同じコンテナのイメージを使う（Dockerfile）。
    // Apple シリコンの Mac で作ると arm64 のイメージになるので、
    // イメージとタスクの CPU の種類を ARM64 にそろえる
    const image = ecs.ContainerImage.fromAsset(".", {
      platform: ecrAssets.Platform.LINUX_ARM64,
    });
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
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
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
    // バランサーも要らない。キーを入れるまでは 0 台（起動できないため）、
    // 入れたら -c botCount=1 でデプロイし直して1台にする
    const bot = new ecs.FargateService(this, "Bot", {
      cluster,
      taskDefinition: taskDef("BotTask", [
        "npx",
        "tsx",
        "src/slack-bot.ts",
      ]),
      desiredCount: props.botCount,
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
    const ingestTask = taskDef("IngestTask", [
      ...["npx", "tsx", "src/sync-cli.ts"],
    ]);
    new events.Rule(this, "IngestSchedule", {
      schedule: events.Schedule.cron({ minute: "0", hour: "18" }),
      targets: [
        new targets.EcsTask({
          cluster,
          taskDefinition: ingestTask,
          assignPublicIp: true,
          subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
          securityGroups: [appSg],
        }),
      ],
    });
    // #endregion

    // #region ingest-alert
    // 取り込みのタスクが終了コード 0 以外で止まったら、Slack の
    // chat.postMessage を EventBridge から呼んで知らせる（第9章の約束）
    const slackApi = new events.ApiDestination(this, "SlackApi", {
      endpoint: "https://slack.com/api/chat.postMessage",
      httpMethod: events.HttpMethod.POST,
      connection: new events.Connection(this, "SlackConn", {
        authorization: events.Authorization.apiKey(
          "Authorization",
          cdk.SecretValue.secretsManager(appSecret.secretArn, {
            jsonField: "SLACK_AUTH_HEADER",
          }),
        ),
      }),
    });
    new events.Rule(this, "IngestFailed", {
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Task State Change"],
        detail: {
          lastStatus: ["STOPPED"],
          taskDefinitionArn: [ingestTask.taskDefinitionArn],
          containers: { exitCode: [{ "anything-but": 0 }] },
        },
      },
      targets: [
        new targets.ApiDestination(slackApi, {
          event: events.RuleTargetInput.fromObject({
            channel: props.alertChannel,
            text: "取り込みが失敗しました（終了コード 0 以外）。CloudWatch Logs を確かめてください",
          }),
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

    // #region outputs
    // デプロイの後の手順（キーを入れる・取り込みを手で起動する）に使う値
    const out = (id: string, value: string) =>
      new cdk.CfnOutput(this, id, { value });
    out("AppSecretName", appSecret.secretName);
    out("ClusterName", cluster.clusterName);
    out("BotServiceName", bot.serviceName);
    out("IngestTaskDef", ingestTask.taskDefinitionArn);
    out("PublicSubnet", vpc.publicSubnets[0].subnetId);
    out("AppSecurityGroup", appSg.securityGroupId);
    // #endregion
  }
}
