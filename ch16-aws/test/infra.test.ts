import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { RagStack } from "../infra/rag-stack.js";

// #region setup
// AWS につながずに、CDK が作るテンプレート（CloudFormation）を確かめる
let t: Template;
beforeAll(() => {
  const app = new cdk.App();
  const stack = new RagStack(app, "Test", {
    budgetEmail: "you@example.com",
    monthlyBudgetUsd: 30,
    settings: { ATL_SITE: "https://example.atlassian.net" },
  });
  t = Template.fromStack(stack);
}, 120_000);
// #endregion

// #region db-test
describe("Aurora", () => {
  it("PostgreSQL 17.11・最小 0 ACU で一時停止できる", () => {
    t.hasResourceProperties("AWS::RDS::DBCluster", {
      Engine: "aurora-postgresql",
      EngineVersion: "17.11",
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0,
        MaxCapacity: 2,
        SecondsUntilAutoPause: 600,
      },
      StorageEncrypted: true,
    });
  });

  it("cdk destroy でスナップショットを残さずに消える", () => {
    t.hasResource("AWS::RDS::DBCluster", {
      DeletionPolicy: "Delete",
    });
  });
});
// #endregion

// #region cost-test
describe("費用と安全", () => {
  it("NAT ゲートウェイを作らない", () => {
    t.resourceCountIs("AWS::EC2::NatGateway", 0);
  });

  it("ボットは1つだけ動かす", () => {
    t.hasResourceProperties("AWS::ECS::Service", { DesiredCount: 1 });
  });

  it("キーはテンプレートに書かず、Secrets Manager から渡す", () => {
    const defs = t.findResources("AWS::ECS::TaskDefinition");
    const json = JSON.stringify(defs);
    expect(json).toContain('"Name":"OPENAI_API_KEY"');
    expect(json).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it("予算の 80% を超えたらメールを送る", () => {
    t.hasResourceProperties("AWS::Budgets::Budget", {
      NotificationsWithSubscribers: [
        Match.objectLike({
          Notification: Match.objectLike({ Threshold: 80 }),
        }),
      ],
    });
  });
});
// #endregion
