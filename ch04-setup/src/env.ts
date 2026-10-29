// #region need
// .env から値を読む。無ければ、どの名前が足りないかを言って止める
export function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} が .env にありません（.env.example を参照）`,
    );
  }
  return value;
}
// #endregion
