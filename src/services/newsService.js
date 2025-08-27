const axios = require('axios');

class NewsService {
    constructor() {
        // シンプルなニュースサービス
    }

    async getBoardGameNews(isScheduled = false) {
        try {
            console.log(`Fetching news, isScheduled: ${isScheduled}`);
            
            // 暫定的にシンプルなニュース記事を返す
            const articles = this.getSimpleNewsArticles();
            
            // 重複除去
            const uniqueArticles = this.removeDuplicates(articles);
            
            // 過去投稿チェック
            const unpostedArticles = await this.filterUnpostedArticles(uniqueArticles);
            
            if (unpostedArticles.length === 0) {
                return this.getNoNewsMessage();
            }
            
            return unpostedArticles.slice(0, 3);
            
        } catch (error) {
            console.error('Error fetching board game news:', error);
            return this.getNoNewsMessage();
        }
    }

    getSimpleNewsArticles() {
        const currentTime = new Date();
        return [
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

    removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = article.url || article.title.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
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
}

module.exports = NewsService;