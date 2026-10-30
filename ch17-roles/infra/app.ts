import * as cdk from "aws-cdk-lib";
import { RagStack } from "./rag-stack.js";

// #region app
// npx cdk synth -c budgetEmail=… -c budgetUsd=… -c alertChannel=…
// 予算のアラートの宛先・月の予算・知らせる先のチャンネル・秘密でない
// 設定値は、-c で渡す（無ければ止まる）
const app = new cdk.App();
const ctx = (key: string, fallback?: string) => {
  const v = app.node.tryGetContext(key) ?? fallback;
  // 予算のアラートの宛先などを付け忘れたまま、デプロイさせない
  if (v === undefined) throw new Error(`-c ${key}=… を付けてください`);
  return String(v);
};
new RagStack(app, "KanadeRag", {
  budgetEmail: ctx("budgetEmail"),
  monthlyBudgetUsd: Number(ctx("budgetUsd")),
  botCount: Number(ctx("botCount", "0")),
  alertChannel: ctx("alertChannel"),
  settings: {
    ...{ ATL_SITE: ctx("atlSite", ""), ATL_EMAIL: ctx("atlEmail", "") },
    ...{
      GH_ORG: ctx("ghOrg", ""),
      SLACK_WORKSPACE: ctx("slackWorkspace", ""),
    },
    NOTION_ROOT_PAGE: ctx("notionRootPage", ""),
  },
  env: { region: "ap-northeast-1" },
});
// #endregion
