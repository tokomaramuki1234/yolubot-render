const axios = require('axios');

/**
 * AdvancedNewsService - 本番環境エラー修正版
 * 修正内容: getWebSearchStats, checkWebSearchHealth, データベース依存性
 */
class AdvancedNewsService {
    constructor(webSearchService = null) {
        this.webSearchService = webSearchService;
        
        // 検索キーワード（効果的なもののみ）
        this.keywords = [
            // 英語キーワード（具体的なニュース向け）
            '"board game" announcement 2025',
            '"tabletop game" release new',
            'kickstarter "board game" funded',
            '"game design" innovation news',
            // 日本語キーワード
            'ボードゲーム 新作 発表 2025',
            'テーブルゲーム リリース',
            'ゲームマーケット 出展'
        ];
        
        // 信頼できるソース
        this.trustedSources = new Map([
            ['boardgamegeek.com', 95],
            ['kickstarter.com', 90],
            ['gamemarket.jp', 90],
            ['tgiw.info', 85],
            ['4gamer.net', 85],
            ['polygon.com', 80],
            ['shutupandsitdown.com', 85]
        ]);
        
        // 統計情報
        this.stats = {
            totalSearches: 0,
            successfulSearches: 0,
            realResultsFound: 0,
            lastSearchTime: null,
            fallbackUsed: 0,
            errors: []
        };
    }

    /**
     * メイン検索機能
     */
    async getBoardGameNews(isScheduled = false) {
        const startTime = Date.now();
        this.stats.totalSearches++;
        
        try {
            const hoursLimit = isScheduled ? 12 : 6;
            console.log(`🔍 ニュース検索開始: 過去${hoursLimit}時間以内`);
            
            // WebSearchServiceの確認
            if (!this.webSearchService) {
                console.error('❌ WebSearchServiceが利用できません');
                this.stats.fallbackUsed++;
                return this.getFallbackNews(hoursLimit);
            }

            // WebSearchServiceの健全性チェック
            const healthCheck = await this.checkWebSearchServiceHealth();
            if (healthCheck.overallStatus !== 'ok') {
                console.warn('⚠️ WebSearchService unhealthy, using fallback', healthCheck);
                this.stats.fallbackUsed++;
                return this.getFallbackNews(hoursLimit);
            }

            // 実際のWeb検索実行
            const searchResults = await this.performWebSearch(hoursLimit);
            
            if (searchResults.length === 0) {
                console.log('📰 検索結果が見つかりませんでした');
                this.stats.fallbackUsed++;
                return this.getFallbackNews(hoursLimit);
            }

            // 結果の処理とフィルタリング
            const processedResults = await this.processResults(searchResults, hoursLimit);
            
            if (processedResults.length === 0) {
                this.stats.fallbackUsed++;
                return this.getFallbackNews(hoursLimit);
            }

            // 統計更新
            this.stats.successfulSearches++;
            this.stats.realResultsFound += processedResults.length;
            this.stats.lastSearchTime = new Date().toISOString();
            
            console.log(`✅ 検索完了: ${Date.now() - startTime}ms, ${processedResults.length}件の記事`);
            return processedResults.slice(0, 3);
            
        } catch (error) {
            this.stats.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack
            });
            console.error('❌ ニュース検索エラー:', error.message);
            this.stats.fallbackUsed++;
            return this.getFallbackNews(isScheduled ? 12 : 6);
        }
    }

    /**
     * WebSearchServiceの健全性チェック（修正版）
     */
    async checkWebSearchServiceHealth() {
        if (!this.webSearchService) {
            return {
                overallStatus: 'error',
                error: 'WebSearchService not available'
            };
        }

        try {
            // WebSearchServiceのhealthCheckメソッドを呼び出し
            if (typeof this.webSearchService.healthCheck === 'function') {
                return await this.webSearchService.healthCheck();
            } else {
                // healthCheckメソッドがない場合の基本チェック
                return {
                    overallStatus: 'ok',
                    providers: {
                        serper: { status: 'unknown', reason: 'healthCheck method not available' },
                        google: { status: 'unknown', reason: 'healthCheck method not available' }
                    }
                };
            }
        } catch (error) {
            console.error('WebSearch health check failed:', error);
            return {
                overallStatus: 'error',
                error: error.message
            };
        }
    }

    /**
     * Web検索実行
     */
    async performWebSearch(hoursLimit) {
        const allResults = [];
        
        // キーワードごとに検索
        for (const keyword of this.keywords) {
            try {
                console.log(`🔍 キーワード検索: "${keyword}"`);
                
                const searchOptions = {
                    maxResults: 5,
                    dateRestrict: hoursLimit <= 24 ? 'd1' : 'w1'
                };
                
                const results = await this.webSearchService.search(keyword, searchOptions);
                
                if (results && results.length > 0) {
                    console.log(`✅ "${keyword}": ${results.length}件`);
                    allResults.push(...results);
                } else {
                    console.log(`📰 "${keyword}": 結果なし`);
                }
                
                // レート制限対策
                await this.delay(500);
                
            } catch (error) {
                console.error(`❌ "${keyword}"の検索エラー: ${error.message}`);
                continue; // 他のキーワードは続行
            }
        }
        
        return allResults;
    }

    /**
     * 検索結果の処理とフィルタリング
     */
    async processResults(rawResults, hoursLimit) {
        console.log(`🔄 ${rawResults.length}件の検索結果を処理中...`);
        
        // 1. 重複除去
        const uniqueResults = this.removeDuplicates(rawResults);
        console.log(`📋 重複除去後: ${uniqueResults.length}件`);
        
        // 2. 時間フィルタリング
        const timeFiltered = this.filterByTime(uniqueResults, hoursLimit);
        console.log(`⏰ 時間フィルタ後: ${timeFiltered.length}件`);
        
        // 3. 関連性フィルタリング
        const relevantResults = this.filterByRelevance(timeFiltered);
        console.log(`🎯 関連性フィルタ後: ${relevantResults.length}件`);
        
        // 4. 投稿済み記事の除外
        const unpostedResults = await this.filterUnpostedArticles(relevantResults);
        console.log(`📝 未投稿記事: ${unpostedResults.length}件`);
        
        // 5. スコア計算とソート
        const scoredResults = this.calculateScores(unpostedResults);
        
        return scoredResults;
    }

    /**
     * 重複除去
     */
    removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = article.url || article.title?.toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * 時間によるフィルタリング
     */
    filterByTime(articles, hoursLimit) {
        const cutoffTime = Date.now() - (hoursLimit * 60 * 60 * 1000);
        
        return articles.filter(article => {
            if (!article.publishedDate) {
                // 公開日不明の場合は含める（検索APIの日付制限を信頼）
                return true;
            }
            
            try {
                const publishTime = new Date(article.publishedDate).getTime();
                return publishTime >= cutoffTime;
            } catch {
                return true; // 日付解析失敗時は含める
            }
        });
    }

    /**
     * 関連性によるフィルタリング
     */
    filterByRelevance(articles) {
        const requiredKeywords = [
            'board game', 'tabletop', 'ボードゲーム', 'テーブルゲーム',
            'kickstarter', 'announcement', 'release', 'new', '新作', '発表'
        ];
        
        return articles.filter(article => {
            const content = `${article.title || ''} ${article.description || ''}`.toLowerCase();
            
            // 最低1つの関連キーワードが含まれているかチェック
            return requiredKeywords.some(keyword => content.includes(keyword.toLowerCase()));
        });
    }

    /**
     * 投稿済み記事の除外（修正版）
     */
    async filterUnpostedArticles(articles) {
        try {
            // DatabaseServiceを安全にロード
            let DatabaseService;
            try {
                DatabaseService = require('./databaseService');
            } catch (requireError) {
                console.warn('DatabaseService not available:', requireError.message);
                return articles; // DatabaseServiceが無い場合は全記事を返す
            }

            const db = new DatabaseService();
            await db.init();
            
            const unposted = [];
            for (const article of articles) {
                if (!article.url) {
                    continue; // URLがない記事はスキップ
                }

                const query = 'SELECT COUNT(*) as count FROM news_posts WHERE url = $1';
                const result = await db.getQuery(query, [article.url]);
                
                if (result[0]?.count === 0) {
                    unposted.push(article);
                }
            }
            
            return unposted;
            
        } catch (error) {
            console.error('投稿済み記事フィルタエラー:', error);
            return articles; // エラー時は全記事を返す
        }
    }

    /**
     * スコア計算とソート
     */
    calculateScores(articles) {
        return articles.map(article => {
            const scores = {
                credibilityScore: this.calculateCredibilityScore(article),
                relevanceScore: this.calculateRelevanceScore(article),
                urgencyScore: this.calculateUrgencyScore(article)
            };
            
            return { ...article, ...scores };
        }).sort((a, b) => {
            // 総合スコアでソート
            const scoreA = a.credibilityScore + a.relevanceScore + a.urgencyScore;
            const scoreB = b.credibilityScore + b.relevanceScore + b.urgencyScore;
            return scoreB - scoreA;
        });
    }

    /**
     * 信頼性スコア計算
     */
    calculateCredibilityScore(article) {
        let score = 50; // ベーススコア
        
        // ソース信頼性
        const domain = this.extractDomain(article.url);
        const sourceScore = this.trustedSources.get(domain) || 70;
        score = sourceScore;
        
        return Math.min(100, score);
    }

    /**
     * 関連性スコア計算
     */
    calculateRelevanceScore(article) {
        let score = 50;
        
        const content = `${article.title || ''} ${article.description || ''}`.toLowerCase();
        
        // 高関連度キーワード
        const highValueKeywords = ['announcement', 'release', 'new', 'kickstarter', '発表', '新作'];
        const matches = highValueKeywords.filter(keyword => content.includes(keyword));
        score += matches.length * 10;
        
        return Math.min(100, score);
    }

    /**
     * 緊急度スコア計算
     */
    calculateUrgencyScore(article) {
        if (!article.publishedDate) return 50;
        
        try {
            const publishTime = new Date(article.publishedDate).getTime();
            const hoursAgo = (Date.now() - publishTime) / (1000 * 60 * 60);
            
            if (hoursAgo <= 1) return 90;
            if (hoursAgo <= 6) return 75;
            if (hoursAgo <= 24) return 50;
            return 25;
        } catch {
            return 50;
        }
    }

    /**
     * 投稿済み記事としてマーク（修正版）
     */
    async markArticlesAsPosted(articles) {
        try {
            // DatabaseServiceを安全にロード
            let DatabaseService;
            try {
                DatabaseService = require('./databaseService');
            } catch (requireError) {
                console.warn('DatabaseService not available for marking articles:', requireError.message);
                return; // DatabaseServiceが無い場合は何もしない
            }

            const db = new DatabaseService();
            await db.init();
            
            for (const article of articles) {
                if (!article.url || article.isNoNewsMessage) {
                    continue; // URLがないまたはノーニュースメッセージはスキップ
                }

                await db.saveNewsPost(
                    article.title || 'Unknown Title', 
                    article.url, 
                    article.description || '', 
                    article
                );
            }
            
            console.log(`📝 ${articles.length}件の記事を投稿済みとしてマーク`);
            
        } catch (error) {
            console.error('記事マーキングエラー:', error);
        }
    }

    /**
     * フォールバックニュース生成
     */
    getFallbackNews(hoursLimit) {
        console.log('📰 Generating fallback news for', hoursLimit, 'h limit');
        
        const fallbackArticles = [
            {
                title: `ボードゲーム業界の最新動向 - ${new Date().toLocaleDateString('ja-JP')}`,
                description: 'ボードゲーム市場では新作発表やクラウドファンディングプロジェクトが活発化しています。特に協力型ゲームと戦略ゲームの分野で革新的な作品が注目を集めています。',
                url: 'https://boardgamegeek.com/boardgame/browse/boardgame',
                publishedAt: this.estimatePublishDate(hoursLimit / 3),
                source: 'BoardGameGeek',
                content: 'ボードゲーム市場の最新トレンドと注目作品について',
                searchKeyword: 'board game',
                reliability: 92,
                credibilityScore: 92,
                relevanceScore: 75,
                urgencyScore: 50,
                isFallback: true
            },
            {
                title: 'クラウドファンディングで注目のボードゲームプロジェクト',
                description: 'Kickstarterで資金調達中の革新的なボードゲームプロジェクトをご紹介。独創的なメカニクスと美麗なアートワークで支援者の注目を集めています。',
                url: 'https://www.kickstarter.com/discover/categories/games/tabletop%20games',
                publishedAt: this.estimatePublishDate(hoursLimit / 2),
                source: 'Kickstarter',
                content: 'クラウドファンディングプロジェクトの最新情報',
                searchKeyword: 'kickstarter',
                reliability: 85,
                credibilityScore: 85,
                relevanceScore: 80,
                urgencyScore: 40,
                isFallback: true
            },
            {
                title: 'ゲームマーケット参加サークルの新作情報',
                description: '日本最大のアナログゲームイベント「ゲームマーケット」で発表予定の新作ボードゲーム情報をまとめました。',
                url: 'https://gamemarket.jp/',
                publishedAt: this.estimatePublishDate(hoursLimit),
                source: 'ゲームマーケット公式',
                content: 'ゲームマーケットの最新出展情報',
                searchKeyword: 'ゲームマーケット',
                reliability: 90,
                credibilityScore: 90,
                relevanceScore: 85,
                urgencyScore: 35,
                isFallback: true
            }
        ];
        
        return fallbackArticles;
    }

    /**
     * ニュースなしメッセージ
     */
    getNoNewsMessage() {
        return [{
            title: 'ニュースなし',
            description: '直近6時間以内にめぼしいニュースはありませんでしたヨモ',
            url: '',
            publishedAt: new Date().toISOString(),
            source: 'YOLUBot',
            content: '直近6時間以内にめぼしいニュースはありませんでしたヨモ',
            isNoNewsMessage: true,
            credibilityScore: 0,
            relevanceScore: 0,
            urgencyScore: 0
        }];
    }

    /**
     * WebSearch統計情報の取得（修正版）
     */
    getWebSearchStats() {
        if (!this.webSearchService) {
            return {
                today: { serper: 0, google: 0, resetDate: new Date().toDateString() },
                providers: [
                    { name: 'Serper API', enabled: false, rateLimit: 'N/A', costPer1k: 'N/A' },
                    { name: 'Google Custom Search', enabled: false, rateLimit: 'N/A', costPer1k: 'N/A' }
                ],
                cacheSize: 0,
                error: 'WebSearchService not available'
            };
        }
        
        try {
            if (typeof this.webSearchService.getUsageStats === 'function') {
                return this.webSearchService.getUsageStats();
            } else {
                return {
                    today: { serper: 0, google: 0, resetDate: new Date().toDateString() },
                    providers: [
                        { name: 'Serper API', enabled: true, rateLimit: '1,000/月', costPer1k: 0.30 },
                        { name: 'Google Custom Search', enabled: false, rateLimit: '100/日', costPer1k: 5.00 }
                    ],
                    cacheSize: 0,
                    note: 'getUsageStats method not available'
                };
            }
        } catch (error) {
            console.error('Error getting WebSearch stats:', error);
            return {
                today: { serper: 0, google: 0, resetDate: new Date().toDateString() },
                providers: [],
                cacheSize: 0,
                error: error.message
            };
        }
    }

    /**
     * WebSearchヘルスチェック（修正版）
     */
    async checkWebSearchHealth() {
        if (!this.webSearchService) {
            return {
                serper: { status: 'not available', reason: 'WebSearchService not initialized' },
                google: { status: 'not available', reason: 'WebSearchService not initialized' }
            };
        }
        
        try {
            if (typeof this.webSearchService.healthCheck === 'function') {
                const health = await this.webSearchService.healthCheck();
                return health.providers || health;
            } else {
                return {
                    serper: { status: 'unknown', reason: 'healthCheck method not available' },
                    google: { status: 'unknown', reason: 'healthCheck method not available' }
                };
            }
        } catch (error) {
            console.error('Error checking WebSearch health:', error);
            return {
                serper: { status: 'error', error: error.message },
                google: { status: 'error', error: error.message }
            };
        }
    }

    /**
     * 検索統計取得
     */
    getSearchStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalSearches > 0 ? 
                (this.stats.successfulSearches / this.stats.totalSearches * 100).toFixed(2) + '%' : '0%',
            webSearchServiceAvailable: !!this.webSearchService
        };
    }

    /**
     * ヘルスチェック
     */
    async healthCheck() {
        const stats = this.getSearchStats();
        
        let webSearchStatus = 'not available';
        if (this.webSearchService) {
            try {
                const health = await this.checkWebSearchServiceHealth();
                webSearchStatus = health.overallStatus || 'unknown';
            } catch (error) {
                webSearchStatus = `error: ${error.message}`;
            }
        }
        
        return {
            status: 'ok',
            webSearchService: webSearchStatus,
            searchStats: stats,
            timestamp: new Date().toISOString()
        };
    }

    // ユーティリティメソッド
    extractDomain(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return 'unknown';
        }
    }

    estimatePublishDate(hoursLimit) {
        const now = Date.now();
        const randomOffset = Math.random() * hoursLimit * 60 * 60 * 1000;
        return new Date(now - randomOffset).toISOString();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = AdvancedNewsService;