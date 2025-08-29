// services/advancedNewsService.js
class AdvancedNewsService {
    constructor(webSearchService) {
        // WebSearchServiceの存在確認
        if (!webSearchService) {
            console.warn('⚠️  WebSearchService not provided, using fallback mode');
            this.webSearchService = null;
        } else {
            this.webSearchService = webSearchService;
        }
        
        // 設定の外部化
        this.config = this.loadConfiguration();
        
        // 検索レイヤーの構成
        this.searchLayers = this.initializeSearchLayers();
        
        // 統計情報
        this.searchStats = {
            totalSearches: 0,
            successfulSearches: 0,
            failedSearches: 0,
            lastSearchTime: null,
            realResultsFound: 0,
            fallbackUsed: 0
        };
    }

    loadConfiguration() {
        return {
            search: {
                maxResultsPerKeyword: parseInt(process.env.MAX_RESULTS_PER_KEYWORD) || 3,
                maxKeywordsPerLayer: parseInt(process.env.MAX_KEYWORDS_PER_LAYER) || 5,
                timeoutMs: parseInt(process.env.SEARCH_TIMEOUT_MS) || 15000,
                rateLimit: parseInt(process.env.SEARCH_RATE_LIMIT) || 2000
            },
            scoring: {
                credibilityWeight: parseFloat(process.env.CREDIBILITY_WEIGHT) || 0.5,
                relevanceWeight: parseFloat(process.env.RELEVANCE_WEIGHT) || 0.3,
                urgencyWeight: parseFloat(process.env.URGENCY_WEIGHT) || 0.2
            },
            fallback: {
                enabled: process.env.FALLBACK_ENABLED !== 'false',
                maxArticles: parseInt(process.env.FALLBACK_MAX_ARTICLES) || 3
            }
        };
    }

    async getBoardGameNews(isScheduled = false) {
        const startTime = Date.now();
        this.searchStats.totalSearches++;
        
        try {
            const hoursLimit = isScheduled ? 12 : 6;
            console.log(`🔍 Starting news search: ${hoursLimit}h limit, scheduled: ${isScheduled}`);
            
            // WebSearchServiceの利用可能性チェック
            if (!this.webSearchService) {
                console.log('⚠️ WebSearchService unavailable, using fallback');
                return await this.generateFallbackNews(hoursLimit);
            }
            
            // ヘルスチェック
            const health = await this.webSearchService.healthCheck();
            const healthyProviders = Object.values(health).some(h => h.status === 'healthy');
            
            if (!healthyProviders) {
                console.log('⚠️ No healthy search providers, using fallback');
                return await this.generateFallbackNews(hoursLimit);
            }
            
            // 実際のWeb検索実行
            const searchResults = await this.performWebSearch(hoursLimit);
            
            if (searchResults.length === 0) {
                console.log('📰 No search results found, using fallback');
                this.searchStats.fallbackUsed++;
                return await this.generateFallbackNews(hoursLimit);
            }
            
            // 結果処理
            const processedResults = await this.processSearchResults(searchResults);
            const rankedResults = this.rankResults(processedResults);
            
            this.searchStats.successfulSearches++;
            this.searchStats.realResultsFound += rankedResults.length;
            this.searchStats.lastSearchTime = new Date().toISOString();
            
            console.log(`✅ Search completed in ${Date.now() - startTime}ms`);
            return rankedResults.slice(0, 3);
            
        } catch (error) {
            this.searchStats.failedSearches++;
            console.error('❌ News search error:', error);
            
            // エラー時のフォールバック
            if (this.config.fallback.enabled) {
                return await this.generateFallbackNews(isScheduled ? 12 : 6);
            } else {
                return this.getNoNewsMessage();
            }
        }
    }

    async performWebSearch(hoursLimit) {
        const allResults = [];
        const searchPromises = [];
        
        // 並列検索の実行
        for (const [layerName, keywords] of Object.entries(this.searchLayers)) {
            const layerPromises = keywords
                .slice(0, this.config.search.maxKeywordsPerLayer)
                .map(keyword => this.searchKeyword(keyword, hoursLimit, layerName));
            
            searchPromises.push(...layerPromises);
        }
        
        try {
            // Promise.allSettledで部分的な失敗を許容
            const results = await Promise.allSettled(searchPromises);
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    allResults.push(...result.value);
                } else if (result.status === 'rejected') {
                    console.warn(`Search promise ${index} failed:`, result.reason.message);
                }
            });
            
        } catch (error) {
            console.error('Parallel search execution failed:', error);
        }
        
        return allResults;
    }

    async searchKeyword(keyword, hoursLimit, layer) {
        try {
            console.log(`🔍 Searching "${keyword}" in ${layer}`);
            
            const searchOptions = {
                maxResults: this.config.search.maxResultsPerKeyword,
                language: 'ja',
                dateRestrict: this.getDateRestriction(hoursLimit)
            };
            
            const results = await Promise.race([
                this.webSearchService.search(keyword, searchOptions),
                this.timeoutPromise(this.config.search.timeoutMs)
            ]);
            
            if (results && results.length > 0) {
                console.log(`✅ Found ${results.length} results for "${keyword}"`);
                return results.map(result => ({ ...result, searchKeyword: keyword, layer }));
            }
            
            return [];
        } catch (error) {
            console.error(`❌ Search failed for "${keyword}":`, error.message);
            return [];
        }
    }

    async processSearchResults(rawResults) {
        const cutoffTime = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6時間前
        
        return rawResults
            .filter(result => {
                // 時間フィルタ
                if (result.publishedDate) {
                    const publishTime = new Date(result.publishedDate);
                    if (publishTime < cutoffTime) return false;
                }
                
                // 信頼性フィルタ
                return this.isReliableSource(result.url);
            })
            .map(result => ({
                ...result,
                title: this.cleanTitle(result.title),
                description: this.cleanAndSummarize(result.description),
                reliability: this.calculateSourceReliability(result.source, result.url)
            }))
            .filter(result => result.title && result.description);
    }

    rankResults(articles) {
        return articles
            .map(article => ({
                ...article,
                totalScore: this.calculateTotalScore(article)
            }))
            .sort((a, b) => b.totalScore - a.totalScore);
    }

    calculateTotalScore(article) {
        const credibility = this.calculateSourceReliability(article.source, article.url);
        const relevance = this.calculateRelevanceScore(article);
        const urgency = this.calculateUrgencyScore(article);
        
        return credibility * 0.5 + relevance * 0.3 + urgency * 0.2;
    }

    calculateRelevanceScore(article) {
        const keywords = ['board game', 'tabletop', 'kickstarter', 'strategy', 'card game'];
        const titleLower = (article.title || '').toLowerCase();
        const descLower = (article.description || '').toLowerCase();
        
        let score = 0;
        keywords.forEach(keyword => {
            if (titleLower.includes(keyword)) score += 10;
            if (descLower.includes(keyword)) score += 5;
        });
        
        return Math.min(score, 100);
    }

    calculateUrgencyScore(article) {
        if (!article.publishedDate) return 0;
        
        const publishTime = new Date(article.publishedDate);
        const now = new Date();
        const hoursAgo = (now - publishTime) / (1000 * 60 * 60);
        
        if (hoursAgo <= 1) return 100;
        if (hoursAgo <= 6) return 80;
        if (hoursAgo <= 24) return 50;
        return 20;
    }

    calculateSourceReliability(source, url) {
        const reliableSources = [
            'boardgamegeek.com', 'tgiw.info', 'kickstarter.com',
            'boku-boardgame.net', 'comonox.com'
        ];
        
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            return reliableSources.some(s => domain.includes(s)) ? 100 : 50;
        } catch {
            return 20;
        }
    }

    cleanTitle(title) {
        if (!title) return '';
        return title
            .replace(/^\s*\[.*?\]\s*/, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200);
    }

    cleanAndSummarize(description) {
        if (!description) return '';
        return description
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 300);
    }

    getDateRestriction(hoursLimit) {
        const date = new Date();
        date.setHours(date.getHours() - hoursLimit);
        return `d${Math.ceil(hoursLimit / 24)}`;
    }

    timeoutPromise(ms) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Search timeout')), ms);
        });
    }

    isReliableSource(url) {
        try {
            const domain = new URL(url).hostname;
            const blacklist = ['spam', 'ads', 'fake', 'scam'];
            return !blacklist.some(word => domain.includes(word));
        } catch {
            return false;
        }
    }

    generateKeywordBasedNews(keyword) {
        // フォールバック用のニュース生成
        const fallbackNews = [
            {
                title: "ボードゲーム新作情報まとめ",
                url: "https://example.com/fallback",
                description: "最新のボードゲーム情報をお届けします。",
                source: "Fallback",
                reliability: 50,
                searchKeyword: keyword,
                layer: 'fallback'
            }
        ];
        
        return fallbackNews;
    }

    async generateFallbackNews(hoursLimit) {
        console.log(`📰 Generating fallback news for ${hoursLimit}h limit`);
        
        const fallbackArticles = [
            {
                title: "ボードゲーム業界の最新トレンド",
                url: "https://fallback.example/trends",
                description: "現在のボードゲーム業界で注目されているトレンドや新しい動向について。",
                source: "Fallback Source",
                reliability: 60,
                publishedDate: new Date().toISOString(),
                layer: 'fallback'
            },
            {
                title: "人気ボードゲームの新展開",
                url: "https://fallback.example/expansion", 
                description: "既存の人気ボードゲームに新しい拡張や続編が登場しています。",
                source: "Fallback Source",
                reliability: 60,
                publishedDate: new Date().toISOString(),
                layer: 'fallback'
            }
        ];

        return fallbackArticles;
    }

    getNoNewsMessage() {
        return [{
            title: "現在ニュースを取得できません",
            url: "https://example.com/no-news",
            description: "申し訳ございませんが、現在ボードゲームニュースを取得することができません。しばらくお待ちください。",
            source: "System",
            reliability: 0,
            publishedDate: new Date().toISOString()
        }];
    }

    initializeSearchLayers() {
        return {
            layer1: [
                'board game news',
                'tabletop game', 
                'boardgame release',
                'card game announcement',
                'strategy game'
            ],
            layer2: [
                'Asmodee',
                'Fantasy Flight Games', 
                'Z-Man Games',
                'Days of Wonder',
                'Stonemaier Games'
            ],
            layer3: [
                'Essen Spiel',
                'Gen Con',
                'Origins Game Fair',
                'BGG Con', 
                'Tokyo Game Market'
            ],
            layer4: [
                'Kickstarter board game',
                'crowdfunding tabletop',
                'board game investment',
                'tabletop industry',
                'game design innovation'
            ]
        };
    }

    async markArticlesAsPosted(articles) {
        if (!Array.isArray(articles) || articles.length === 0) return;
        
        for (const article of articles) {
            try {
                await this.databaseService.saveNewsPost(article);
            } catch (error) {
                console.error('Error saving news post:', error);
            }
        }
    }

    getSearchStats() {
        return {
            ...this.searchStats,
            successRate: this.searchStats.totalSearches > 0 ? 
                ((this.searchStats.successfulSearches / this.searchStats.totalSearches) * 100).toFixed(2) + '%' : '0%',
            webSearchServiceAvailable: !!this.webSearchService,
            errors: []
        };
    }

    async healthCheck() {
        const status = {
            timestamp: new Date().toISOString(),
            webSearchService: !!this.webSearchService,
            status: 'healthy'
        };

        if (this.webSearchService) {
            try {
                const wsHealth = await this.webSearchService.healthCheck();
                status.webSearchProviders = wsHealth.providers;
                status.overallStatus = wsHealth.overallStatus;
            } catch (error) {
                status.status = 'degraded';
                status.error = error.message;
            }
        } else {
            status.status = 'fallback_mode';
        }

        return status;
    }
}

module.exports = AdvancedNewsService;