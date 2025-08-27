# Gemini API キー取得トラブルシューティング

## 🚨 「permission denied」エラーの完全解決ガイド

### Step 1: 基本確認事項
- [ ] 日本からのアクセス（VPN無効）
- [ ] 個人Googleアカウント（@gmail.com）使用
- [ ] 18歳以上のアカウント
- [ ] ブラウザのJavaScript有効

### Step 2: ブラウザ環境のクリーンアップ
```bash
# Chrome の場合
1. 設定 > プライバシーとセキュリティ > 閲覧履歴データの削除
2. 「Cookieと他のサイトデータ」「キャッシュされた画像とファイル」を選択
3. 「全期間」で削除実行
4. ブラウザ再起動
```

### Step 3: 複数の方法を順番に試行

#### 方法1: Google AI Studio（最新URL）
- https://aistudio.google.com/app/apikey
- https://makersuite.google.com/app/apikey（旧URL）

#### 方法2: Google Cloud Console
1. https://console.cloud.google.com/
2. プロジェクト作成：「yolube-bot-[ランダム数字]」
3. APIライブラリ → 「Generative Language API」を検索・有効化
4. 認証情報 → APIキー作成

#### 方法3: コマンドラインツール（上級者向け）
```bash
# Google Cloud CLI インストール後
gcloud auth login
gcloud projects create yolube-bot-project-[ランダム]
gcloud services enable generativelanguage.googleapis.com
gcloud alpha services api-keys create --display-name="YOLUBot Key"
```

### Step 4: エラー別対処法

| エラーメッセージ | 原因 | 解決方法 |
|------------------|------|----------|
| "permission denied" | アカウント制限 | 別アカウント使用 |
| "This service is not available in your region" | 地域制限 | VPN無効化 |
| "Workspace admin restrictions" | 組織制限 | 個人アカウント使用 |
| "Age verification required" | 年齢制限 | 18歳以上のアカウント |

### Step 5: 最終手段

#### OpenAI API の代替使用
```javascript
// src/services/geminiService.js を OpenAI 用に変更
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// generateResponse メソッドを OpenAI 用に変更
```

#### 環境変数の設定例
```env
# .env ファイル
# Option 1: Gemini API
GEMINI_API_KEY=AIzaSyA...

# Option 2: OpenAI API（代替案）
OPENAI_API_KEY=sk-...
AI_SERVICE=openai  # "gemini" または "openai"
```

### 最新情報の確認先
- Google AI Studio: https://aistudio.google.com/
- Gemini API ドキュメント: https://ai.google.dev/
- サポートフォーラム: https://discuss.ai.google.dev/

### 緊急連絡先
Google AI のサポートに直接問い合わせる場合：
https://support.google.com/ai-platform/

---
**注意**: このドキュメントは2025年1月時点の情報です。Gemini APIは急速に変化しているため、最新の公式ドキュメントも併せて確認してください。