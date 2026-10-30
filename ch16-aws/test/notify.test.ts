import { afterEach, describe, expect, it, vi } from "vitest";
import { notifySlack } from "../src/notify.js";

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
