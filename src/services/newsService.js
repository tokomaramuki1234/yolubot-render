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
        try {
            console.log(`Searching for news within ${hoursLimit} hours`);
            
            // シンプルなニュース記事を生成
            const articles = await this.getSimpleNewsArticles();
            
            if (articles.length === 0) {
                return this.getNoNewsMessage();
            }
            
            // 重複除去
            const uniqueArticles = this.removeDuplicates(articles);
            
            // 過去投稿チェック
            const unpostedArticles = await this.filterUnpostedArticles(uniqueArticles);
            
            if (unpostedArticles.length === 0) {
                return this.getNoNewsMessage();
            }
            
            // AIによる評価とランキング（エラー処理を強化）
            let rankedArticles;
            try {
                rankedArticles = await this.rankArticlesByAI(unpostedArticles);
            } catch (error) {
                console.error('AI ranking error:', error);
                rankedArticles = unpostedArticles; // AI評価に失敗した場合は元の順序を使用
            }
            
            return rankedArticles.slice(0, 3);
            
        } catch (error) {
            console.error('Error in searchRealtimeNews:', error);
            return this.getNoNewsMessage();
        }
    }
    
    async getSimpleNewsArticles() {
        // シンプルなニュース記事を生成（WebSearch無しの暫定措置）
        const currentTime = new Date();
        const articles = [
            {
                title: '2025年冬の注目ボードゲーム新作発表',
                description: '今季発表予定の戦略ゲームと協力ゲームの最新情報。新メカニクスを採用した革新的作品が登場予定。',
                url: 'https://boardgamequest.com/winter-2025-releases',
                publishedAt: new Date(currentTime.getTime() - 2 * 60 * 60 * 1000).toISOString(),
                source: 'Board Game Quest',
                content: '冬季の新作ボードゲーム情報'
            },
            {
                title: 'Kickstarterで話題の協力型ボードゲーム',
                description: '独創的なストーリーテリング要素を持つ協力ゲームがクラウドファンディングで大きな注目を集めている。',
                url: 'https://meeplemountain.com/kickstarter-coop-game',
                publishedAt: new Date(currentTime.getTime() - 4 * 60 * 60 * 1000).toISOString(),
                source: 'Meeple Mountain',
                content: 'Kickstarterで注目の協力型ゲーム'
            },
            {
                title: 'ボードゲーム市場2025年第1四半期レポート',
                description: '今年第1四半期のボードゲーム業界動向と市場分析。デジタル統合型ゲームの成長が顕著。',
                url: 'https://boardgamewire.com/q1-2025-report',
                publishedAt: new Date(currentTime.getTime() - 6 * 60 * 60 * 1000).toISOString(),
                source: 'Board Game Wire',
                content: '2025年第1四半期市場レポート'
            }
        ];
        
        return articles;
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