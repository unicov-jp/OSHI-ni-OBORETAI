// 推しの記録(oshikatsu_records の kind = 'oshi')を、今のアプリ(推し活手帳)と同じ形で作る・直すための部品。
// 新しいアプリと今のアプリのどちらで登録・編集しても、同じ1行を読み書きする(同期で互いに反映される)。

// 並びは入力欄の順。threads 以降は後から足したもの(fantia・myfans・xfans は Advanced プランで新着の取得先に登録される)
export const SNS_KEYS = ["x", "instagram", "tiktok", "youtube", "threads", "web", "fantia", "myfans", "xfans"] as const;
// URLのまま保存するもの(それ以外は ID・ハンドルに直して保存する)
const URL_KEYS: readonly string[] = ["web", "fantia", "myfans", "xfans"];
export const ADVANCED_SNS_KEYS: readonly SnsKey[] = ["fantia", "myfans", "xfans"];
export type SnsKey = (typeof SNS_KEYS)[number];
export type SnsInput = Record<SnsKey, string>;

export const SNS_LABEL: Record<SnsKey, string> = {
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  threads: "Threads",
  web: "公式HP・Blog",
  fantia: "Fantia",
  myfans: "myfans",
  xfans: "xfans",
};

export const SNS_PLACEHOLDER: Record<SnsKey, string> = {
  x: "ID(例: oshi_name)またはURL",
  instagram: "ID またはURL",
  tiktok: "ID またはURL",
  youtube: "@ハンドル・UC… またはURL",
  threads: "ID またはURL",
  web: "https://…",
  fantia: "https://fantia.jp/fanclubs/…",
  myfans: "https://myfans.jp/…",
  xfans: "https://www.xfans.tokyo/…",
};

export type GroupInput = { id?: string; name: string; sns: SnsInput };

export type OshiEditable = {
  id?: string;
  name: string;
  color: string;
  agency: string;
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  person: SnsInput;
  groups: GroupInput[];
  // Sensitive として登録する推しか
  sensitive: boolean;
};

export const emptySns = (): SnsInput => ({
  x: "", instagram: "", tiktok: "", youtube: "", threads: "", web: "", fantia: "", myfans: "", xfans: "",
});

// 今のアプリは SNS を「ID」で持つ(公式HPだけURL)。URLが入力されたら ID に直して保存する。
export function toStoredSns(key: SnsKey, input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (URL_KEYS.includes(key)) {
    if (/^https?:\/\//i.test(value)) return value;
    return /^[\w.-]+\.[a-z]{2,}/i.test(value) ? `https://${value}` : "";
  }
  if (!/^https?:\/\//i.test(value) && !/^(www\.)?(x|twitter|instagram|tiktok|youtube|threads)\.(com|net)\//i.test(value)) {
    return value.replace(/^@+/, "").slice(0, 100);
  }
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const parts = url.pathname.split("/").filter(Boolean);
    if (key === "youtube") {
      const channel = parts[0] === "channel" ? parts[1] : "";
      if (channel && /^UC[A-Za-z0-9_-]{22}$/.test(channel)) return channel;
      const handle = parts.find((p) => p.startsWith("@"));
      return handle ? handle.slice(1) : (parts[parts.length - 1] ?? "");
    }
    return (parts.find((p) => p.startsWith("@"))?.slice(1) ?? parts[0] ?? "").replace(/^@+/, "").slice(0, 100);
  } catch {
    return value.replace(/^@+/, "").slice(0, 100);
  }
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

// 保存されている推しの中身から、編集画面に出す値を作る
export function editableFrom(id: string, data: Raw): OshiEditable {
  const person = emptySns();
  for (const key of SNS_KEYS) person[key] = str(data[`sns_person_${key}`]) || str(data[`sns_${key}`]);
  let groups: GroupInput[] = [];
  if (Array.isArray(data.groups) && data.groups.length > 0) {
    groups = (data.groups as Raw[]).filter((g) => g && typeof g === "object").map((g) => {
      const sns = emptySns();
      for (const key of SNS_KEYS) sns[key] = str(g[`sns_${key}`]);
      return { id: str(g.id) || undefined, name: str(g.name), sns };
    });
  } else if (str(data.group)) {
    const sns = emptySns();
    for (const key of SNS_KEYS) sns[key] = str(data[`sns_group_${key}`]);
    groups = [{ name: str(data.group), sns }];
  }
  return {
    id,
    name: str(data.name),
    color: str(data.color) || "#C9457A",
    agency: str(data.agency),
    birthMonth: str(data.birthMonth),
    birthDay: str(data.birthDay),
    birthYear: str(data.birthYear),
    person,
    groups,
    sensitive: data.sensitive === true,
  };
}

// 編集した値を、今の中身(写真・ギャラリー・並び順など触らない項目)に重ねて、保存する中身を作る
export function mergeIntoRecord(current: Raw | null, input: OshiEditable, extra: { id: string; order: number }): Raw {
  const base: Raw = current ? { ...current } : {
    id: extra.id,
    photo: null,
    photoOriginal: null,
    mode: "pale",
    order: extra.order,
    _order: extra.order,
    createdAt: Date.now(),
  };
  const oldGroups = Array.isArray(base.groups) ? (base.groups as Raw[]) : [];
  const groups = input.groups
    .filter((g) => g.name.trim() || SNS_KEYS.some((k) => g.sns[k].trim()))
    .map((g, index) => {
      const old = oldGroups.find((o) => g.id && o.id === g.id) ?? {};
      const row: Raw = { ...old, id: g.id || str(old.id) || crypto.randomUUID(), name: g.name.trim().slice(0, 40) };
      for (const key of SNS_KEYS) row[`sns_${key}`] = toStoredSns(key, g.sns[key]);
      // 今のアプリはメインのグループの色を推しの色として使うので、そろえておく
      if (index === 0) row.color = input.color;
      if (row.color === undefined) row.color = "";
      return row;
    });

  const next: Raw = {
    ...base,
    id: extra.id,
    name: input.name.trim().slice(0, 40),
    color: input.color,
    agency: input.agency.trim().slice(0, 40),
    birthMonth: input.birthMonth,
    birthDay: input.birthDay,
    birthYear: input.birthYear,
    sensitive: input.sensitive === true,
    groups,
    // 古い形式(group 1つ)の項目は、グループを消したときに復活しないよう空にする
    group: "",
    sns_group_instagram: "",
    sns_group_x: "",
    sns_group_tiktok: "",
    sns_group_youtube: "",
  };
  for (const key of SNS_KEYS) {
    next[`sns_person_${key}`] = toStoredSns(key, input.person[key]);
    // さらに古い形式(sns_<種類>)も、消したときに復活しないよう空にする
    next[`sns_${key}`] = "";
  }
  return next;
}
