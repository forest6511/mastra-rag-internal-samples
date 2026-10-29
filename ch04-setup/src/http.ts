// #region request
// HTTP の失敗を、URL と応答の先頭つきの例外にする（原因を追いやすくする）
export async function request<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${url} HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}
// #endregion
