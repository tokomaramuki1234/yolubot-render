// advancedNewsService.js - 修正版
const DatabaseService = require('./databaseService');
const WebSearchService = require('./webSearchService');

class AdvancedNewsService {
    constructor() {
        this.dbService = new DatabaseService();
        this.webSearchService = new WebSearchService();
        this.searchStats = {
            totalSearches: 0,
            successfulSearches: 0,
            failedSearches: 0,
            lastSearchTime: null,
            averageResponseTime: 0,
            totalResponseTime: 0
        };
    }

    async initialize() {
        try {
            await this.dbService.initialize();
            console.log('✅ AdvancedNewsService初期化完了');
        } catch (error) {
            console.error('❌ AdvancedNewsService初期化エラー:', error);
            throw error;
        }
    }

    async searchBoardGameNews(query, options = {}) {
        const startTime = Date.now();
        this.searchStats.totalSearches++;
        this.searchStats.lastSearchTime = new Date();

        try {
            console.log(`🔍 ボードゲームニュース検索開始: "${query}"`);
            
            // WebSearchServiceを使用して検索
            const results = await this.webSearchService.searchNews(query, {
                maxResults: options.maxResults || 10,
                language: options.language || 'ja',
                ...options
            });

            if (!results || results.length === 0) {
                console.log('⚠️ 検索結果が見つかりませんでした');
                this.searchStats.failedSearches++;
                return [];
            }

            // 結果の処理とスコアリング
            const processedResults = await this.processSearchResults(results);
            
            // 成功統計の更新
            this.searchStats.successfulSearches++;
            const responseTime = Date.now() - startTime;
            this.searchStats.totalResponseTime += responseTime;
            this.searchStats.averageResponseTime = Math.round(
                this.searchStats.totalResponseTime / this.searchStats.successfulSearches
            );

            console.log(`✅ 検索完了: ${processedResults.length}件 (${responseTime}ms)`);
            return processedResults;

        } catch (error) {
            console.error('❌ ボードゲームニュース検索エラー:', error);
            this.searchStats.failedSearches++;
            const responseTime = Date.now() - startTime;
            this.searchStats.totalResponseTime += responseTime;
            throw error;
        }
    }

    async processSearchResults(results) {
        const processedResults = [];

        for (const result of results) {
            try {
                // 基本的な結果処理
                const processedResult = {
                    title: result.title || '無題',
                    url: result.url || result.link || '',
                    snippet: result.snippet || result.description || '',
                    publishedAt: result.publishedAt || result.date || new Date().toISOString(),
                    source: result.source || this.extractDomain(result.url),
                    score: this.calculateRelevanceScore(result),
                    searchedAt: new Date().toISOString()
                };

                // URLの有効性チェック
                if (processedResult.url && this.isValidUrl(processedResult.url)) {
                    processedResults.push(processedResult);
                }

            } catch (error) {
                console.error('結果処理エラー:', error);
            }
        }

        return processedResults.sort((a, b) => b.score - a.score);
    }

    calculateRelevanceScore(result) {
        let score = 50; // ベーススコア

        const title = (result.title || '').toLowerCase();
        const snippet = (result.snippet || result.description || '').toLowerCase();
        const url = (result.url || result.link || '').toLowerCase();

        // ボードゲーム関連キーワードのスコアリング
        const boardGameKeywords = [
            'ボードゲーム', 'board game', 'tabletop', 'テーブルゲーム',
            'カードゲーム', 'card game', 'dice game', 'ダイスゲーム',
            'アナログゲーム', 'analog game'
        ];

        // 高品質ソースのスコアリング
        const qualitySources = [
            'boardgamegeek.com', 'tgiw.info', 'boardgamenews.com',
            'dicetower.com', 'kotaku.com', 'polygon.com',
            'gamemarket.jp', 'bodoge.hoobby.net'
        ];

        // キーワードマッチング
        boardGameKeywords.forEach(keyword => {
            if (title.includes(keyword)) score += 20;
            if (snippet.includes(keyword)) score += 10;
        });

        // 高品質ソースボーナス
        qualitySources.forEach(source => {
            if (url.includes(source)) score += 30;
        });

        // 新しさボーナス
        if (result.publishedAt || result.date) {
            const publishDate = new Date(result.publishedAt || result.date);
            const now = new Date();
            const daysDiff = (now - publishDate) / (1000 * 60 * 60 * 24);
            
            if (daysDiff <= 1) score += 20;      // 1日以内
            else if (daysDiff <= 7) score += 10; // 1週間以内
            else if (daysDiff <= 30) score += 5; // 1ヶ月以内
        }

        return Math.max(0, Math.min(100, score));
    }

    extractDomain(url) {
        try {
            if (!url) return 'Unknown';
            const domain = new URL(url).hostname;
            return domain.replace('www.', '');
        } catch (error) {
            return 'Unknown';
        }
    }

    isValidUrl(url) {
        try {
            new URL(url);
            return url.startsWith('http://') || url.startsWith('https://');
        } catch (error) {
            return false;
        }
    }

    // 🔧 追加: getWebSearchStats メソッド
    getWebSearchStats() {
        return {
            ...this.searchStats,
            healthStatus: {
                webSearchService: this.webSearchService ? 'healthy' : 'unhealthy',
                database: this.dbService ? 'healthy' : 'unhealthy'
            },
            lastUpdate: new Date().toISOString()
        };
    }

    // 🔧 追加: saveNewsPost メソッド
    async saveNewsPost(newsData) {
        try {
            if (!newsData || !newsData.url) {
                throw new Error('無効なニュースデータです');
            }

            // データベースに保存
            const savedPost = await this.dbService.saveNews({
                title: newsData.title || '無題',
                url: newsData.url,
                snippet: newsData.snippet || '',
                publishedAt: newsData.publishedAt || new Date().toISOString(),
                source: newsData.source || this.extractDomain(newsData.url),
                score: newsData.score || 0,
                searchedAt: new Date().toISOString()
            });

            console.log(`✅ ニュース記事を保存しました: ${newsData.title}`);
            return savedPost;

        } catch (error) {
            console.error('❌ ニュース記事保存エラー:', error);
            throw error;
        }
    }

    // 🔧 追加: getRecentNews メソッド
    async getRecentNews(limit = 10) {
        try {
            return await this.dbService.getRecentNews(limit);
        } catch (error) {
            console.error('❌ 最近のニュース取得エラー:', error);
            return [];
        }
    }

    // 🔧 追加: searchHistory メソッド
    async getSearchHistory(limit = 20) {
        try {
            return await this.dbService.getSearchHistory(limit);
        } catch (error) {
            console.error('❌ 検索履歴取得エラー:', error);
            return [];
        }
    }

    // 🔧 追加: clearOldNews メソッド
    async clearOldNews(daysOld = 30) {
        try {
            const result = await this.dbService.clearOldNews(daysOld);
            console.log(`✅ ${daysOld}日前より古いニュースを削除しました: ${result.deletedCount}件`);
            return result;
        } catch (error) {
            console.error('❌ 古いニュース削除エラー:', error);
            throw error;
        }
    }

    // 統計情報のリセット
    resetStats() {
        this.searchStats = {
            totalSearches: 0,
            successfulSearches: 0,
            failedSearches: 0,
            lastSearchTime: null,
            averageResponseTime: 0,
            totalResponseTime: 0
        };
        console.log('📊 検索統計をリセットしました');
    }
}

module.exports = AdvancedNewsService;
