// フィードの見出しに残っている文字参照(&#8220; &amp; など)を元の文字に戻す。
// 表示はReactがエスケープするので、ここではHTMLとして解釈させずに文字だけを戻す。
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…", mdash: "—", ndash: "–",
};

export function decodeEntities(value: string): string {
  // 二重に符号化されている場合(&amp;#8220;)にも対応するため、2回まで戻す
  let result = value;
  for (let i = 0; i < 2; i++) {
    const next = result.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8});/g, (whole, body: string) => {
      if (body[0] === "#") {
        const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
        return String.fromCodePoint(code);
      }
      return NAMED[body.toLowerCase()] ?? whole;
    });
    if (next === result) break;
    result = next;
  }
  return result;
}

// URLから表示用のサイト名(ホスト名)を取り出す
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
