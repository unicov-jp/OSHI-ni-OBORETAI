// タップしたときの触覚の反応(短い振動)。対応していない端末(iPhone の Safari など)では何もしない。
export function buzz(ms = 10): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    // 振動できない環境では何もしない
  }
}
