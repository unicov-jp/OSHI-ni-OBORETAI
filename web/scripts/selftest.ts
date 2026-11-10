// 取得まわりの自己診断。 実行: npm run selftest
// 外部への通信は行わない(遮断の判定と、フィードの解析だけを確かめる)。
import { parseFeedXml } from "@/lib/fetchers/rss";
import { isPublicAddress, safeFetchText } from "@/lib/fetchers/safe-fetch";
import { embedHandle, parseAccountUrl } from "@/lib/platforms";
import { recordsToLibrary } from "@/lib/records";
import { mediaFromPostEmbed, postCodesFromEmbed } from "@/lib/fetchers/instagram";
import { postsFromSyndication } from "@/lib/fetchers/x";
import { editableFrom, emptySns, mergeIntoRecord, toStoredSns } from "@/lib/oshi-record";
import { decodeEntities, hostOf } from "@/lib/text";
import { channelFromPage } from "@/lib/fetchers/youtube";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "NG  "} ${name}${ok ? "" : ` -> ${JSON.stringify(actual)} (期待 ${JSON.stringify(expected)})`}`);
}

async function blocked(url: string): Promise<boolean> {
  try {
    await safeFetchText(url);
    return false;
  } catch (error) {
    return (error as Error).constructor.name === "SafeFetchError";
  }
}

async function main() {
  // --- 到達してはいけないアドレスの判定 ---
  for (const address of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
  ]) {
    check(`非公開アドレスを拒否 ${address}`, isPublicAddress(address), false);
  }
  for (const address of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"]) {
    check(`公開アドレスを許可 ${address}`, isPublicAddress(address), true);
  }

  for (const url of [
    "http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/",
    "http://2130706433/", "http://0x7f.1/", "https://example.com:8443/", "ftp://example.com/",
    "https://user:pass@example.com/", "http://intranet/", "http://db.internal/",
  ]) {
    check(`取得を拒否 ${url}`, await blocked(url), true);
  }

  // --- フィードの解析 ---
  const rss = parseFeedXml(
    `<?xml version="1.0"?><rss version="2.0"><channel><title>テスト &amp; Blog</title><link>https://b.example/</link>
     <item><title><![CDATA[<b>記事1</b>]]></title><link>https://b.example/1</link><guid>g1</guid><pubDate>Tue, 03 Nov 2026 10:00:00 +0900</pubDate></item>
     <item><title>記事2</title><link>/2</link><pubDate>Mon, 02 Nov 2026 10:00:00 +0900</pubDate></item>
     <item><title>危険なリンク</title><link>javascript:alert(1)</link><guid>g3</guid></item>
     <item><title>重複</title><link>https://b.example/1</link><guid>g1</guid></item>
     </channel></rss>`,
    "https://b.example/feed",
  );
  check("RSS: タイトル", rss.title, "テスト & Blog");
  check("RSS: 件数(不正リンクと重複を除外)", rss.items.length, 2);
  check("RSS: HTMLタグを除去", rss.items[0].title, "記事1");
  check("RSS: 相対リンクを解決", rss.items[1].url, "https://b.example/2");
  check("RSS: 日時", rss.items[0].publishedAt, "2026-11-03T01:00:00.000Z");

  const atom = parseFeedXml(
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
     <title>チャンネル</title><link rel="self" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCx"/>
     <link rel="alternate" href="https://www.youtube.com/channel/UCx"/>
     <entry><id>yt:video:abcdefghijk</id><yt:videoId>abcdefghijk</yt:videoId><title>動画1</title>
       <link rel="alternate" href="https://www.youtube.com/watch?v=abcdefghijk"/><published>2026-11-01T00:00:00+00:00</published></entry>
     </feed>`,
    "https://www.youtube.com/feeds/videos.xml?channel_id=UCx",
  );
  check("Atom: サイトURLは alternate を採用", atom.siteUrl, "https://www.youtube.com/channel/UCx");
  check("Atom: ID", atom.items[0]?.externalId, "yt:video:abcdefghijk");
  check("Atom: リンク", atom.items[0]?.url, "https://www.youtube.com/watch?v=abcdefghijk");

  const rdf = parseFeedXml(
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
     <channel><title>RDF</title><link>https://r.example/</link></channel>
     <item rdf:about="https://r.example/a"><title>A</title><link>https://r.example/a</link><dc:date>2026-10-30T12:00:00+09:00</dc:date></item>
     </rdf:RDF>`,
    "https://r.example/index.rdf",
  );
  check("RDF: 件数", rdf.items.length, 1);
  check("RDF: 日時", rdf.items[0]?.publishedAt, "2026-10-30T03:00:00.000Z");

  let notFeed = false;
  try {
    parseFeedXml("<html><body>hello</body></html>", "https://x.example/");
  } catch {
    notFeed = true;
  }
  check("フィードでないものは拒否", notFeed, true);

  // --- URLの判定 ---
  const pick = (input: string) => {
    const result = parseAccountUrl(input);
    return "error" in result ? "error" : `${result.platform}:${result.mode}:${result.handle}`;
  };
  check("YouTube @handle", pick("https://www.youtube.com/@some_name/videos"), "youtube:feed:@some_name");
  check("YouTube channel", pick("youtube.com/channel/UCabcdefghijklmnopqrstuv"), "youtube:feed:UCabcdefghijklmnopqrstuv");
  check("YouTube 動画URLは不可", pick("https://www.youtube.com/watch?v=abcdefghijk"), "error");
  check("X", pick("https://twitter.com/Some_User?lang=ja"), "x:embed:@Some_User");
  check("X 予約語は不可", pick("https://x.com/home"), "error");
  check("Instagram", pick("https://www.instagram.com/some.user/"), "instagram:embed:@some.user");
  check("Instagram 投稿URLは不可", pick("https://www.instagram.com/p/abc/"), "error");
  check("TikTok", pick("https://www.tiktok.com/@some.user"), "tiktok:embed:@some.user");
  check("Threads", pick("https://www.threads.net/@some.user"), "threads:link:@some.user");
  check("Blog", pick("https://ameblo.jp/someone/"), "blog:feed:ameblo.jp");
  check("javascript: は不可", pick("javascript:alert(1)"), "error");
  check("埋め込みハンドルの検証(不正)", embedHandle("x", '@a"onload=x'), null);
  check("埋め込みハンドルの検証(正常)", embedHandle("tiktok", "@some.user"), "some.user");

  // --- Instagram の埋め込みページから投稿のコードを読む ---
  check(
    "Instagram 投稿コード",
    postCodesFromEmbed('{"shortcode":"DAbc123xyz"} <a href="/p/DAbc123xyz/"> https:\\/\\/www.instagram.com\\/reel\\/CReel99abc\\/ <a href="/p/C2second_1/">'),
    ["DAbc123xyz", "CReel99abc", "C2second_1"],
  );
  check(
    "Instagram 投稿コード(文字列の中のJSON)",
    postCodesFromEmbed('"contextJSON":"{\\"shortcode\\":\\"DEsc4ped01\\",\\"url\\":\\"https:\\\\/\\\\/www.instagram.com\\\\/p\\\\/DEsc4ped02\\\\/\\"}"'),
    ["DEsc4ped01", "DEsc4ped02"],
  );
  check(
    "Instagram 写真のURL",
    mediaFromPostEmbed('<img class="EmbeddedMediaImage" alt="" src="https://scontent-nrt1-1.cdninstagram.com/v/t51/abc.jpg?stp=1&amp;_nc=2">'),
    { image: "https://scontent-nrt1-1.cdninstagram.com/v/t51/abc.jpg?stp=1&_nc=2", video: false },
  );
  check(
    "Instagram 写真のURL(JSONの中)",
    mediaFromPostEmbed('{\\"display_url\\":\\"https:\\\\/\\\\/scontent.cdninstagram.com\\\\/v\\\\/x.jpg?a=1\\\\u0026b=2\\",\\"is_video\\":true}'),
    { image: "https://scontent.cdninstagram.com/v/x.jpg?a=1&b=2", video: true },
  );
  check("Instagram ほかのサイトの画像は使わない", mediaFromPostEmbed('<img class="EmbeddedMediaImage" src="https://evil.example.com/a.jpg">').image, null);
  check("Instagram 投稿なし", postCodesFromEmbed("<html></html>"), []);

  // --- X の投稿の番号と日時を読む ---
  check(
    "X 投稿(__NEXT_DATA__)",
    postsFromSyndication('<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"timeline":{"entries":[{"content":{"tweet":{"id_str":"1855000000000000111","created_at":"Mon Nov 10 09:00:00 +0000 2026"}}},{"content":{"tweet":{"id_str":"1855000000000000222","created_at":"Tue Nov 11 09:00:00 +0000 2026"}}}]}}}}</script>').map((p) => p.id),
    ["1855000000000000222", "1855000000000000111"],
  );
  check("X 投稿なし", postsFromSyndication("<html></html>"), []);

  // --- 推しの記録の読み書き(今のアプリと共通) ---
  check("SNS: URLをIDに", toStoredSns("x", "https://x.com/iON_kono_"), "iON_kono_");
  check("SNS: @を外す", toStoredSns("instagram", "@utage.kotoha"), "utage.kotoha");
  check("SNS: TikTok URL", toStoredSns("tiktok", "https://www.tiktok.com/@iON_idol_"), "iON_idol_");
  check("SNS: YouTube チャンネル", toStoredSns("youtube", "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"), "UCabcdefghijklmnopqrstuv");
  check("SNS: YouTube ハンドル", toStoredSns("youtube", "https://www.youtube.com/@yoruami"), "yoruami");
  check("SNS: 公式HP", toStoredSns("web", "heroines.jp/profile"), "https://heroines.jp/profile");
  const before = { id: "o1", name: "旧", photo: "gdrive:abc", gallery: ["gdrive:g1"], _order: 2, group: "旧G", sns_group_x: "old", groups: [{ id: "g1", name: "A", color: "#000000", extra: 1 }] };
  const merged = mergeIntoRecord(before, {
    id: "o1", name: " 新 ", color: "#EC6FA9", agency: "事務所", birthMonth: "1", birthDay: "6", birthYear: "",
    person: { ...emptySns(), x: "@me" },
    groups: [{ id: "g1", name: "A2", sns: { ...emptySns(), web: "https://a.example.com" } }, { name: "", sns: emptySns() }],
  }, { id: "o1", order: 0 });
  check("記録: 写真とギャラリーを残す", [merged.photo, merged.gallery, merged._order], ["gdrive:abc", ["gdrive:g1"], 2]);
  check("記録: 名前と本人のSNS", [merged.name, merged.sns_person_x], ["新", "me"]);
  check("記録: グループの他の項目を残し、空のグループは除く", (merged.groups as Record<string, unknown>[]).map((g) => [g.id, g.name, g.extra, g.color, g.sns_web]), [["g1", "A2", 1, "#EC6FA9", "https://a.example.com"]]);
  check("記録: 古い形式のグループを空に", [merged.group, merged.sns_group_x], ["", ""]);
  const editable = editableFrom("o1", merged);
  check("記録: 編集画面に戻す", [editable.name, editable.person.x, editable.groups[0].name, editable.groups[0].sns.web], ["新", "me", "A2", "https://a.example.com"]);

  // --- 見出しの文字参照 ---
  check("文字参照を戻す", decodeEntities("&#8220;UTAGE FES&#8221;Vol.5 &amp; &#x2764; &amp;#8220;"), "\u201CUTAGE FES\u201DVol.5 & \u2764 \u201C");
  check("不正な文字参照はそのまま", decodeEntities("&#0; &foo;"), "&#0; &foo;");
  check("サイト名", hostOf("https://www.heroines.jp/profile/ion_idol"), "heroines.jp");

  // --- YouTubeのチャンネルページからチャンネルIDを読む ---
  check(
    "チャンネルページ canonical",
    channelFromPage('<meta property="og:title" content="うた &amp; りん"><link rel="canonical" href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv">'),
    { channelId: "UCabcdefghijklmnopqrstuv", title: "うた & りん" },
  );
  check("チャンネルページ ページ内のID", channelFromPage('{"browseId":"UCabcdefghijklmnopqrstuv"}')?.channelId, "UCabcdefghijklmnopqrstuv");
  check("チャンネルページ 見つからない", channelFromPage("<html></html>"), null);

  // --- 今のアプリの推しの記録の読み替え ---
  const lib = recordsToLibrary(
    [
      { id: "b", data: { name: "後", color: "#abc", _order: 1, agency: "事務所A", group: "旧グループ", sns_group_youtube: "UCabcdefghijklmnopqrstuv" } },
      {
        id: "a",
        data: {
          name: "先", color: "red", _order: 0,
          groups: [{ name: "G1", sns_x: "@g1" }, { name: "G2", sns_web: "g2.example.com" }],
          sns_person_youtube: "@uta", sns_person_instagram: "uta.ig", sns_person_web: "https://blog.example.com/uta",
        },
      },
      { id: "c", data: null },
    ],
    { a: "2026-01-01T00:00:00.000Z" },
  );
  check("推しの並び順", lib.oshi.map((o) => o.id), ["a", "b"]);
  check("色の補正", lib.oshi.map((o) => o.color), ["#C9457A", "#aabbcc"]);
  check("兼任のグループ", lib.oshi[0].group_ids, ["group:G1", "group:G2"]);
  check("旧形式のグループ", lib.oshi[1].group_ids, ["group:旧グループ"]);
  check("事務所", lib.oshi[1].agency_id, "agency:事務所A");
  check("既読の時刻", lib.oshi[0].last_seen_at, "2026-01-01T00:00:00.000Z");
  check("SNSのURL化", lib.oshi[0].sns.map((s) => `${s.platform} ${s.url} ${s.from}`), [
    "youtube https://www.youtube.com/@uta 本人",
    "blog https://blog.example.com/uta 本人",
    "instagram https://www.instagram.com/uta.ig/ 本人",
    "x https://x.com/g1 G1",
    "blog https://g2.example.com G2",
  ]);
  check("YouTubeのチャンネルID", lib.oshi[1].sns.map((s) => s.url), ["https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"]);
  check("分類の一覧", lib.categories.map((c) => c.id).sort(), ["agency:事務所A", "group:G1", "group:G2", "group:旧グループ"]);

  console.log(failed === 0 ? "\nすべて成功" : `\n${failed}件 失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
