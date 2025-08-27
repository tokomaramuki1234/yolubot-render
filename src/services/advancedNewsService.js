const axios = require('axios');

class AdvancedNewsService {
    constructor() {
        this.searchLayers = {
            layer1: this.getGeneralBoardGameKeywords(),
            layer2: this.getManufacturerDesignerKeywords(),
            layer3: this.getEventExhibitionKeywords(),
            layer4: this.getIndustryTrendKeywords()
        };
        
        this.sourceReliability = new Map();
        this.initializeSourceReliability();
        
        this.seasonalWeights = this.calculateSeasonalWeights();
        this.learningData = {
            effectiveKeywords: new Map(),
            clickRates: new Map(),
            userFeedback: []
        };
    }

    // 1. 多層検索戦略の実装
    getGeneralBoardGameKeywords() {
        return [
            'board game news', 'tabletop game', 'boardgame release',
            'card game announcement', 'strategy game', 'party game',
            'cooperative game', 'deck building', 'worker placement',
            'ボードゲーム', '卓上ゲーム', 'テーブルゲーム'
        ];
    }

    getManufacturerDesignerKeywords() {
        return [
            'Asmodee', 'Fantasy Flight Games', 'Z-Man Games', 'Days of Wonder',
            'Stonemaier Games', 'CMON', 'Repos Production',
            'Uwe Rosenberg', 'Reiner Knizia', 'Stefan Feld',
            'アークライト', 'ホビージャパン', 'テンデイズゲームズ'
        ];
    }

    getEventExhibitionKeywords() {
        return [
            'Essen Spiel', 'Gen Con', 'Origins Game Fair', 'BGG Con',
            'Tokyo Game Market', 'Spielwarenmesse', 'SPIEL',
            'ゲームマーケット', 'ボードゲームフェスティバル'
        ];
    }

    getIndustryTrendKeywords() {
        return [
            'Kickstarter board game', 'crowdfunding tabletop',
            'board game investment', 'tabletop industry',
            'game design innovation', 'board game market',
            'クラウドファンディング', 'ボードゲーム業界', '新機構'
        ];
    }

    async performMultiLayerSearch(hoursLimit) {
        const allResults = [];
        const currentSeason = this.getCurrentSeason();
        
        // 段階的検索の実行
        for (const [layer, keywords] of Object.entries(this.searchLayers)) {
            console.log(`Executing search layer: ${layer}`);
            
            const layerResults = await this.executeLayerSearch(keywords, hoursLimit, currentSeason);
            allResults.push(...layerResults);
            
            // レート制限を考慮した待機
            await this.waitForRateLimit(1000);
        }
        
        return this.deduplicateAndRank(allResults);
    }

    async executeLayerSearch(keywords, hoursLimit, season) {
        const results = [];
        const seasonalKeywords = this.applySeasonalWeights(keywords, season);
        
        for (const keyword of seasonalKeywords.slice(0, 5)) { // 上位5つのキーワードのみ使用
            try {
                // WebSearch機能が利用可能な場合は実際の検索を実行
                // 現在は模擬データを生成
                const searchResults = await this.simulateWebSearch(keyword, hoursLimit);
                results.push(...searchResults);
                
            } catch (error) {
                console.error(`Search error for keyword '${keyword}':`, error.message);
            }
        }
        
        return results;
    }

    // WebSearch模擬（実際のWebSearch実装時に置き換え）
    async simulateWebSearch(keyword, hoursLimit) {
        // 実際のWebSearchが利用可能になるまでの暫定実装
        const mockResults = this.generateRelevantMockNews(keyword);
        return mockResults.slice(0, 3); // 各キーワードごとに最大3件
    }

    generateRelevantMockNews(keyword) {
        const currentTime = new Date();
        const allTemplates = this.getAllNewsTemplates();
        
        // キーワードに関連するテンプレートを選択し、ランダムに3つ選ぶ
        const relevantTemplates = allTemplates.filter(template => 
            this.isTemplateRelevantToKeyword(template, keyword)
        );
        
        const selectedTemplates = this.shuffleArray(relevantTemplates).slice(0, 3);
        
        return selectedTemplates.map((template, index) => ({
            title: template.title,
            description: template.description,
            url: template.url,
            publishedAt: new Date(currentTime.getTime() - (index + 1) * 2 * 60 * 60 * 1000).toISOString(),
            source: template.source,
            content: template.description,
            searchKeyword: keyword,
            reliability: this.estimateSourceReliability(template.source)
        }));
    }
    
    getAllNewsTemplates() {
        return [
            {
                title: '2025年注目のボードゲーム新作情報',
                description: '今年発表予定の注目ボードゲーム新作について、戦略ゲームから協力ゲームまで幅広いジャンルをカバー。革新的メカニクスを採用した作品が多数登場予定です。',
                url: 'https://boardgamegeek.com/',
                source: 'BoardGameGeek',
                keywords: ['board game', 'new', 'release', '2025']
            },
            {
                title: 'Kickstarterボードゲームプロジェクト注目作品',
                description: 'クラウドファンディングで資金調達中の革新的ボードゲームプロジェクト。独創的なシステムと美麗なアートワークで支援者の注目を集めています。',
                url: 'https://www.kickstarter.com/discover/categories/games/tabletop%20games',
                source: 'Kickstarter',
                keywords: ['kickstarter', 'crowdfunding', 'project']
            },
            {
                title: 'ゲームマーケット2025春 出展情報',
                description: '日本最大のアナログゲームイベント「ゲームマーケット」の最新出展情報。国内インディーデザイナーの意欲的な新作が多数展示予定です。',
                url: 'https://gamemarket.jp/',
                source: 'ゲームマーケット公式',
                keywords: ['ゲームマーケット', 'event', 'japan', 'indie']
            },
            {
                title: 'Spiel des Jahres 2025 候補作品発表',
                description: 'ドイツ年間ゲーム大賞2025年の候補作品が発表されました。今年は特に家族向けゲームと戦略ゲームのバランスが取れた優秀な作品が揃っています。',
                url: 'https://www.spiel-des-jahres.de/en/',
                source: 'Spiel des Jahres',
                keywords: ['award', 'spiel des jahres', 'germany', 'winner']
            },
            {
                title: 'Gen Con 2025 新作発表まとめ',
                description: '北米最大のゲームコンベンション「Gen Con」で発表された新作ボードゲームの情報をまとめました。大手出版社からインディー作品まで幅広くご紹介。',
                url: 'https://www.gencon.com/',
                source: 'Gen Con',
                keywords: ['gen con', 'convention', 'announcement', 'america']
            },
            {
                title: 'ボードゲーム市場動向レポート2025',
                description: '2025年のボードゲーム市場動向について詳細分析。デジタル統合型ゲームの成長と、クラシックゲームの根強い人気について解説します。',
                url: 'https://boardgamewire.com/',
                source: 'Board Game Wire',
                keywords: ['market', 'trend', 'analysis', 'industry']
            },
            {
                title: 'Asmodee新作ラインナップ発表',
                description: '世界最大のボードゲーム出版グループAsmodeeから2025年の新作ラインナップが発表。人気シリーズの続編から全く新しいIPまで多彩な作品が予定されています。',
                url: 'https://www.asmodee.com/en/',
                source: 'Asmodee',
                keywords: ['asmodee', 'publisher', 'lineup', 'announcement']
            },
            {
                title: '協力型ボードゲームの新潮流',
                description: '近年人気が高まる協力型ボードゲームの最新動向。プレイヤー同士が協力してゲームに挑む新しいメカニクスや、ストーリー要素を重視した作品が注目されています。',
                url: 'https://www.shutupandsitdown.com/',
                source: 'Shut Up & Sit Down',
                keywords: ['cooperative', 'trend', 'mechanism', 'story']
            }
        ];
    }
    
    isTemplateRelevantToKeyword(template, keyword) {
        const keywordLower = keyword.toLowerCase();
        return template.keywords.some(templateKeyword => 
            keywordLower.includes(templateKeyword.toLowerCase()) || 
            templateKeyword.toLowerCase().includes(keywordLower)
        ) || template.title.toLowerCase().includes(keywordLower);
    }
    
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }


    // 2. 高精度信憑性判定システム（100点満点）
    calculateCredibilityScore(article) {
        let score = 0;
        
        // 情報源信頼度評価（30点）
        score += this.evaluateSourceReliability(article.source, article.url);
        
        // 記事内容の整合性チェック（25点）
        score += this.checkContentIntegrity(article);
        
        // 執筆者・組織の専門性（20点）
        score += this.evaluateAuthorExpertise(article);
        
        // 更新頻度・鮮度（15点）
        score += this.evaluateFreshness(article.publishedAt);
        
        // コミュニティ反応分析（10点）
        score += this.analyzeCommunityReaction(article);
        
        return Math.min(100, score);
    }

    evaluateSourceReliability(source, url) {
        const reliabilityMap = {
            // 公式サイト・メーカー発表（25-30点）
            'official': 30,
            'manufacturer': 28,
            
            // 業界専門メディア（20-25点）
            'Board Game Quest': 25,
            'BoardGameGeek': 24,
            'Meeple Mountain': 23,
            'The Dice Tower': 22,
            'Shut Up & Sit Down': 21,
            
            // 一般ゲームメディア（15-20点）
            'IGN': 18,
            'Polygon': 17,
            'Kotaku': 16,
            
            // その他（5-15点）
            'default': 10
        };

        let score = reliabilityMap[source] || reliabilityMap['default'];
        
        // URLパターンによる追加評価
        if (url.includes('official') || url.includes('press-release')) {
            score += 3;
        }
        
        return Math.min(30, score);
    }

    checkContentIntegrity(article) {
        let score = 0;
        const content = article.title + ' ' + article.description;
        
        // 引用元の明記（5点）
        if (content.match(/according to|source:|via |citing/i)) {
            score += 5;
        }
        
        // 具体的な数値・日付の記載（5点）
        if (content.match(/\d{4}|\d+%|\$\d+|January|February|March|April|May|June|July|August|September|October|November|December/)) {
            score += 5;
        }
        
        // 論理的一貫性（5点）
        if (content.length > 100 && !content.match(/\.\.\.|TBD|coming soon/i)) {
            score += 5;
        }
        
        // 複数ソースとの整合性（10点）
        // 実装時は他記事との比較分析を追加
        score += 8; // 暫定スコア
        
        return Math.min(25, score);
    }

    evaluateAuthorExpertise(article) {
        // 暫定実装：ソースベースの専門性評価
        const expertiseSources = [
            'Board Game Quest', 'BoardGameGeek', 'The Dice Tower',
            'Meeple Mountain', 'Shut Up & Sit Down'
        ];
        
        if (expertiseSources.includes(article.source)) {
            return 18;
        }
        
        return 12; // デフォルトスコア
    }

    evaluateFreshness(publishedAt) {
        const now = Date.now();
        const published = new Date(publishedAt).getTime();
        const hoursAgo = (now - published) / (1000 * 60 * 60);
        
        if (hoursAgo <= 1) return 15;
        if (hoursAgo <= 6) return 12;
        if (hoursAgo <= 24) return 10;
        if (hoursAgo <= 168) return 8; // 1週間
        if (hoursAgo <= 720) return 6; // 1ヶ月
        
        return 3;
    }

    analyzeCommunityReaction(article) {
        // 暫定実装：将来的にSNS API連携で実装
        return 8; // デフォルトスコア
    }

    // 3. 話題性判定の高度化
    calculateRelevanceScore(article) {
        let score = 0;
        
        // 即時的話題性（40点）
        score += this.evaluateImmediateRelevance(article);
        
        // 持続的注目度（30点）
        score += this.evaluateSustainedAttention(article);
        
        // 業界インパクト（20点）
        score += this.evaluateIndustryImpact(article);
        
        // 独自性・希少性（10点）
        score += this.evaluateUniqueness(article);
        
        return Math.min(100, score);
    }

    evaluateImmediateRelevance(article) {
        let score = 0;
        const content = (article.title + ' ' + article.description).toLowerCase();
        
        // 話題性の高いキーワードをチェック
        const trendingKeywords = [
            'breaking', 'exclusive', 'first look', 'revealed', 'announced',
            'surprise', 'unexpected', 'major', 'significant', 'revolutionary'
        ];
        
        const matchedKeywords = trendingKeywords.filter(keyword => content.includes(keyword));
        score += matchedKeywords.length * 3;
        
        return Math.min(40, score + 25); // ベーススコア25点
    }

    evaluateSustainedAttention(article) {
        // 暫定実装：実際はトレンド分析APIを使用
        return 25; // デフォルトスコア
    }

    evaluateIndustryImpact(article) {
        const content = (article.title + ' ' + article.description).toLowerCase();
        const impactKeywords = [
            'acquisition', 'merger', 'partnership', 'expansion', 'investment',
            'innovation', 'breakthrough', 'game-changing', 'industry-first'
        ];
        
        const matches = impactKeywords.filter(keyword => content.includes(keyword));
        return Math.min(20, matches.length * 4 + 8);
    }

    evaluateUniqueness(article) {
        // 暫定実装：重複チェックベース
        return 8; // デフォルトスコア
    }

    // 4. 速報性判定の精密化
    calculateUrgencyScore(article) {
        const publishTime = new Date(article.publishedAt).getTime();
        const now = Date.now();
        const hoursAgo = (now - publishTime) / (1000 * 60 * 60);
        
        let timeScore = 0;
        if (hoursAgo <= 1) timeScore = 100;
        else if (hoursAgo <= 3) timeScore = 90;
        else if (hoursAgo <= 6) timeScore = 75;
        else if (hoursAgo <= 12) timeScore = 50;
        else if (hoursAgo <= 24) timeScore = 25;
        else timeScore = 10;
        
        // 緊急度カテゴリ判定
        const urgencyCategory = this.determineUrgencyCategory(article);
        const categoryMultiplier = this.getUrgencyMultiplier(urgencyCategory);
        
        return Math.min(100, timeScore * categoryMultiplier);
    }

    determineUrgencyCategory(article) {
        const content = (article.title + ' ' + article.description).toLowerCase();
        
        if (content.match(/launch|release|announce|reveal|breaking/)) {
            return 'urgent';
        } else if (content.match(/event|convention|interview|preview/)) {
            return 'important';
        } else if (content.match(/review|opinion|analysis/)) {
            return 'notable';
        }
        
        return 'general';
    }

    getUrgencyMultiplier(category) {
        const multipliers = {
            'urgent': 1.0,
            'important': 0.8,
            'notable': 0.6,
            'general': 0.4
        };
        
        return multipliers[category] || 0.4;
    }

    // ユーティリティ関数
    applySeasonalWeights(keywords, season) {
        // 季節に応じたキーワードの重み付け
        return keywords.sort(() => 0.5 - Math.random()); // 暫定実装
    }

    getCurrentSeason() {
        const month = new Date().getMonth();
        if (month >= 2 && month <= 4) return 'spring';
        if (month >= 5 && month <= 7) return 'summer';
        if (month >= 8 && month <= 10) return 'autumn';
        return 'winter';
    }

    calculateSeasonalWeights() {
        // 季節ごとの検索重み付け設定
        return {
            winter: { 'Christmas game': 1.5, 'family game': 1.3 },
            spring: { 'new release': 1.4, 'Kickstarter': 1.2 },
            summer: { 'convention': 1.6, 'preview': 1.3 },
            autumn: { 'award': 1.4, 'best of': 1.3 }
        };
    }

    initializeSourceReliability() {
        // ソース信頼性データベースの初期化
        this.sourceReliability.set('Board Game Quest', 95);
        this.sourceReliability.set('BoardGameGeek', 92);
        this.sourceReliability.set('The Dice Tower', 90);
        this.sourceReliability.set('Meeple Mountain', 88);
        this.sourceReliability.set('Shut Up & Sit Down', 85);
    }

    estimateSourceReliability(source) {
        return this.sourceReliability.get(source) || 70;
    }

    async waitForRateLimit(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    deduplicateAndRank(articles) {
        // 重複除去
        const unique = this.removeDuplicates(articles);
        
        // 総合スコアによるランキング
        return unique.map(article => ({
            ...article,
            credibilityScore: this.calculateCredibilityScore(article),
            relevanceScore: this.calculateRelevanceScore(article),
            urgencyScore: this.calculateUrgencyScore(article)
        })).sort((a, b) => {
            const scoreA = a.credibilityScore + a.relevanceScore + a.urgencyScore;
            const scoreB = b.credibilityScore + b.relevanceScore + b.urgencyScore;
            return scoreB - scoreA;
        });
    }

    removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = article.url || article.title.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // メイン検索関数
    async getBoardGameNews(isScheduled = false) {
        try {
            const hoursLimit = isScheduled ? 12 : 6;
            console.log(`Advanced news search: ${hoursLimit} hours, scheduled: ${isScheduled}`);
            
            // 多層検索戦略を実行
            const rankedArticles = await this.performMultiLayerSearch(hoursLimit);
            
            if (rankedArticles.length === 0) {
                return this.getNoNewsMessage();
            }
            
            // 重複記事をフィルタリング
            const unpostedArticles = await this.filterUnpostedArticles(rankedArticles);
            
            if (unpostedArticles.length === 0) {
                return this.getNoNewsMessage();
            }
            
            return unpostedArticles.slice(0, 3);
            
        } catch (error) {
            console.error('Error in advanced news search:', error);
            return this.getNoNewsMessage();
        }
    }

    async filterUnpostedArticles(articles) {
        const DatabaseService = require('./databaseService');
        const db = new DatabaseService();
        
        try {
            await db.init();
            
            const unpostedArticles = [];
            for (const article of articles) {
                const query = 'SELECT COUNT(*) as count FROM news_posts WHERE url = $1';
                const result = await db.getQuery(query, [article.url]);
                
                if (result[0].count === 0) {
                    unpostedArticles.push(article);
                }
            }
            
            return unpostedArticles;
        } catch (error) {
            console.error('Error filtering unposted articles:', error);
            return articles;
        }
    }

    async markArticlesAsPosted(articles) {
        const DatabaseService = require('./databaseService');
        const db = new DatabaseService();
        
        try {
            await db.init();
            
            for (const article of articles) {
                await db.saveNewsPost(article.title, article.url, article.description);
            }
        } catch (error) {
            console.error('Error marking articles as posted:', error);
        }
    }

    getNoNewsMessage() {
        return [{
            title: 'ニュースなし',
            description: '直近24時間以内にめぼしいニュースはありませんでしたヨモ',
            url: '',
            publishedAt: new Date().toISOString(),
            source: 'YOLUBot',
            content: '直近24時間以内にめぼしいニュースはありませんでしたヨモ',
            isNoNewsMessage: true,
            credibilityScore: 0,
            relevanceScore: 0,
            urgencyScore: 0
        }];
    }
}

module.exports = AdvancedNewsService;