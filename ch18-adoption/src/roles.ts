import { answerAs } from "./answer-as.js";
import { pool } from "./db.js";
import { offlineDb } from "./offline-db.js";
import { offline } from "./record.js";
import { loadRoles } from "./role-list.js";
import { writeLog } from "./slack/question-log.js";

// #region roles
// npm run roles               roles.yml の依頼文を全部聞く
// npm run roles -- 営業       指定した役割の依頼文だけ聞く
// 依頼文ごとに、その人の権限（users.yml）で答える（第13章の作り）
const only = process.argv[2];
const db = offline() ? await offlineDb() : undefined;
for (const r of loadRoles().filter((r) => !only || r.role === only)) {
  const { text, hits } = await answerAs(r.user, r.ask, db);
  console.log(`■ ${r.role}（${r.user}）: ${r.ask}`);
  console.log(`  材料: ${hits.map((h) => h.title).join(" / ")}`);
  console.log(text + "\n");
  // Slack ボットと同じ質問ログに残す（利用状況を見る例のため）
  const docIds = hits.map((h) => h.docId);
  writeLog({
    at: new Date().toISOString(),
    user: r.user,
    channel: "roles",
    question: r.ask,
    docIds,
  });
}
await (db ? db.close() : pool.end());
// #endregion
