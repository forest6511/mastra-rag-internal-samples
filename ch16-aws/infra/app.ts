import * as cdk from "aws-cdk-lib";
import { RagStack } from "./rag-stack.js";

// #region app
// npx cdk synth -c budgetEmail=you@example.com -c atlSite=https://…
// 予算のアラートの宛先・月の予算・秘密でない設定値は、-c で渡す
const app = new cdk.App();
const ctx = (key: string, fallback = "") =>
  String(app.node.tryGetContext(key) ?? fallback);
new RagStack(app, "KanadeRag", {
  budgetEmail: ctx("budgetEmail", "you@example.com"),
  monthlyBudgetUsd: Number(ctx("budgetUsd", "30")),
  settings: {
    ...{ ATL_SITE: ctx("atlSite"), ATL_EMAIL: ctx("atlEmail") },
    ...{ GH_ORG: ctx("ghOrg"), SLACK_WORKSPACE: ctx("slackWorkspace") },
    NOTION_ROOT_PAGE: ctx("notionRootPage"),
  },
  env: { region: "ap-northeast-1" },
});
// #endregion
