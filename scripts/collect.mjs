import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: ws } }
);

const SYSTEM_PROMPT = `あなたはAI業界専門のリサーチャーです。
web_searchツールを使って直近1週間のAI業界動向を徹底調査し、日本語で週次レポートを作成してください。

調査対象：
- 新しいAIモデルのリリース・発表
- 主要AI企業（OpenAI, Anthropic, Google, Meta, Mistral等）の動向
- 注目の研究論文・技術的ブレイクスルー
- AIビジネス・規制・社会的動向
- AIモデルの性能比較・ベンチマーク結果

最終的な回答は必ずJSON形式のみで返してください。前置き・後置き・マークダウン不要。`;

async function buildUserPrompt(today, weekAgo, pastTitles) {
  const pastSection = pastTitles.length > 0
    ? `\n\n【重要】以下は前回の週次レポートで既に報告済みのニュースタイトルです。これらと同じまたは類似した内容は除外し、必ず新しいニュースのみを報告してください：\n${pastTitles.map(t => `- ${t}`).join('\n')}\n`
    : '';

  return `${weekAgo}から${today}までの1週間のAI業界動向を調査して、以下のJSON形式で週次トレンドレポートを返してください。
この1週間で発表・公開・報道された重要なニュースを網羅的にまとめてください。${pastSection}

{
  "summary": "今週の総括（250字以内。週全体の流れやトレンドの方向性がわかるように）",
  "alert_level": 0または1または2（0:通常, 1:注目, 2:重大発表あり）,
  "alert_reason": "alert_levelが1か2の場合のみ、その理由を一文で（60字以内、summaryとは異なる短い見出し的な文章。alert_levelが0の場合は空文字でよい）",
  "items": [
    {
      "title": "ニュースタイトル（50字以内）",
      "body": "詳細説明（150字以内）",
      "source_url": "参考URL",
      "category": "release|research|ranking|business|other",
      "importance": 1〜5の整数
    }
  ],
  "rankings": [
    {
      "rank": 1,
      "name": "モデル名",
      "company": "会社名",
      "reason": "ランク理由（80字以内）",
      "trend": "up|down|stable"
    }
  ]
}

itemsは今週の重要ニュース8〜12件、rankingsは5件でお願いします。importanceは週の中での相対的な重要度でつけてください。`;
}

async function main() {
  // JSTで今日の日付を取得（GitHub ActionsはUTCで動くためズレを防ぐ）
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = jstNow.toISOString().split("T")[0];
  const weekAgo = new Date(jstNow.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  console.log(`[AI Trend Radar] Weekly collection: ${weekAgo} 〜 ${today}...`);

  // 今日のデータが既にあるかチェック
  const { data: existing } = await supabase
    .from("ai_news")
    .select("id")
    .eq("date", today)
    .single();

  if (existing) {
    console.log("Already collected today. Skipping.");
    process.exit(0);
  }

  // 前回レポート（過去7日以内の最新1件）のタイトルを重複除外用に取得
  const { data: pastNews } = await supabase
    .from("ai_news")
    .select("id")
    .gte("date", weekAgo)
    .lt("date", today)
    .order("date", { ascending: false })
    .limit(1);

  let pastTitles = [];
  if (pastNews && pastNews.length > 0) {
    const pastIds = pastNews.map(n => n.id);
    const { data: pastItems } = await supabase
      .from("ai_news_items")
      .select("title")
      .in("news_id", pastIds);
    pastTitles = pastItems?.map(i => i.title) || [];
  }

  console.log(`[AI Trend Radar] Found ${pastTitles.length} past titles to exclude.`);

  const userPrompt = await buildUserPrompt(today, weekAgo, pastTitles);

  // Claude API呼び出し（web_searchツール付き）
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 10,
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  // テキスト部分を抽出
  const textContent = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // JSONパース（{ から } の間だけ抽出）
  let jsonStr = textContent
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  const jsonStart = jsonStr.indexOf("{");
  const jsonEnd = jsonStr.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1) {
    jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
  }
  const data = JSON.parse(jsonStr);

  // Supabase保存
  const { data: newsRow, error: newsError } = await supabase
    .from("ai_news")
    .insert({
      date: today,
      summary: data.summary,
      alert_level: data.alert_level ?? 0,
      alert_reason: data.alert_reason || null,
    })
    .select()
    .single();

  if (newsError) throw newsError;

  if (data.items?.length > 0) {
    const { error: itemsError } = await supabase.from("ai_news_items").insert(
      data.items.map((item) => ({
        news_id: newsRow.id,
        title: item.title,
        body: item.body,
        source_url: item.source_url || null,
        category: item.category || "other",
        importance: item.importance || 1,
      }))
    );
    if (itemsError) throw itemsError;
  }

  if (data.rankings?.length > 0) {
    const { error: rankError } = await supabase.from("ai_rankings").insert({
      date: today,
      rankings: data.rankings,
    });
    if (rankError) throw rankError;
  }

  console.log(`✅ Done! ${data.items?.length} items saved. Alert: ${data.alert_level}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
