# WebSearch機能セットアップガイド

YOLUBotでリアルタイムWeb検索を有効にするためのセットアップガイドです。

## 🎯 推奨プロバイダー

### 1. Serper API (強く推奨)
**最もコスパが良く、高速な検索API**

#### 特徴
- ⚡ 1-2秒の超高速レスポンス
- 💰 業界最安水準（$0.30/1000クエリ）
- 📊 Google検索結果をJSON形式で提供
- 🔄 6ヶ月有効なクレジット制

#### セットアップ手順
1. [Serper.dev](https://serper.dev/) にアクセス
2. アカウント作成（GitHubまたはEmailで登録）
3. ダッシュボードでAPIキーを生成
4. `.env`ファイルに追加：
   ```bash
   SERPER_API_KEY=your_serper_api_key_here
   ```

#### 料金プラン
- **無料枠**: 2,500検索/月
- **Hobby**: $50/月 (50,000検索) - $1.00/1k
- **Pro**: $150/月 (200,000検索) - $0.75/1k  
- **Business**: $500/月 (1,000,000検索) - $0.50/1k
- **Enterprise**: $1,500/月 (5,000,000検索) - $0.30/1k

### 2. Google Custom Search API (バックアップ推奨)
**Googleの公式検索API**

#### 特徴  
- 🏛️ Google公式サポート
- 🎯 高品質な検索結果
- ⚙️ カスタマイズ可能な検索エンジン

#### セットアップ手順
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクト作成またはプロジェクト選択
3. Custom Search API を有効化
4. APIキーを生成：
   - 「認証情報」→「認証情報を作成」→「APIキー」
5. [Programmable Search Engine](https://programmablearchengine.google.com/) でカスタム検索エンジン作成：
   - 検索対象サイト: `*` (全ウェブを検索)
   - 検索エンジンIDをコピー
6. `.env`ファイルに追加：
   ```bash
   GOOGLE_CSE_API_KEY=your_google_api_key_here
   GOOGLE_CSE_ID=your_search_engine_id_here
   ```

#### 料金プラン
- **無料枠**: 100検索/日
- **有料**: $5/1,000検索（最大10,000/日）

## 🚀 デプロイと動作確認

### 1. 環境変数設定
`.env`ファイルにAPIキーを設定後、アプリケーションを再起動してください。

### 2. 動作確認手順
1. `/websearch` コマンドでプロバイダー状況確認
2. `/news` コマンドでリアルタイム検索をテスト
3. ログでWebSearch実行状況を確認

### 3. 期待される出力ログ
```
🔍 Searching for: "board game news" (time limit: 6h)
🔍 Attempting real web search for: "board game news 2025"  
✅ Found 3 real web search results
📊 Search completed: 3 results from serper
```

## 📊 統計とモニタリング

### WebSearch統計コマンド
管理者は `/websearch` コマンドで以下を確認できます：
- 📊 本日の使用量（プロバイダー別）
- ⚙️ プロバイダー設定状況
- 🗄️ キャッシュサイズ
- 🏥 健全性チェック結果

### アラート機能
- レート制限到達時の自動フォールバック
- API障害時のエラーログ出力
- プロバイダー別成功率追跡

## 🛡️ セキュリティとベストプラクティス

### APIキー管理
- ✅ `.env`ファイルでの環境変数管理
- ✅ GitHub等にAPIキーをコミットしない
- ✅ 本番環境では環境変数で設定

### レート制限管理
- ✅ 自動的なレート制限チェック
- ✅ プロバイダー間の自動フォールバック
- ✅ 5分間のインメモリキャッシュ

### コスト制御
- ✅ 日次使用量追跡
- ✅ プロバイダー優先度設定
- ✅ フォールバック時のコスト削減

## 🔧 トラブルシューティング

### よくある問題

#### 1. "WebSearch failed: No results found"
**原因**: APIキーが未設定またはレート制限到達
**解決策**: 
- `/websearch`コマンドで設定状況確認
- `.env`ファイルのAPIキー設定確認
- アプリケーション再起動

#### 2. "provider: disabled (API key not configured)"
**原因**: 環境変数が正しく設定されていない
**解決策**:
- `.env`ファイルの変数名確認
- Render.com等のクラウド環境では環境変数画面で設定
- アプリケーション再起動

#### 3. 検索結果が期待通りでない
**原因**: 検索クエリの最適化が必要
**解決策**:
- キーワード戦略の見直し
- 検索オプションの調整
- フィードバックに基づく改善

### ログ確認方法
リアルタイムログで以下を確認：
```bash
# 成功例
🔍 Attempting real web search for: "board game news 2025"
✅ Found 3 real web search results

# フォールバック例  
⚠️ Web search failed for "board game news 2025": Rate limit exceeded
📰 Falling back to enhanced simulation...
```

## 📈 パフォーマンス最適化

### キャッシュ戦略
- 5分間のインメモリキャッシュ
- 同一クエリの重複リクエスト防止
- メモリ効率的なキャッシュサイズ管理

### 検索品質向上
- HTML タグの自動除去
- タイトル・説明文の長さ制限
- ソース信頼性の自動判定

## 🎯 次のステップ

WebSearch統合完了後の推奨改善：
1. **フィードバック機能**: ユーザーの記事評価収集
2. **機械学習**: 検索結果品質の自動改善
3. **多言語対応**: 英語圏ニュースソースの追加
4. **専門化**: ボードゲーム特化サイトの優先検索

---

**サポートが必要な場合は、`/websearch`コマンドの結果とログを確認してください。**