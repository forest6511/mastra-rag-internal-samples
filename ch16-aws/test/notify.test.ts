import { afterEach, describe, expect, it, vi } from "vitest";
import { notifySlack } from "../src/notify.js";
import { isBotThread } from "../src/sources/slack.js";

// #region notify-test
// fetch を差し替えて、Slack に送る中身だけを確かめる
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// #endregion

// #region notify-cases
describe("取り込みの失敗の通知", () => {
  it("トークンとチャンネルがあれば Slack に送る", async () => {
    vi.stubEnv("SLACK_TOKEN", "xoxb-test");
    vi.stubEnv("ALERT_CHANNEL", "C0000000000");
    const fetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await notifySlack("取り込みで失敗");
    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(JSON.parse(String(init.body))).toEqual({
      channel: "C0000000000",
      text: "取り込みで失敗",
    });
  });

  it("チャンネルが無ければ何もしない（手元で動かすとき）", async () => {
    vi.stubEnv("SLACK_TOKEN", "xoxb-test");
    vi.stubEnv("ALERT_CHANNEL", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await notifySlack("取り込みで失敗");
    expect(fetch).not.toHaveBeenCalled();
  });
});
// #endregion

// #region skip-test
// 通知先のチャンネルは、取り込みの資料にしない（記録した応答で確かめる）
describe("通知先のチャンネル", () => {
  it("取り込みから外す", async () => {
    vi.stubEnv("OFFLINE", "1");
    const { FETCHERS } = await import("../src/fetch-all.js");
    const all = await FETCHERS.slack();
    const dev = "slack:C0CD805EPM4:";
    expect(all.some((d) => d.id.startsWith(dev))).toBe(true);
    vi.stubEnv("ALERT_CHANNEL", "C0CD805EPM4"); // #dev を通知先にする
    const skipped = await FETCHERS.slack();
    expect(skipped.some((d) => d.id.startsWith(dev))).toBe(false);
  });
});
// #endregion

// #region bot-thread-test
describe("ボットへの質問のスレッド", () => {
  it("ボットへのメンションで始まるスレッドは資料にしない", () => {
    const q = "<@U0BOT> 監査ログをCSVで出せますか？";
    expect(isBotThread(q, "U0BOT")).toBe(true);
    expect(
      isBotThread("監査ログの件、KAN-10 にまとめました", "U0BOT"),
    ).toBe(false);
    expect(isBotThread(q, "")).toBe(false); // 記録で動かすとき
  });
});
// #endregion
