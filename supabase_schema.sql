-- =============================================
-- AI Trend Radar - Supabase テーブル設計
-- Supabase SQL Editorで実行してください
-- =============================================

-- 毎日の収集サマリー
CREATE TABLE IF NOT EXISTS ai_news (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date        date NOT NULL UNIQUE,
  summary     text,
  alert_level int DEFAULT 0 CHECK (alert_level IN (0, 1, 2)),
  created_at  timestamptz DEFAULT now()
);

-- 個別ニュースアイテム
CREATE TABLE IF NOT EXISTS ai_news_items (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id     uuid REFERENCES ai_news(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text,
  source_url  text,
  category    text CHECK (category IN ('release', 'research', 'ranking', 'business', 'other')),
  importance  int DEFAULT 1 CHECK (importance BETWEEN 1 AND 5),
  created_at  timestamptz DEFAULT now()
);

-- AIランキングスナップショット
CREATE TABLE IF NOT EXISTS ai_rankings (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date        date NOT NULL UNIQUE,
  rankings    jsonb NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS ai_news_date_idx ON ai_news(date DESC);
CREATE INDEX IF NOT EXISTS ai_news_items_news_id_idx ON ai_news_items(news_id);
CREATE INDEX IF NOT EXISTS ai_rankings_date_idx ON ai_rankings(date DESC);

-- RLS（Row Level Security）- 読み取り公開、書き込みはサービスキーのみ
ALTER TABLE ai_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read ai_news" ON ai_news FOR SELECT USING (true);
CREATE POLICY "public read ai_news_items" ON ai_news_items FOR SELECT USING (true);
CREATE POLICY "public read ai_rankings" ON ai_rankings FOR SELECT USING (true);
