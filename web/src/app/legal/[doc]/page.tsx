import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/header";
import { Notice } from "@/components/ui";

// 法務文書の雛形。「◯」の箇所は運営者の情報で埋め、公開前に専門家の確認を受けること。

type Doc = { title: string; sections: { heading: string; body: string[] }[] };

const DOCS: Record<string, Doc> = {
  terms: {
    title: "利用規約",
    sections: [
      {
        heading: "サービスの内容",
        body: [
          "本サービスは、利用者が登録したURLをもとに、YouTubeおよびBlogの新着の見出しとリンクを一覧表示し、X・Instagram・TikTokを各サービスの公式埋め込みで表示する非公式のファン向けツールです。",
          "本サービスは各SNS事業者、芸能事務所、出演者とは関係がありません。",
        ],
      },
      {
        heading: "禁止事項",
        body: [
          "法令または公序良俗に反する行為、第三者の権利を侵害する行為、本サービスの運営を妨げる行為、不正アクセスや過度な負荷をかける行為を禁止します。",
        ],
      },
      {
        heading: "有料プラン",
        body: [
          "有料プランの料金、支払方法、解約方法は「特定商取引法に基づく表記」に定めます。解約は設定画面からいつでも行えます。",
        ],
      },
      {
        heading: "利用の停止",
        body: ["運営者は、利用者が本規約に違反した場合、事前の通知なく利用を停止できるものとします。"],
      },
      {
        heading: "免責",
        body: [
          "各SNSの仕様変更等により、新着の取得や埋め込み表示が予告なく利用できなくなる場合があります。",
          "運営者: ◯◯◯◯ / 制定日: ◯年◯月◯日",
        ],
      },
    ],
  },
  privacy: {
    title: "プライバシーポリシー",
    sections: [
      {
        heading: "取得する情報",
        body: [
          "Googleログインで提供されるメールアドレスと表示名、利用者が登録した推しの名前・分類・メモ・SNSアカウントのURL、有料プランの契約状態を取得します。",
          "クレジットカード情報はStripeが取り扱い、当サービスは保存しません。",
        ],
      },
      {
        heading: "利用目的",
        body: ["本サービスの提供、本人確認、料金の請求、不正利用の防止、お問い合わせへの対応のために利用します。"],
      },
      {
        heading: "第三者のサービス",
        body: [
          "認証とデータ保存にSupabase、配信にVercel、決済にStripeを利用します。",
          "埋め込み表示を開くと、X・Instagram・TikTok・YouTubeの各事業者に、閲覧に伴う情報(IPアドレス、Cookie等)が送信されます。",
        ],
      },
      {
        heading: "運営者による閲覧の範囲",
        body: ["運営者が確認できるのは、利用者ごとの登録件数までです。誰を推しているかは運営者の管理画面には表示されません。"],
      },
      {
        heading: "開示・訂正・削除",
        body: ["ご本人からの請求には、法令に従い対応します。窓口: ◯◯◯◯(◯◯@◯◯)"],
      },
    ],
  },
  tokushoho: {
    title: "特定商取引法に基づく表記",
    sections: [
      { heading: "販売事業者", body: ["◯◯◯◯"] },
      { heading: "運営統括責任者", body: ["◯◯ ◯◯"] },
      { heading: "所在地", body: ["◯◯◯◯"] },
      { heading: "連絡先", body: ["◯◯@◯◯ / 電話番号: ◯◯-◯◯◯◯-◯◯◯◯"] },
      { heading: "販売価格", body: ["申し込み画面に表示する金額(税込)"] },
      { heading: "支払方法と時期", body: ["クレジットカード(Stripe)。申し込み時に初回分を請求し、以後は契約期間ごとに自動更新します。"] },
      { heading: "提供時期", body: ["決済完了後、ただちに利用できます。"] },
      { heading: "解約・返金", body: ["設定画面からいつでも解約でき、契約期間の終了日まで利用できます。期間途中の返金は行いません。"] },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return { title: DOCS[doc]?.title ?? "ページが見つかりません" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const content = DOCS[doc];
  if (!content) notFound();

  return (
    <div className="mx-auto max-w-[720px] px-5 pb-16">
      <header className="flex h-14 items-center">
        <Wordmark />
      </header>
      <h1 className="mt-6 text-2xl leading-9 font-bold">{content.title}</h1>
      <div className="mt-4">
        <Notice tone="warn">これは雛形です。「◯」の箇所を埋め、公開前に専門家の確認を受けてください。</Notice>
      </div>
      <div className="mt-8 space-y-7">
        {content.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-bold">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-2 text-sm leading-7 text-muted">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm">
        <Link href="/" className="text-brand underline">
          トップへ戻る
        </Link>
      </p>
    </div>
  );
}
