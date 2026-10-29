import { ofKind, type SeedDoc } from "../corpus.js";
import { channelIds, slackApi } from "../slack.js";

// #region slack-join
// 取り込みで作られたチャンネルに、アプリ（ボット）を
// 参加させる。
// ボットは参加していないチャンネルを読めない（not_in_channel）
export async function joinSlackChannels(docs: SeedDoc[]): Promise<void> {
  const ids = await channelIds();
  const names = new Set(
    ofKind(docs, "slack-thread").map((d) => String(d.plan.channel)),
  );
  for (const name of names) {
    const id = ids.get(name);
    if (!id) {
      throw new Error(`#${name} がありません。ZIP を取り込みます`);
    }
    await slackApi("conversations.join", { channel: id });
    console.log(`#${name} に参加しました`);
  }
}
// #endregion
