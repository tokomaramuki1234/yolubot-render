const axios = require('axios');

class NewsService {
    constructor() {
        // Web検索を使用するため、固定ソースは不要
    }

    async getBoardGameNews(isScheduled = false) {
        try {
            const hoursLimit = isScheduled ? 12 : 6;
            return await this.searchRealtimeNews(hoursLimit);
        } catch (error) {
            console.error('Error fetching board game news:', error);
            return [];
        }
    }

    async searchNews(query) {
        try {
            const response = await axios.get('https://newsapi.org/v2/everything', {
                params: {
                    q: query,
                    language: 'en',
                    sortBy: 'publishedAt',
                    pageSize: 20,
                    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                },
                headers: {
                    'X-API-Key': process.env.NEWS_API_KEY || ''
                }
            });

            if (response.data && response.data.articles) {
                return response.data.articles.map(article => ({
                    title: article.title,
                    description: article.description,
                    url: article.url,
                    publishedAt: article.publishedAt,
                    source: article.source.name,
                    content: article.content
                }));
            }
        } catch (error) {
            if (error.response?.status === 401) {
                console.warn('NewsAPI key not configured, using alternative sources');
            } else {
                console.error('Error searching news with NewsAPI:', error.message);
            }
        }

        return await this.searchAlternativeNews(query);
    }

    async searchRealtimeNews(hoursLimit) {
        const WebSearch = require('../utils/webSearchWrapper');
        const webSearch = new WebSearch();
        
        // 検索クエリを構築
        const currentDate = new Date();
        const searchDate = new Date(currentDate.getTime() - hoursLimit * 60 * 60 * 1000);
        const dateString = searchDate.getFullYear();
        
        const queries = [
            `board game news ${dateString} latest`,
            `tabletop game news ${dateString} new release`,
            `board game announcement ${dateString} kickstarter`,
            `board game review ${dateString} latest`
        ];
        
        const allArticles = [];
        
        for (const query of queries) {
            try {
                const results = await webSearch.search(query);
                const processedResults = await this.processSearchResults(results, hoursLimit);
                allArticles.push(...processedResults);
            } catch (error) {
                console.warn(`Web search error for query '${query}':`, error.message);
            }
        }
        
        if (allArticles.length === 0) {
            return this.getNoNewsMessage();
        }
        
        // 重複除去
        const uniqueArticles = this.removeDuplicates(allArticles);
        
        // 過去投稿チェック
        const unpostedArticles = await this.filterUnpostedArticles(uniqueArticles);
        
        if (unpostedArticles.length === 0) {
            return this.getNoNewsMessage();
        }
        
        // AIによる評価とランキング
        const rankedArticles = await this.rankArticlesByAI(unpostedArticles);
        
        return rankedArticles.slice(0, 3);
    }
    
    async processSearchResults(searchResults, hoursLimit) {
        const articles = [];
        const cutoffTime = new Date(Date.now() - hoursLimit * 60 * 60 * 1000);
        
        for (const result of searchResults.slice(0, 10)) {
            if (this.isBoardGameRelated(result.title + ' ' + result.snippet)) {
                // 推定公開日をチェック（完璧ではないが、最新性の目安として使用）
                const article = {
                    title: result.title,
                    description: result.snippet,
                    url: result.url,
                    publishedAt: new Date().toISOString(), // WebSearchは日付情報を提供しないため現在時刻を使用
                    source: this.extractDomain(result.url),
                    content: result.snippet
                };
                
                articles.push(article);
            }
        }
        
        return articles;
    }
    
    extractDomain(url) {
        try {
            const domain = new URL(url).hostname;
            return domain.replace('www.', '');
        } catch {
            return 'Unknown Source';
        }
    }
    
    isBoardGameRelated(text) {
        const keywords = [
            'board game', 'boardgame', 'tabletop', 'card game',
            'dice game', 'strategy game', 'party game', 'family game',
            'kickstarter', 'crowdfunding', 'game review', 'game release',
            'ボードゲーム', '卓上ゲーム', 'カードゲーム'
        ];
        
        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
    }
    
    getNoNewsMessage() {
        return [{
            title: 'ニュースなし',
            description: '直近24時間以内にめぼしいニュースはありませんでしたヨモ',
            url: '',
            publishedAt: new Date().toISOString(),
            source: 'YOLUBot',
            content: '直近24時間以内にめぼしいニュースはありませんでしたヨモ',
            isNoNewsMessage: true
        }];
    }

    async rankArticlesByAI(articles) {
        const GeminiService = require('./geminiService');
        const gemini = new GeminiService();
        
        try {
            const articlesData = articles.map((article, index) => ({
                id: index,
                title: article.title,
                description: article.description,
                source: article.source,
                url: article.url
            }));
            
            const ranking = await gemini.rankArticles(articlesData);
            
            // ランキング結果に基づいて記事を並び替え
            const rankedArticles = ranking.map(rank => articles[rank.id]);
            
            return rankedArticles;
        } catch (error) {
            console.error('Error ranking articles with AI:', error);
            // AI評価に失敗した場合は元の順序を返す
            return articles;
        }
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
            return articles; // エラー時は全記事を返す
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

}

module.exports = NewsService;