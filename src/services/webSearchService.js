const axios = require('axios');

/**
 * WebSearchService - シンプル化された高速検索サービス
 * 優先順位: Serper API → Google Custom Search API
 */
class WebSearchService {
    constructor() {
        this.providers = {
            serper: {
                enabled: !!process.env.SERPER_API_KEY,
                apiKey: process.env.SERPER_API_KEY,
                baseUrl: 'https://google.serper.dev/search'
            },
            google: {
                enabled: !!(process.env.GOOGLE_CSE_ID && process.env.GOOGLE_CSE_API_KEY),
                apiKey: process.env.GOOGLE_CSE_API_KEY,
                searchEngineId: process.env.GOOGLE_CSE_ID,
                baseUrl: 'https://www.googleapis.com/customsearch/v1'
            }
        };

        this.cache = new Map();
        this.dailyUsage = {
            serper: 0,
            google: 0,
            resetDate: new Date().toDateString()
        };

        // 起動時デバッグ情報
        console.log('🔧 WebSearchService初期化:');
        console.log('  Serper API:', this.providers.serper.enabled ? '✅ 有効' : '❌ 無効');
        console.log('  Google API:', this.providers.google.enabled ? '✅ 有効' : '❌ 無効');
        
        if (!this.providers.serper.enabled && !this.providers.google.enabled) {
            console.warn('⚠️ 警告: すべての検索プロバイダーが無効です。APIキーを設定してください。');
        }
    }

    /**
     * メイン検索メソッド
     */
    async search(query, options = {}) {
        const { maxResults = 10, dateRestrict = null } = options;

        // キャッシュチェック
        const cacheKey = `${query}_${maxResults}_${dateRestrict}`;
        if (this.cache.has(cacheKey)) {
            console.log(`🎯 キャッシュヒット: "${query}"`);
            return this.cache.get(cacheKey);
        }

        // 使用量リセット
        this.resetDailyUsageIfNeeded();

        // プロバイダー順で検索試行
        const providers = ['serper', 'google'];
        
        for (const providerName of providers) {
            if (!this.canUseProvider(providerName)) {
                continue;
            }

            try {
                console.log(`🔍 ${providerName}で検索中: "${query}"`);
                
                const results = await this.searchWithProvider(providerName, query, options);
                
                if (results && results.length > 0) {
                    this.dailyUsage[providerName]++;
                    
                    // 5分間キャッシュ
                    setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
                    this.cache.set(cacheKey, results);
                    
                    console.log(`✅ ${providerName}で${results.length}件の結果を取得`);
                    return results;
                }
                
            } catch (error) {
                console.error(`❌ ${providerName}エラー: ${error.message}`);
                continue; // 次のプロバイダーを試行
            }
        }

        throw new Error('すべての検索プロバイダーが失敗しました');
    }

    /**
     * プロバイダー別検索実行
     */
    async searchWithProvider(provider, query, options) {
        if (provider === 'serper') {
            return await this.searchWithSerper(query, options);
        } else if (provider === 'google') {
            return await this.searchWithGoogle(query, options);
        }
        throw new Error(`未知のプロバイダー: ${provider}`);
    }

    /**
     * Serper API検索
     */
    async searchWithSerper(query, options) {
        const { maxResults = 10 } = options;
        
        try {
            const response = await axios.post(this.providers.serper.baseUrl, {
                q: query,
                num: Math.min(maxResults, 10),
                hl: 'ja',
                gl: 'jp'
            }, {
                headers: {
                    'X-API-KEY': this.providers.serper.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            return this.normalizeSerperResults(response.data);
            
        } catch (error) {
            if (error.response) {
                throw new Error(`Serper API error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
            }
            throw new Error(`Serper request failed: ${error.message}`);
        }
    }

    /**
     * Google Custom Search API検索
     */
    async searchWithGoogle(query, options) {
        const { maxResults = 10, dateRestrict } = options;

        const params = {
            key: this.providers.google.apiKey,
            cx: this.providers.google.searchEngineId,
            q: query,
            num: Math.min(maxResults, 10),
            hl: 'ja'
        };

        if (dateRestrict) params.dateRestrict = dateRestrict;

        try {
            const response = await axios.get(this.providers.google.baseUrl, {
                params,
                timeout: 10000
            });

            return this.normalizeGoogleResults(response.data);
            
        } catch (error) {
            if (error.response) {
                throw new Error(`Google API error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`);
            }
            throw new Error(`Google request failed: ${error.message}`);
        }
    }

    /**
     * Serper検索結果の正規化
     */
    normalizeSerperResults(data) {
        if (!data.organic || !Array.isArray(data.organic)) {
            return [];
        }

        return data.organic.map(item => ({
            title: item.title,
            link: item.link,
            url: item.link,
            snippet: item.snippet,
            description: item.snippet,
            publishedDate: item.date || null,
            source: this.extractDomain(item.link),
            provider: 'serper'
        }));
    }

    /**
     * Google検索結果の正規化
     */
    normalizeGoogleResults(data) {
        if (!data.items || !Array.isArray(data.items)) {
            return [];
        }

        return data.items.map(item => ({
            title: item.title,
            link: item.link,
            url: item.link,
            snippet: item.snippet,
            description: item.snippet,
            publishedDate: null,
            source: this.extractDomain(item.link),
            provider: 'google'
        }));
    }

    /**
     * プロバイダー使用可能性チェック
     */
    canUseProvider(providerName) {
        const provider = this.providers[providerName];
        return provider && provider.enabled;
    }

    /**
     * 日次使用量リセット
     */
    resetDailyUsageIfNeeded() {
        const today = new Date().toDateString();
        if (this.dailyUsage.resetDate !== today) {
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
            return new URL(url).hostname.replace('www.', '');
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
            providers: [
                {
                    name: 'Serper API',
                    enabled: this.providers.serper.enabled,
                    rateLimit: '1,000/月',
                    costPer1k: 0.30
                },
                {
                    name: 'Google Custom Search',
                    enabled: this.providers.google.enabled,
                    rateLimit: '100/日',
                    costPer1k: 5.00
                }
            ],
            cacheSize: this.cache.size
        };
    }

    /**
     * ヘルスチェック
     */
    async healthCheck() {
        const results = {
            timestamp: new Date().toISOString(),
            providers: {},
            overallStatus: 'ok'
        };

        // Serperチェック
        if (this.providers.serper.enabled) {
            try {
                await this.searchWithSerper('test', { maxResults: 1 });
                results.providers.serper = { status: 'healthy', enabled: true };
            } catch (error) {
                results.providers.serper = { status: 'unhealthy', enabled: true, error: error.message };
                results.overallStatus = 'degraded';
            }
        } else {
            results.providers.serper = { status: 'disabled', enabled: false, reason: 'API key not configured' };
        }

        // Googleチェック
        if (this.providers.google.enabled) {
            try {
                await this.searchWithGoogle('test', { maxResults: 1 });
                results.providers.google = { status: 'healthy', enabled: true };
            } catch (error) {
                results.providers.google = { status: 'unhealthy', enabled: true, error: error.message };
                if (results.providers.serper?.status !== 'healthy') {
                    results.overallStatus = 'error';
                }
            }
        } else {
            results.providers.google = { status: 'disabled', enabled: false, reason: 'API key or Search Engine ID not configured' };
        }

        // 全プロバイダー無効チェック
        if (!this.providers.serper.enabled && !this.providers.google.enabled) {
            results.overallStatus = 'error';
        }

        return results;
    }
}

module.exports = WebSearchService;
