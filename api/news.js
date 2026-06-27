import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { date } = req.query;
  const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const targetDate = date || jstDate.toISOString().split("T")[0];

  console.log("[API/news] targetDate:", targetDate);
  console.log("[API/news] SUPABASE_URL:", process.env.SUPABASE_URL ? "set" : "NOT SET");
  console.log("[API/news] SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY ? "set" : "NOT SET");

  try {
    const { data: news, error: newsError } = await supabase
      .from("ai_news")
      .select("*")
      .eq("date", targetDate)
      .single();

    console.log("[API/news] news:", JSON.stringify(news));
    console.log("[API/news] newsError:", JSON.stringify(newsError));

    if (newsError || !news) {
      return res.status(404).json({ 
        error: "No data for this date", 
        date: targetDate,
        supabaseError: newsError?.message
      });
    }

    const { data: items } = await supabase
      .from("ai_news_items")
      .select("*")
      .eq("news_id", news.id)
      .order("importance", { ascending: false });

    const { data: rankingRow } = await supabase
      .from("ai_rankings")
      .select("*")
      .eq("date", targetDate)
      .single();

    const { data: dates } = await supabase
      .from("ai_news")
      .select("date")
      .order("date", { ascending: false })
      .limit(30);

    return res.status(200).json({
      date: targetDate,
      summary: news.summary,
      alert_level: news.alert_level,
      items: items || [],
      rankings: rankingRow?.rankings || [],
      available_dates: dates?.map((d) => d.date) || [],
    });
  } catch (err) {
    console.error("[API/news] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
