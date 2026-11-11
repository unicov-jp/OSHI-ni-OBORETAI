import "server-only";
import { decodeEntities } from "@/lib/text";
import { XMLParser } from "fast-xml-parser";
import { SafeFetchError, safeFetchText } from "@/lib/fetchers/safe-fetch";

export type ParsedItem = {
  externalId: string;
  title: string;
  url: string;
  publishedAt: string;
  thumbnailUrl: string | null;
};

export type ParsedFeed = {
  title: string;
  siteUrl: string;
  items: ParsedItem[];
  // 投稿日がおおよそ(「3日前」などから計算した)とき true。すでに保存してある投稿の日時は書き換えない
  approximate?: boolean;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

type Node = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return text((value as Node)["#text"]);
  return "";
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function httpUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: string): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  // 未来日時は取得時刻に丸める(並び順を乱されないため)
  return new Date(Math.min(time, Date.now())).toISOString();
}

function atomLink(entry: Node): string {
  const links = asArray(entry.link as Node | Node[] | string);
  for (const link of links) {
    if (typeof link === "string") return link;
    const rel = (link["@_rel"] as string | undefined) ?? "alternate";
    if (rel === "alternate" && typeof link["@_href"] === "string") return link["@_href"] as string;
  }
  const first = links[0];
  return first && typeof first !== "string" ? ((first["@_href"] as string | undefined) ?? "") : "";
}

export function parseFeedXml(xml: string, baseUrl: string): ParsedFeed {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new SafeFetchError("フィードを解析できませんでした");
  }

  const rss = doc.rss as Node | undefined;
  const rdf = (doc["rdf:RDF"] ?? doc.RDF) as Node | undefined;
  const atom = doc.feed as Node | undefined;

  let title = "";
  let siteUrl = "";
  let rawItems: { id: string; title: string; link: string; date: string }[] = [];

  if (rss?.channel || rdf) {
    const channel = (rss?.channel ?? rdf?.channel ?? {}) as Node;
    title = text(channel.title);
    siteUrl = text(channel.link);
    const items = asArray((rss ? channel.item : rdf?.item) as Node | Node[]);
    rawItems = items.map((item) => ({
      id: text(item.guid) || text(item.link) || (item["@_rdf:about"] as string | undefined) || "",
      title: text(item.title),
      link: text(item.link) || text(item.guid),
      date: text(item.pubDate) || text(item["dc:date"]) || text(item.date),
    }));
  } else if (atom) {
    title = text(atom.title);
    siteUrl = atomLink(atom);
    rawItems = asArray(atom.entry as Node | Node[]).map((entry) => ({
      id: text(entry.id) || atomLink(entry),
      title: text(entry.title),
      link: atomLink(entry),
      date: text(entry.published) || text(entry.updated),
    }));
  } else {
    throw new SafeFetchError("RSS/Atomフィードではありません");
  }

  const seen = new Set<string>();
  const items: ParsedItem[] = [];
  for (const raw of rawItems.slice(0, 50)) {
    const url = httpUrl(raw.link, baseUrl);
    const publishedAt = isoDate(raw.date) ?? new Date().toISOString();
    const externalId = (raw.id || url || "").slice(0, 500);
    if (!url || !externalId || seen.has(externalId)) continue;
    seen.add(externalId);
    items.push({
      externalId,
      title: stripTags(raw.title).slice(0, 300) || "(無題)",
      url,
      publishedAt,
      thumbnailUrl: null,
    });
  }

  return {
    title: stripTags(title).slice(0, 120),
    siteUrl: httpUrl(siteUrl, baseUrl) ?? baseUrl,
    items,
  };
}

function looksLikeFeed(body: string, contentType: string): boolean {
  if (/(rss|atom|xml)/i.test(contentType) && !/html/i.test(contentType)) return true;
  const head = body.slice(0, 600).toLowerCase();
  return head.includes("<rss") || head.includes("<feed") || head.includes("<rdf:rdf");
}

// HTMLの <link rel="alternate" type="application/rss+xml"> からフィードのURLを探す。
function findFeedLink(html: string, baseUrl: string): string | null {
  const tags = html.slice(0, 300_000).match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const url = httpUrl(href.replace(/&amp;/g, "&"), baseUrl);
    if (url) return url;
  }
  return null;
}

export async function fetchFeed(feedUrl: string): Promise<ParsedFeed> {
  const response = await safeFetchText(feedUrl);
  return parseFeedXml(response.text, response.finalUrl);
}

// Blogのトップ等のURLから、対応するフィードを探して返す。見つからなければ null。
export async function discoverFeed(pageUrl: string): Promise<{ feedUrl: string; feed: ParsedFeed } | null> {
  const response = await safeFetchText(pageUrl);
  if (looksLikeFeed(response.text, response.contentType)) {
    return { feedUrl: response.finalUrl, feed: parseFeedXml(response.text, response.finalUrl) };
  }

  const link = findFeedLink(response.text, response.finalUrl);
  if (!link) return null;

  // http のフィードはまず https で試し、だめなら元のURLで取得する
  const candidates = link.startsWith("http://") ? [link.replace(/^http:/, "https:"), link] : [link];
  for (const candidate of candidates) {
    try {
      const feedResponse = await safeFetchText(candidate);
      return { feedUrl: feedResponse.finalUrl, feed: parseFeedXml(feedResponse.text, feedResponse.finalUrl) };
    } catch {
      // 次の候補へ
    }
  }
  return null;
}
