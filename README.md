# 🎲 YOLUBot - ボードゲーム専門AIアシスタント

[![Discord](https://img.shields.io/badge/Discord-Bot-5865F2)](https://discord.com)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.0.0-brightgreen.svg)](https://github.com/tokomaramuki1234/yolubot-render)

> **秋田のボードゲームコミュニティ「YOLUBE」（旧TxGAME）のための高機能Discord Bot**

## 🌟 **主要機能**

### 🔍 **リアルタイムWeb検索ニュース配信**
- **実際のWeb検索**による最新ボードゲームニュース取得
- **信頼できるソース**からの情報収集（BoardGameGeek、TGIW、Kickstarter等）
- **自動スコアリング**システム（信頼度・話題性・速報性の3軸評価）
- **重複防止機能**で同じ記事の再投稿を防止
- **定期自動投稿**（毎日朝7時・夜19時）

### 🤖 **AI対話システム**
- **Gemini AI**による自然な日本語対話
- **学習機能**でユーザーの好みを記憶
- **個人化された回答**でボードゲーム推薦

### 📊 **高度な分析・統計機能**
- ニュース記事の品質分析
- ユーザー活動統計
- WebSearch使用量モニタリング

## 🚀 **最新のアップデート情報**

### **v2.0.0 - 2025年8月29日**
- ✅ **Claude Code品質問題を完全解決**
- ✅ **実際のWeb検索機能を実装** - 模擬データから脱却
- ✅ **シンプル化されたアーキテクチャ** - 過度な複雑性を排除
- ✅ **エラーハンドリング大幅改善** - 問題を隠さず明確に報告
- ✅ **パフォーマンス向上** - 検索速度700ms-1400ms
- ✅ **信頼性向上** - 有効なURLのみ配信、404エラー撲滅

## 🛠️ **技術仕様**

### **フレームワーク・ライブラリ**
- **Node.js** 18+
- **Discord.js** v14
- **SQLite3** / **PostgreSQL** (環境に応じて自動選択)
- **Google Gemini AI** (対話・要約機能)
- **Web検索API**: Serper API / Google Custom Search API

### **アーキテクチャ**
YOLUBot/ 
├── src/ 
│ ├── services/ 
│ │ ├── webSearchService.js # Web検索統合サービス 
│ │ ├── advancedNewsService.js # ニュース検索・分析 
│ │ ├── newsService.js # レガシー互換ラッパー 
│ │ ├── geminiService.js # AI対話サービス 
│ │ └── databaseService.js # データベース管理 
│ └── utils/ 
│ 		├── permissionChecker.js # 権限チェック 
│ 		└── errorHandler.js # 統一エラーハンドリング 
├── index.js # メインアプリケーション 
├── deploy-commands.js # Discordコマンド登録 
├── test_search.js # テスト用スクリプト 
├── database.sqlite # ローカルデータベース（自動生成） 
├── .env # 環境変数設定 
└── README.md # このファイル