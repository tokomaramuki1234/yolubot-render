const axios = require('axios');

/**
 * WebSearchService - 複数のWeb検索APIを統合したサービスクラス
 * 優先順位: Serper API → Google Custom Search API → フォールバック
 * 
 * 改善点:
 * - ヘルスチェック機能の追加
 * - エラーハンドリングの強化
 * - 統計情報の詳細化
 * - タイムアウト制御
 */
class WebSearchService {
    constructor() {
        this.providers = {
            serper: {
                enabled: !!process.env.SERPER_API_KEY,
                apiKey: process.env.SERPER_API_KEY,
                baseUrl: 'https://google.serper.dev/search',
                rateLimit: 1000, // requests per month on free tier
                costPer1k: 0.30 // at scale pricing
            },
            google: {
                enabled: !!(process.env.GOOGLE_CSE_ID && process.env.GOOGLE_CSE_API_KEY),
                apiKey: process.env.GOOGLE_CSE_API_KEY,
                searchEngineId: process.env.GOOGLE_CSE_ID,
                baseUrl: 'https://www.googleapis.com/customsearch/v1',
                rateLimit: 100, // requests per day on free tier
                costPer1k: 5.00 // $5 per 1000 requests
            }
        };

        this.cache = new Map(); // Simple in-memory cache
        this.dailyUsage = {
            serper: 0,
            google: 0,
            resetDate: new Date().toDateString()
        };

        // デバッグ情報を追加
        console.log('🔧 Environment Variables Debug:');
        console.log('SERPER_API_KEY:', process.env.SERPER_API_KEY ? `${process.env.SERPER_API_KEY.substring(0, 8)}...` : 'NOT SET');
        console.log('GOOGLE_CSE_API_KEY:', process.env.GOOGLE_CSE_API_KEY ? `${process.env.GOOGLE_CSE_API_KEY.substring(0, 8)}...` : 'NOT SET');
        console.log('GOOGLE_CSE_ID:', process.env.GOOGLE_CSE_ID || 'NOT SET');
        
        console.log('WebSearchService initialized with providers:', {
            serper: this.providers.serper.enabled,
            google: this.providers.google.enabled
        });
    }

    /**
     * メイン検索メソッド - 複数プロバイダーを優先順位で試行
     */
    async search(query, options = {}) {
        const {
            maxResults = 10,
            dateRestrict = null, // 例: 'd1' (1日以内), 'w1' (1週間以内)
            siteSearch = null,   // 特定サイト内検索
            language = 'ja',
            forceProvider = null // テスト用：特定プロバイダーを強制使用
        } = options;

        // キャッシュチェック
        const cacheKey = this.generateCacheKey(query, options);
        if (this.cache.has(cacheKey)) {
            console.log(`🎯 Cache hit for query: "${query}"`);
            return this.cache.get(cacheKey);
        }

        // 使用量リセット（日付変更時）
        this.resetDailyUsageIfNeeded();

        let results = null;
        let usedProvider = null;

        try {
            // プロバイダー優先順位での試行
            const providers = forceProvider ? [forceProvider] : ['serper', 'google'];

            for (const providerName of providers) {
                if (this.canUseProvider(providerName)) {
                    console.log(`🔍 Attempting search with ${providerName}: "${query}"`);
                    
                    try {
                        results = await this.searchWithProvider(providerName, query, options);
                        if (results && results.length > 0) {
                            usedProvider = providerName;
                            this.dailyUsage[providerName]++;
                            console.log(`✅ Success with ${providerName}, found ${results.length} results`);
                            break;
                        }
                    } catch (error) {
                        console.log(`❌ ${providerName} failed: ${error.message}`);
                        continue;
                    }
                }
            }

            // 結果が見つからない場合
            if (!results || results.length === 0) {
                throw new Error('No results found from any provider');
            }

            // キャッシュに保存（5分間有効）
            setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
            this.cache.set(cacheKey, results);

            console.log(`📊 Search completed: ${results.length} results from ${usedProvider}`);
            return results;

        } catch (error) {
            console.error('🚨 All web search providers failed:', error.message);
            throw new Error(`Web search failed: ${error.message}`);
        }
    }

    /**
     * Serper APIを使用した検索
     */
    async searchWithProvider(provider, query, options) {
        if (provider === 'serper') {
            return await this.searchWithSerper(query, options);
        } else if (provider === 'google') {
            return await this.searchWithGoogle(query, options);
        } else {
            throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * Serper API検索実装
     */
    async searchWithSerper(query, options) {
        const { maxResults = 10, language = 'ja', siteSearch } = options;
        
        const searchQuery = siteSearch ? `site:${siteSearch} ${query}` : query;
        
        const requestData = {
            q: searchQuery,
            num: Math.min(maxResults, 10), // Serperは最大10件
            hl: language,
            gl: language === 'ja' ? 'jp' : 'us'
        };

        const response = await axios.post(this.providers.serper.baseUrl, requestData, {
            headers: {
                'X-API-KEY': this.providers.serper.apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        return this.normalizeSerperResults(response.data);
    }

    /**
     * Google Custom Search API検索実装
     */
    async searchWithGoogle(query, options) {
        const { maxResults = 10, dateRestrict, siteSearch, language = 'ja' } = options;

        const params = {
            key: this.providers.google.apiKey,
            cx: this.providers.google.searchEngineId,
            q: query,
            num: Math.min(maxResults, 10),
            hl: language,
            lr: language === 'ja' ? 'lang_ja' : 'lang_en'
        };

        if (dateRestrict) params.dateRestrict = dateRestrict;
        if (siteSearch) params.siteSearch = siteSearch;

        const response = await axios.get(this.providers.google.baseUrl, {
            params,
            timeout: 10000
        });

        return this.normalizeGoogleResults(response.data);
    }

    /**
     * Serper検索結果の正規化
     */
    normalizeSerperResults(data) {
        const results = [];
        
        if (data.organic) {
            for (const item of data.organic) {
                results.push({
                    title: item.title,
                    link: item.link,
                    url: item.link,
                    snippet: item.snippet,
                    description: item.snippet,
                    publishedDate: item.date || null,
                    source: this.extractDomain(item.link),
                    provider: 'serper'
                });
            }
        }

        return results;
    }

    /**
     * Google検索結果の正規化
     */
    normalizeGoogleResults(data) {
        const results = [];
        
        if (data.items) {
            for (const item of data.items) {
                results.push({
                    title: item.title,
                    link: item.link,
                    url: item.link,
                    snippet: item.snippet,
                    description: item.snippet,
                    publishedDate: null, // Google CSEでは日付情報が限定的
                    source: this.extractDomain(item.link),
                    provider: 'google'
                });
            }
        }

        return results;
    }

    /**
     * プロバイダーが使用可能かチェック
     */
    canUseProvider(providerName) {
        const provider = this.providers[providerName];
        
        if (!provider || !provider.enabled) {
            return false;
        }

        // レート制限チェック
        const usage = this.dailyUsage[providerName];
        const limit = provider.rateLimit;
        
        if (usage >= limit) {
            console.log(`⚠️ ${providerName} rate limit exceeded: ${usage}/${limit}`);
            return false;
        }

        return true;
    }

    /**
     * キャッシュキー生成
     */
    generateCacheKey(query, options) {
        return `search_${query}_${JSON.stringify(options)}`.replace(/\s+/g, '_');
    }

    /**
     * 日次使用量リセット
     */
    resetDailyUsageIfNeeded() {
        const today = new Date().toDateString();
        if (this.dailyUsage.resetDate !== today) {
            console.log('🔄 Resetting daily usage counters');
            this.dailyUsage = {
                serper: 0,
                google: 0,
                resetDate: today
            };
        }
    }

    /**
     * ドメイン抽出
     */
    extractDomain(url) {
        try {
            const domain = new URL(url).hostname;
            return domain.replace('www.', '');
        } catch {
            return 'unknown';
        }
    }

    /**
     * 使用統計取得
     */
    getUsageStats() {
        return {
            today: this.dailyUsage,
            providers: Object.keys(this.providers).map(name => ({
                name,
                enabled: this.providers[name].enabled,
                rateLimit: this.providers[name].rateLimit,
                costPer1k: this.providers[name].costPer1k
            })),
            cacheSize: this.cache.size
        };
    }

    /**
     * プロバイダー健全性チェック
     */
    async healthCheck() {
        const results = {};
        
        for (const [name, provider] of Object.entries(this.providers)) {
            if (!provider.enabled) {
                results[name] = { status: 'disabled', reason: 'API key not configured' };
                continue;
            }

            try {
                const testResults = await this.search('test', { 
                    maxResults: 1, 
                    forceProvider: name 
                });
                results[name] = { 
                    status: 'healthy', 
                    testResults: testResults.length 
                };
            } catch (error) {
                results[name] = { 
                    status: 'error', 
                    error: error.message 
                };
            }
        }

        return results;
    }

    /**
     * サービスの健全性をチェック
     */
    async healthCheck() {
        const healthStatus = {
            timestamp: new Date().toISOString(),
            providers: {},
            overallStatus: 'ok'
        };

        // Serper APIの健全性チェック
        if (this.providers.serper.enabled) {
            try {
                // 簡単なテストクエリでAPIをチェック
                await this.searchWithSerper('test', { maxResults: 1 });
                healthStatus.providers.serper = {
                    status: 'healthy',
                    enabled: true,
                    apiKey: this.providers.serper.apiKey ? 'configured' : 'missing'
                };
            } catch (error) {
                healthStatus.providers.serper = {
                    status: 'unhealthy',
                    enabled: true,
                    error: error.message,
                    apiKey: this.providers.serper.apiKey ? 'configured' : 'missing'
                };
                healthStatus.overallStatus = 'degraded';
            }
        } else {
            healthStatus.providers.serper = {
                status: 'disabled',
                enabled: false,
                reason: 'API key not configured'
            };
        }

        // Google Custom Search APIの健全性チェック
        if (this.providers.google.enabled) {
            try {
                // 簡単なテストクエリでAPIをチェック
                await this.searchWithGoogle('test', { maxResults: 1 });
                healthStatus.providers.google = {
                    status: 'healthy',
                    enabled: true,
                    apiKey: this.providers.google.apiKey ? 'configured' : 'missing',
                    searchEngineId: this.providers.google.searchEngineId ? 'configured' : 'missing'
                };
            } catch (error) {
                healthStatus.providers.google = {
                    status: 'unhealthy',
                    enabled: true,
                    error: error.message,
                    apiKey: this.providers.google.apiKey ? 'configured' : 'missing',
                    searchEngineId: this.providers.google.searchEngineId ? 'configured' : 'missing'
                };
                if (healthStatus.overallStatus !== 'degraded') {
                    healthStatus.overallStatus = healthStatus.providers.serper?.status === 'healthy' ? 'ok' : 'degraded';
                }
            }
        } else {
            healthStatus.providers.google = {
                status: 'disabled',
                enabled: false,
                reason: 'API key or Search Engine ID not configured'
            };
        }

        // 全プロバイダーが無効の場合
        if (!this.providers.serper.enabled && !this.providers.google.enabled) {
            healthStatus.overallStatus = 'error';
        }

        return healthStatus;
    }

    /**
     * 使用統計情報を取得
     */
    getUsageStats() {
        return {
            today: {
                serper: this.dailyUsage.serper,
                google: this.dailyUsage.google,
                resetDate: this.dailyUsage.resetDate
            },
            providers: [
                {
                    name: 'Serper API',
                    enabled: this.providers.serper.enabled,
                    rateLimit: `${this.providers.serper.rateLimit}/month`,
                    costPer1k: this.providers.serper.costPer1k
                },
                {
                    name: 'Google Custom Search',
                    enabled: this.providers.google.enabled,
                    rateLimit: `${this.providers.google.rateLimit}/day`,
                    costPer1k: this.providers.google.costPer1k
                }
            ],
            cacheSize: this.cache.size
        };
    }

    /**
     * タイムアウト付きPromise
     */
    timeoutPromise(ms, operation = 'Operation') {
        return new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
        );
    }

    /**
     * レート制限チェック（日次リセット付き）
     */
    checkAndResetDailyUsage() {
        const today = new Date().toDateString();
        if (this.dailyUsage.resetDate !== today) {
            this.dailyUsage = {
                serper: 0,
                google: 0,
                resetDate: today
            };
            console.log('🔄 Daily usage counters reset');
        }
    }
}

module.exports = WebSearchService;