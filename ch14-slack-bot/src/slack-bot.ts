import bolt from "@slack/bolt";
import { answerAs } from "./answer-as.js";
import { need } from "./env.js";
import { handleMention } from "./slack/handle.js";
import { writeLog } from "./slack/question-log.js";

// #region app
// npm run bot
// Socket Mode: ボットから Slack へ WebSocket でつなぐので、外から
// 届く URL（公開のサーバー）が要らない。手元の PC で動かせる
const app = new bolt.App({
  token: need("SLACK_TOKEN"), // ボットのトークン（xoxb-）
  appToken: need("SLACK_APP_TOKEN"), // アプリのトークン（xapp-）
  socketMode: true,
});
// #endregion

// #region on-mention
// @kanade-rag へのメンション（app_mention）を受ける。Bolt は受け取った
// ことを Slack にすぐ返す（ack）ので、答えに時間がかかっても再送されない
app.event("app_mention", async ({ event, client }) => {
  await handleMention(
    { ...event, user: event.user ?? "" },
    {
      isShared: async (channel) => {
        const r = await client.conversations.info({ channel });
        return r.channel?.is_ext_shared === true;
      },
      // 出典の URL を展開すると、元の投稿のプレビューが長く並ぶので切る
      post: async (channel, thread_ts, text) => {
        await client.chat.postMessage({
          ...{ channel, thread_ts, text },
          ...{ unfurl_links: false, unfurl_media: false },
        });
      },
      answer: answerAs,
      log: writeLog,
    },
  );
});

await app.start();
console.log("Slack ボット: Socket Mode で接続しました");
// #endregion
