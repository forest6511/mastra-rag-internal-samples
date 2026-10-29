// #region chunk
// 資料をおよそ size 字のチャンクに分ける。段落（空行）と、
// 箇条書き・番号付きの行の頭で区切り、区切りをまたいでは切らない。
// 1つの段落が size を超えるときは、その段落だけで1チャンクにする
export function chunk(text: string, size = 500): string[] {
  const paras = text.split(/\n{2,}|\n(?=[#・\-*\d]+[.、 ）)]?\s)/);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && (cur + "\n" + p).length > size) {
      out.push(cur.trim());
      cur = "";
    }
    cur += (cur ? "\n" : "") + p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length > 0 ? out : [text];
}
// #endregion
