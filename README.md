# 🛰️ AI Trend Radar

AIの最新動向を毎朝自動収集してダッシュボードで確認できるWebアプリ。

## 技術スタック

- **Frontend**: Vanilla JS（単一HTML）
- **Backend**: Vercel Serverless Functions
- **Cron**: Vercel Cron Jobs（毎朝8:00 JST）
- **AI**: Claude API（claude-sonnet-4-6 + web_search）
- **DB**: Supabase（PostgreSQL）

---

## セットアップ手順

### 1. Supabaseテーブル作成

Supabase Dashboard → SQL Editor で `supabase_schema.sql` を実行。

### 2. GitHubリポジトリ作成 & プッシュ

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/ucha0331/ai-trend-radar.git
git push -u origin main
```

### 3. Vercelデプロイ

```bash
vercel --prod
```

またはGitHub連携で自動デプロイ。

### 4. 環境変数をVercelに設定

Vercel Dashboard → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | Anthropic APIキー |
| `SUPABASE_URL` | SupabaseプロジェクトURL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key（Cron用） |
| `CRON_SECRET` | 任意のランダム文字列（Cron認証用） |

### 5. 動作確認

デプロイ後、ブラウザでアクセスして「今すぐ収集を実行」ボタンをクリック。

---

## Cron設定

`vercel.json` で毎朝 UTC 23:00（JST 8:00）に自動実行：

```json
{
  "crons": [{ "path": "/api/cron/collect", "schedule": "0 23 * * *" }]
}
```

---

## フェーズ2：LINE通知の追加（後日）

1. LINE Developers でチャネル作成
2. `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_USER_ID` を環境変数に追加
3. `api/cron/collect.js` の末尾にLINE Push API呼び出しを追加

```js
await fetch('https://api.line.me/v2/bot/message/push', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: process.env.LINE_USER_ID,
    messages: [{ type: 'text', text: `🤖 AI Trend Radar\n${data.summary}` }]
  })
});
```
