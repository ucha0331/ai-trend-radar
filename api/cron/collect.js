import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SYSTEM_PROMPT = `あなたはAI業界専門のリサーチャーです。
web_searchツールを使って今日のAI最新動向を徹底調査し、日本語で報告してください。

調査対象：
- 新しいAIモデルのリリース・発表
- 主要AI企業（OpenAI, Anthropic, Google, Meta, Mistral等）の動向
- 注目の研究論文・技術的ブレイクスルー
- AIビジネス・規制・社会的動向
- AIモデルの性能比較・ベンチマーク結果

最終的な回答は必ずJSON形式のみで返してください。前置き・後置き・マークダウン不要。`;

const USER_PROMPT = `今日のAI最新動向を調査して、以下のJSON形式で返してください：

{
  "summary": "今日の総括（200字以内）",
  "alert_level": 0または1または2（0:通常, 1:注目, 2:重大発表あり）,
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

itemsは5〜8件、rankingsは5件でお願いします。`;

export default async function handler(req, res) {
  // Vercel Cronからのリクエスト認証
  const authHeader = req.headers["authorization"];
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // POSTまたはGETのみ許可
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const today = new Date().toISOString().split("T")[0];

  // 今日のデータが既にあるかチェック
  const { data: existing } = await supabase
    .from("ai_news")
    .select("id")
    .eq("date", today)
    .single();

  if (existing) {
    return res.status(200).json({ message: "Already collected today", date: today });
  }

  try {
    console.log(`[AI Trend Radar] Collecting for ${today}...`);

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
        },
      ],
      messages: [{ role: "user", content: USER_PROMPT }],
    });

    // レスポンスからテキスト部分を抽出
    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // JSONパース（コードブロックがあれば除去）
    const jsonStr = textContent
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const data = JSON.parse(jsonStr);

    // Supabase: ai_news 保存
    const { data: newsRow, error: newsError } = await supabase
      .from("ai_news")
      .insert({
        date: today,
        summary: data.summary,
        alert_level: data.alert_level ?? 0,
      })
      .select()
      .single();

    if (newsError) throw newsError;

    // Supabase: ai_news_items 保存
    if (data.items?.length > 0) {
      const items = data.items.map((item) => ({
        news_id: newsRow.id,
        title: item.title,
        body: item.body,
        source_url: item.source_url || null,
        category: item.category || "other",
        importance: item.importance || 1,
      }));

      const { error: itemsError } = await supabase
        .from("ai_news_items")
        .insert(items);

      if (itemsError) throw itemsError;
    }

    // Supabase: ai_rankings 保存
    if (data.rankings?.length > 0) {
      const { error: rankError } = await supabase.from("ai_rankings").insert({
        date: today,
        rankings: data.rankings,
      });

      if (rankError) throw rankError;
    }

    console.log(`[AI Trend Radar] Done! ${data.items?.length} items saved.`);
    return res.status(200).json({
      success: true,
      date: today,
      items_count: data.items?.length,
      alert_level: data.alert_level,
    });
  } catch (err) {
    console.error("[AI Trend Radar] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
