const axios = require('axios');

class AdvancedNewsService {
    constructor(webSearchService = null) {
        // WebSearchServiceの依存性注入
        this.webSearchService = webSearchService;
        
        // 検索設定を簡素化・最適化
        this.searchConfig = {
            maxResultsPerKeyword: 3,
            maxKeywordsPerLayer: 5,
            rateLimit: 1000,
            timeoutMs: 10000
        };
        
        this.searchLayers = {
            layer1: this.getGeneralBoardGameKeywords(),
            layer2: this.getManufacturerDesignerKeywords(),
            layer3: this.getEventExhibitionKeywords(),
            layer4: this.getIndustryTrendKeywords()
        };
        
        // 信頼性マップを簡素化
        this.sourceReliability = this.initializeSourceReliability();
        
        // 統計情報の追加
        this.searchStats = {
            totalSearches: 0,
            successfulSearches: 0,
            failedSearches: 0,
            lastSearchTime: null,
            errors: []
        };
    }

    // キーワード定義（変更なし）
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

    // メイン検索機能の改善
    async getBoardGameNews(isScheduled = false) {
        const startTime = Date.now();
        this.searchStats.totalSearches++;
        
        try {
            const hoursLimit = isScheduled ? 12 : 6;
            console.log(`🔍 Starting advanced news search: ${hoursLimit} hours, scheduled: ${isScheduled}`);
            
            // WebSearchServiceの存在確認
            if (!this.webSearchService) {
                console.warn('⚠️ WebSearchService not available, using fallback mode');
                return await this.getFallbackNews(hoursLimit);
            }

            // 実際のWeb検索実行
            const searchResults = await this.performMultiLayerSearch(hoursLimit);
            
            if (searchResults.length === 0) {
                console.log('📰 No search results found, returning fallback');
                return await this.getFallbackNews(hoursLimit);
            }

            // 重複記事フィルタリング
            const uniqueArticles = await this.filterUnpostedArticles(searchResults);
            
            if (uniqueArticles.length === 0) {
                return this.getNoNewsMessage();
            }

            this.searchStats.successfulSearches++;
            this.searchStats.lastSearchTime = new Date().toISOString();
            
            console.log(`✅ Search completed in ${Date.now() - startTime}ms, found ${uniqueArticles.length} articles`);
            return uniqueArticles.slice(0, 3);
            
        } catch (error) {
            this.searchStats.failedSearches++;
            this.searchStats.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack
            });
            
            console.error('❌ Error in advanced news search:', error);
            
            // エラー時はフォールバックニュースを返す
            return await this.getFallbackNews(isScheduled ? 12 : 6);
        }
    }

    // 改善された多層検索
    async performMultiLayerSearch(hoursLimit) {
        const allResults = [];
        
        for (const [layerName, keywords] of Object.entries(this.searchLayers)) {
            console.log(`🔍 Executing search layer: ${layerName}`);
            
            try {
                const layerResults = await this.executeLayerSearch(keywords, hoursLimit);
                allResults.push(...layerResults);
                
                // レート制限対応
                await this.delay(this.searchConfig.rateLimit);
                
            } catch (error) {
                console.error(`❌ Layer ${layerName} failed:`, error.message);
                // レイヤーが失敗しても他のレイヤーは続行
                continue;
            }
        }
        
        return this.processAndRankResults(allResults);
    }

    // レイヤー検索の改善
    async executeLayerSearch(keywords, hoursLimit) {
        const results = [];
        const selectedKeywords = keywords.slice(0, this.searchConfig.maxKeywordsPerLayer);
        
        // 並列検索でパフォーマンス向上
        const searchPromises = selectedKeywords.map(keyword => 
            this.searchWithKeyword(keyword, hoursLimit)
        );
        
        try {
            const searchResults = await Promise.allSettled(searchPromises);
            
            searchResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    results.push(...result.value);
                } else {
                    console.warn(`⚠️ Search failed for keyword: ${selectedKeywords[index]}`);
                }
            });
            
        } catch (error) {
            console.error('❌ Parallel search execution failed:', error);
        }
        
        return results;
    }

    // キーワード検索の改善
    async searchWithKeyword(keyword, hoursLimit) {
        try {
            console.log(`🔍 Searching for: "${keyword}"`);
            
            // WebSearchServiceが利用可能な場合の実際の検索
            if (this.webSearchService && typeof this.webSearchService.search === 'function') {
                const webResults = await this.performRealWebSearch(keyword, hoursLimit);
                if (webResults && webResults.length > 0) {
                    console.log(`✅ Found ${webResults.length} real results for "${keyword}"`);
                    return webResults;
                }
            }
            
            // フォールバック検索
            console.log(`📰 Using fallback data for "${keyword}"`);
            return await this.generateKeywordBasedNews(keyword, hoursLimit);
            
        } catch (error) {
            console.error(`❌ Search error for "${keyword}":`, error.message);
            return [];
        }
    }

    // 実際のWeb検索（改善版）
    async performRealWebSearch(keyword, hoursLimit) {
        if (!this.webSearchService) {
            throw new Error('WebSearchService not available');
        }
        
        try {
            const searchQuery = this.buildSearchQuery(keyword, hoursLimit);
            const searchOptions = this.buildSearchOptions(hoursLimit);
            
            console.log(`🔍 Real web search: "${searchQuery}"`);
            
            // タイムアウト付きで検索実行
            const searchResults = await Promise.race([
                this.webSearchService.search(searchQuery, searchOptions),
                this.timeoutPromise(this.searchConfig.timeoutMs)
            ]);
            
            if (!searchResults || searchResults.length === 0) {
                console.log('📰 No web search results found');
                return [];
            }
            
            // 結果を標準形式に変換
            const processedResults = searchResults.map(result => 
                this.processSearchResult(result, keyword)
            ).filter(result => result !== null);
            
            // 精密時間制御 - 後処理での正確なフィルタリング
            const timeFilteredResults = this.applyPreciseTimeFilter(processedResults, hoursLimit);
            
            console.log(`✅ Processed ${processedResults.length} web search results, ${timeFilteredResults.length} after time filtering`);
            return timeFilteredResults;
            
        } catch (error) {
            console.error(`❌ Real web search failed for "${keyword}":`, error.message);
            throw error;
        }
    }

    // 改善された検索クエリ構築 - キーワードタイプ別最適化
    buildSearchQuery(keyword, hoursLimit) {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        
        // キーワードタイプ別の最適化クエリ生成
        let optimizedQuery = '';
        
        if (this.isManufacturerKeyword(keyword)) {
            // メーカー・デザイナー専用クエリ
            optimizedQuery = `"${keyword}" (announcement OR release OR new game) ${currentYear}`;
        } else if (this.isEventKeyword(keyword)) {
            // イベント専用クエリ
            optimizedQuery = `"${keyword}" (preview OR showcase OR reveal) ${currentYear}`;
        } else if (this.isJapaneseKeyword(keyword)) {
            // 日本語キーワード専用クエリ
            optimizedQuery = `"${keyword}" (発表 OR 新作 OR リリース) ${currentYear}`;
        } else {
            // 一般キーワード専用クエリ - より具体的に
            optimizedQuery = `"${keyword}" (board game OR tabletop) (news OR announcement OR release) ${currentYear}`;
        }
        
        // 時間制限による追加フィルタ
        if (hoursLimit <= 6) {
            optimizedQuery += ` "${currentMonth}"`;
        }
        
        return optimizedQuery;
    }

    // 改善された検索オプション構築 - 多言語対応
    buildSearchOptions(hoursLimit) {
        return {
            maxResults: Math.max(this.searchConfig.maxResultsPerKeyword * 2, 6), // 選択肢を増やす
            language: 'auto', // 日本語・英語を自動選択
            dateRestrict: this.getPreciseDateRestriction(hoursLimit)
        };
    }

    // 精密時間制御 - 後処理での正確なフィルタリング
    getPreciseDateRestriction(hoursLimit) {
        // 検索APIレベルでは緩い制限を設定
        if (hoursLimit <= 168) return 'w1'; // 1週間以内
        return 'm1'; // 1ヶ月以内
    }

    // キーワードタイプ判定ヘルパー
    isManufacturerKeyword(keyword) {
        const manufacturers = [
            'Asmodee', 'Fantasy Flight Games', 'Z-Man Games', 'Days of Wonder',
            'Stonemaier Games', 'CMON', 'Repos Production',
            'Uwe Rosenberg', 'Reiner Knizia', 'Stefan Feld',
            'アークライト', 'ホビージャパン', 'テンデイズゲームズ'
        ];
        return manufacturers.some(mfg => keyword.toLowerCase().includes(mfg.toLowerCase()));
    }

    isEventKeyword(keyword) {
        const events = [
            'Essen Spiel', 'Gen Con', 'Origins Game Fair', 'BGG Con',
            'Tokyo Game Market', 'Spielwarenmesse', 'SPIEL',
            'ゲームマーケット', 'ボードゲームフェスティバル'
        ];
        return events.some(event => keyword.toLowerCase().includes(event.toLowerCase()));
    }

    isJapaneseKeyword(keyword) {
        return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(keyword);
    }

    // 精密時間フィルタリング
    applyPreciseTimeFilter(results, hoursLimit) {
        if (!hoursLimit || hoursLimit >= 168) {
            return results; // 長期間の場合はフィルタリングしない
        }

        const now = Date.now();
        const cutoffTime = now - (hoursLimit * 60 * 60 * 1000);

        return results.filter(result => {
            try {
                const publishTime = new Date(result.publishedAt).getTime();
                const isWithinTimeLimit = publishTime >= cutoffTime;
                
                if (!isWithinTimeLimit) {
                    console.log(`⏰ Filtered out article: "${result.title}" (published ${Math.round((now - publishTime) / (1000 * 60 * 60))}h ago)`);
                }
                
                return isWithinTimeLimit;
            } catch (error) {
                console.warn(`⚠️ Failed to parse publish date for: "${result.title}"`);
                return true; // 日付解析に失敗した場合は含める
            }
        });
    }

    // 検索結果処理
    processSearchResult(result, keyword) {
        try {
            return {
                title: this.cleanTitle(result.title) || `Latest ${keyword} News`,
                description: this.cleanDescription(result.description || result.snippet) || 
                           `Recent news about ${keyword}`,
                url: result.url || result.link,
                publishedAt: result.publishedDate || this.estimatePublishDate(6),
                source: result.source || this.extractSourceName(result.url || result.link) || 'Web Search',
                content: result.description || result.snippet || `Recent news about ${keyword}`,
                searchKeyword: keyword,
                reliability: this.estimateWebSourceReliability(result.url || result.link),
                provider: result.provider || 'unknown'
            };
        } catch (error) {
            console.error('❌ Error processing search result:', error);
            return null;
        }
    }

    // フォールバックニュース生成（改善版）
    async getFallbackNews(hoursLimit) {
        console.log('📰 Generating fallback news');
        
        const fallbackArticles = [
            {
                title: `ボードゲーム業界の最新動向 - ${new Date().toLocaleDateString('ja-JP')}`,
                description: 'ボードゲーム市場では新作発表やクラウドファンディングプロジェクトが活発化しています。特に協力型ゲームと戦略ゲームの分野で革新的な作品が注目を集めています。',
                url: 'https://boardgamegeek.com/boardgame/browse/boardgame',
                publishedAt: this.estimatePublishDate(hoursLimit / 3),
                source: 'BoardGameGeek',
                content: 'ボードゲーム市場の最新トレンドと注目作品について',
                searchKeyword: 'board game',
                reliability: 92
            },
            {
                title: 'クラウドファンディングで注目のボードゲームプロジェクト',
                description: 'Kickstarterで資金調達中の革新的なボードゲームプロジェクトをご紹介。独創的なメカニクスと美麗なアートワークで支援者の注目を集めています。',
                url: 'https://www.kickstarter.com/discover/categories/games/tabletop%20games',
                publishedAt: this.estimatePublishDate(hoursLimit / 2),
                source: 'Kickstarter',
                content: 'クラウドファンディングプロジェクトの最新情報',
                searchKeyword: 'kickstarter',
                reliability: 85
            },
            {
                title: 'ゲームマーケット参加サークルの新作情報',
                description: '日本最大のアナログゲームイベント「ゲームマーケット」で発表予定の新作ボードゲーム情報をまとめました。',
                url: 'https://gamemarket.jp/',
                publishedAt: this.estimatePublishDate(hoursLimit),
                source: 'ゲームマーケット公式',
                content: 'ゲームマーケットの最新出展情報',
                searchKeyword: 'ゲームマーケット',
                reliability: 90
            }
        ];
        
        return fallbackArticles.map(article => ({
            ...article,
            credibilityScore: this.calculateCredibilityScore(article),
            relevanceScore: this.calculateRelevanceScore(article),
            urgencyScore: this.calculateUrgencyScore(article),
            isFallback: true
        }));
    }

    // 結果処理とランキング（簡素化）
    processAndRankResults(articles) {
        // 重複除去
        const uniqueArticles = this.removeDuplicates(articles);
        
        // スコア計算とランキング
        return uniqueArticles.map(article => ({
            ...article,
            credibilityScore: this.calculateCredibilityScore(article),
            relevanceScore: this.calculateRelevanceScore(article),
            urgencyScore: this.calculateUrgencyScore(article)
        })).sort((a, b) => {
            const scoreA = (a.credibilityScore + a.relevanceScore + a.urgencyScore) / 3;
            const scoreB = (b.credibilityScore + b.relevanceScore + b.urgencyScore) / 3;
            return scoreB - scoreA;
        });
    }

    // 信頼性スコア計算（簡素化）
    calculateCredibilityScore(article) {
        let score = 0;
        
        // ソース信頼性（50点）
        score += this.sourceReliability.get(article.source) || 50;
        
        // 鮮度評価（25点）
        score += this.evaluateFreshness(article.publishedAt);
        
        // URL信頼性（25点）
        score += this.evaluateUrlReliability(article.url);
        
        return Math.min(100, score);
    }

    // 関連性スコア計算（簡素化）
    calculateRelevanceScore(article) {
        let score = 50; // ベーススコア
        
        const content = (article.title + ' ' + article.description).toLowerCase();
        
        // ボードゲーム関連キーワードチェック
        const relevantKeywords = [
            'board game', 'tabletop', 'ボードゲーム', 'kickstarter',
            'game design', 'publisher', 'designer', 'release', 'announcement'
        ];
        
        const matches = relevantKeywords.filter(keyword => content.includes(keyword));
        score += matches.length * 5;
        
        return Math.min(100, score);
    }

    // 緊急度スコア計算（簡素化）
    calculateUrgencyScore(article) {
        const publishTime = new Date(article.publishedAt).getTime();
        const now = Date.now();
        const hoursAgo = (now - publishTime) / (1000 * 60 * 60);
        
        if (hoursAgo <= 1) return 90;
        if (hoursAgo <= 6) return 75;
        if (hoursAgo <= 24) return 50;
        if (hoursAgo <= 168) return 25;
        return 10;
    }

    // ユーティリティ関数
    cleanTitle(title) {
        if (!title) return null;
        return title
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
    }

    cleanDescription(description) {
        if (!description) return null;
        return description
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\.{3,}/g, '...')
            .trim()
            .substring(0, 300);
    }

    estimatePublishDate(hoursLimit) {
        const now = Date.now();
        const randomOffset = Math.random() * hoursLimit * 60 * 60 * 1000;
        return new Date(now - randomOffset).toISOString();
    }

    extractSourceName(url) {
        if (!url) return null;
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
        } catch {
            return null;
        }
    }

    estimateWebSourceReliability(url) {
        if (!url) return 70;
        
        const domain = url.toLowerCase();
        const reliabilityMap = {
            'boardgamegeek.com': 95,
            'kickstarter.com': 85,
            'gamemarket.jp': 90,
            'spiel-des-jahres.de': 95,
            'gencon.com': 85,
            'asmodee.com': 90,
            'shutupandsitdown.com': 85,
            'polygon.com': 80,
            'ign.com': 75
        };

        for (const [key, value] of Object.entries(reliabilityMap)) {
            if (domain.includes(key)) return value;
        }
        
        return 70;
    }

    evaluateFreshness(publishedAt) {
        const now = Date.now();
        const published = new Date(publishedAt).getTime();
        const hoursAgo = (now - published) / (1000 * 60 * 60);
        
        if (hoursAgo <= 1) return 25;
        if (hoursAgo <= 6) return 20;
        if (hoursAgo <= 24) return 15;
        if (hoursAgo <= 168) return 10;
        return 5;
    }

    evaluateUrlReliability(url) {
        if (!url) return 10;
        if (url.includes('official') || url.includes('press-release')) return 25;
        if (url.includes('news') || url.includes('announcement')) return 20;
        return 15;
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

    initializeSourceReliability() {
        return new Map([
            ['Board Game Quest', 95],
            ['BoardGameGeek', 92],
            ['The Dice Tower', 90],
            ['Meeple Mountain', 88],
            ['Shut Up & Sit Down', 85],
            ['Kickstarter', 85],
            ['ゲームマーケット公式', 90],
            ['Asmodee', 90],
            ['IGN', 75],
            ['Polygon', 80]
        ]);
    }

    async filterUnpostedArticles(articles) {
        try {
            const DatabaseService = require('./databaseService');
            const db = new DatabaseService();
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
        try {
            const DatabaseService = require('./databaseService');
            const db = new DatabaseService();
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

    // ヘルパー関数
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async timeoutPromise(ms) {
        return new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Search timeout')), ms)
        );
    }

    // 統計情報とデバッグ機能
    getSearchStats() {
        return {
            ...this.searchStats,
            successRate: this.searchStats.totalSearches > 0 ? 
                (this.searchStats.successfulSearches / this.searchStats.totalSearches * 100).toFixed(2) + '%' : '0%',
            webSearchServiceAvailable: !!this.webSearchService
        };
    }

    // WebSearch統計情報の取得
    getWebSearchStats() {
        if (!this.webSearchService || typeof this.webSearchService.getUsageStats !== 'function') {
            return {
                today: { serper: 0, google: 0, resetDate: new Date().toDateString() },
                providers: [
                    { name: 'Serper API', enabled: false, rateLimit: 'N/A', costPer1k: 'N/A' },
                    { name: 'Google Custom Search', enabled: false, rateLimit: 'N/A', costPer1k: 'N/A' }
                ],
                cacheSize: 0,
                error: 'WebSearchService not available or missing getUsageStats method'
            };
        }
        
        try {
            return this.webSearchService.getUsageStats();
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

    // WebSearchヘルスチェック
    async checkWebSearchHealth() {
        if (!this.webSearchService || typeof this.webSearchService.healthCheck !== 'function') {
            return {
                serper: { status: 'not available', reason: 'WebSearchService not initialized' },
                google: { status: 'not available', reason: 'WebSearchService not initialized' }
            };
        }
        
        try {
            const healthStatus = await this.webSearchService.healthCheck();
            return healthStatus.providers || {
                serper: { status: 'unknown', reason: 'Health check returned unexpected format' },
                google: { status: 'unknown', reason: 'Health check returned unexpected format' }
            };
        } catch (error) {
            console.error('Error checking WebSearch health:', error);
            return {
                serper: { status: 'error', error: error.message },
                google: { status: 'error', error: error.message }
            };
        }
    }

    async healthCheck() {
        const stats = this.getSearchStats();
        
        let webSearchStatus = 'not available';
        if (this.webSearchService) {
            try {
                if (typeof this.webSearchService.healthCheck === 'function') {
                    await this.webSearchService.healthCheck();
                    webSearchStatus = 'available';
                } else {
                    webSearchStatus = 'available (no health check)';
                }
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
}

module.exports = AdvancedNewsService;
