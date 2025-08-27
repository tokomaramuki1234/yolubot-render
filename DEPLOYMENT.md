# 🚀 24時間稼働 - クラウドデプロイガイド

このBOTを24時間自動稼働させるための詳細手順です。

## 📋 デプロイ先の比較

| プラットフォーム | 無料枠 | データベース | 難易度 | 推奨度 |
|------------------|--------|--------------|--------|--------|
| **Railway** | $5/月クレジット | PostgreSQL無料 | ⭐⭐ | 🟢 **最推奨** |
| **Render** | 750時間/月 | PostgreSQL $7/月 | ⭐⭐ | 🟡 推奨 |
| **Heroku** | なし（$7/月〜） | PostgreSQL有料 | ⭐ | 🔴 非推奨 |

## 🛤️ Railway でのデプロイ（推奨）

### Step 1: Railwayアカウント作成
1. https://railway.app/ にアクセス
2. GitHubアカウントでサインアップ
3. $5/月の無料クレジットを確認

### Step 2: GitHubリポジトリの作成
```bash
# プロジェクトをGitリポジトリ化
git init
git add .
git commit -m "Initial commit: YOLUBot Discord Bot"

# GitHubで新しいリポジトリを作成後
git remote add origin https://github.com/あなたのユーザー名/bot_yomo.git
git push -u origin main
```

### Step 3: Railwayにプロジェクトをデプロイ
1. **Railway Dashboard** → 「New Project」
2. 「Deploy from GitHub repo」を選択
3. `bot_yomo` リポジトリを選択
4. 自動でビルド・デプロイが開始

### Step 4: PostgreSQLデータベースの追加
1. プロジェクトページで「Add Service」
2. 「Database」→「PostgreSQL」を選択
3. DATABASE_URLが自動で環境変数に設定される

### Step 5: 環境変数の設定
Railway Dashboard の「Variables」タブで以下を設定：

```env
DISCORD_TOKEN=your_actual_bot_token
DISCORD_APPLICATION_ID=1410056934329159762
DISCORD_PUBLIC_KEY=0c15cb137b132b88a659c5041de16f1ab889d3c1b8020d7277bf60e4904f97e1
GEMINI_API_KEY=AIzaSyClMyWbTzrzRZzdFeMWFnZvj1TQUVwfZQc
GUILD_ID=your_discord_server_id
CHANNEL_ID=your_news_channel_id
NODE_ENV=production
NEWS_API_KEY=optional_news_api_key
```

### Step 6: デプロイの確認
1. 「Deployments」タブでビルド状況を確認
2. ログで「Ready! Logged in as BOT名」を確認
3. Discordで`/help`コマンドをテスト

## 🎨 Render でのデプロイ

### Step 1: Renderアカウント作成
1. https://render.com/ にアクセス
2. GitHubアカウントでサインアップ

### Step 2: Web Serviceの作成
1. 「New Web Service」をクリック
2. GitHubリポジトリ `bot_yomo` を選択
3. 設定項目：
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Step 3: PostgreSQLデータベースの作成
1. 「New PostgreSQL」を作成（$7/月）
2. データベース接続情報をメモ

### Step 4: 環境変数の設定
Render Dashboard の Environment Variables で設定：
```env
DATABASE_URL=postgres://username:password@hostname:port/database
DISCORD_TOKEN=your_bot_token
# ... その他の環境変数
```

## 🐙 GitHub Actions での自動デプロイ設定

### .github/workflows/deploy.yml
```yaml
name: Deploy to Railway

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run tests (if any)
      run: npm test --if-present
      
    - name: Deploy to Railway
      uses: railwayapp/railway-deploy@v1
      with:
        railway-token: ${{ secrets.RAILWAY_TOKEN }}
```

## 🔧 よくある問題とトラブルシューティング

### 1. BOTが起動しない
**原因**: 環境変数の設定不備
**解決法**: 
- `DISCORD_TOKEN`が正しく設定されているか確認
- ログで具体的なエラーメッセージを確認

### 2. データベース接続エラー
**原因**: DATABASE_URLの形式間違い
**解決法**:
```bash
# 正しい形式
DATABASE_URL=postgres://username:password@hostname:port/database
```

### 3. スラッシュコマンドが表示されない
**原因**: コマンド登録が未実行
**解決法**: デプロイ後に以下を実行
```bash
# Railwayの場合、一度だけ手動実行が必要
npm run deploy-commands
```

### 4. メモリ不足エラー
**原因**: 無料プランの制限
**解決法**: 
- Railway: 通常問題なし（512MB）
- Render: 有料プランへアップグレード

## 📊 稼働コスト目安

### Railway（推奨）
- **無料**: $5/月クレジット（小規模利用なら十分）
- **有料**: 使用量に応じて課金（通常月$2-5程度）

### Render
- **無料**: 750時間/月（制限あり、スリープあり）
- **有料**: $7/月〜（PostgreSQL別途$7/月）

## 🎯 デプロイ後の確認事項

### ✅ チェックリスト
- [ ] BOTがオンライン状態
- [ ] `/help`コマンドが動作
- [ ] メンション応答が動作
- [ ] ニュース投稿時間に自動投稿
- [ ] データベースに会話履歴が保存
- [ ] 権限チェック（`/permissions`）が正常

### 📱 監視・メンテナンス
- **ログ監視**: プラットフォームのログ機能を定期確認
- **稼働時間**: Railway/Renderの稼働統計を確認
- **データベース**: 定期的なデータ量チェック

## 🚨 緊急時の対処

### BOTが停止した場合
1. プラットフォームのログを確認
2. 環境変数の設定を再確認
3. 必要に応じて手動で再起動

### データ損失の対策
- PostgreSQLは自動バックアップされる
- 重要な設定情報はGitリポジトリに保存

---

**重要**: このBOTは24時間稼働を前提として設計されており、クラウド環境での安定動作を保証します。ローカルでの動作確認後、上記手順でデプロイしてください。