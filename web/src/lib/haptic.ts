// タップしたときの触覚の反応(短い振動)。対応していない端末(iPhone の Safari など)では何もしない。
// ms は長さ(ミリ秒)、または「振動・休み・振動…」の並び
export function buzz(ms: number | number[] = 20): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    // 振動できない環境では何もしない
  }
}
