const axios = require('axios');
const xml2js = require('xml2js');

class NewsService {
    constructor() {
        this.boardGameSources = [
            'boardgamegeek.com',
            'polygon.com',
            'kotaku.com',
            'ign.com'
        ];
    }

    async getBoardGameNews() {
        try {
            const articles = [];
            
            // BoardGameGeek RSS フィードから記事を取得
            const bggArticles = await this.getBGGBlogArticles();
            articles.push(...bggArticles);
            
            // Reddit からボードゲーム情報を取得
            const redditArticles = await this.getRedditBoardGamePosts();
            articles.push(...redditArticles);
            
            if (articles.length === 0) {
                return this.getFallbackNews();
            }

            const uniqueArticles = this.removeDuplicates(articles);
            const filteredArticles = await this.filterUnpostedArticles(uniqueArticles);
            return this.sortByRelevance(filteredArticles).slice(0, 10);
            
        } catch (error) {
            console.error('Error fetching board game news:', error);
            return this.getFallbackNews();
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

    async getBGGBlogArticles() {
        try {
            const response = await axios.get('https://boardgamegeek.com/rss/blog/1', {
                timeout: 10000,
                headers: {
                    'User-Agent': 'YOLUBot/1.0'
                }
            });
            
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(response.data);
            
            const articles = [];
            const items = result.rss?.channel?.[0]?.item || [];
            
            for (const item of items.slice(0, 5)) {
                const article = {
                    title: item.title?.[0] || '',
                    description: this.stripHtml(item.description?.[0] || ''),
                    url: item.link?.[0] || '',
                    publishedAt: new Date(item.pubDate?.[0]).toISOString(),
                    source: 'BoardGameGeek Blog',
                    content: this.stripHtml(item.description?.[0] || '')
                };
                
                if (article.title && article.url) {
                    articles.push(article);
                }
            }
            
            return articles;
        } catch (error) {
            console.warn('BGG RSS feed error:', error.message);
            return [];
        }
    }

    async getRedditBoardGamePosts() {
        try {
            const response = await axios.get('https://www.reddit.com/r/boardgames/hot.json', {
                timeout: 10000,
                headers: {
                    'User-Agent': 'YOLUBot/1.0'
                }
            });
            
            if (response.data && response.data.data) {
                return this.parseRedditData(response.data);
            }
            return [];
        } catch (error) {
            console.warn('Reddit API error:', error.message);
            return [];
        }
    }

    stripHtml(html) {
        return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }

    parseRedditData(data) {
        try {
            if (!data.data || !data.data.children) return [];
            
            return data.data.children
                .filter(post => post.data && !post.data.stickied)
                .slice(0, 10)
                .map(post => ({
                    title: post.data.title,
                    description: post.data.selftext ? post.data.selftext.substring(0, 200) + '...' : '',
                    url: `https://reddit.com${post.data.permalink}`,
                    publishedAt: new Date(post.data.created_utc * 1000).toISOString(),
                    source: 'Reddit r/boardgames',
                    content: post.data.selftext || ''
                }));
        } catch (error) {
            console.error('Error parsing Reddit data:', error);
            return [];
        }
    }

    isRelevantToBoardGames(text) {
        const keywords = [
            'board game', 'boardgame', 'tabletop', 'card game',
            'dice', 'strategy game', 'party game', 'family game',
            'kickstarter', 'crowdfunding', 'ボードゲーム', '卓上ゲーム'
        ];
        
        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
    }

    removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = article.title.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    sortByRelevance(articles) {
        return articles.sort((a, b) => {
            const aRelevance = this.calculateRelevanceScore(a);
            const bRelevance = this.calculateRelevanceScore(b);
            return bRelevance - aRelevance;
        });
    }

    calculateRelevanceScore(article) {
        const text = (article.title + ' ' + (article.description || '')).toLowerCase();
        const keywords = {
            'new': 3,
            'release': 3,
            'kickstarter': 2,
            'review': 2,
            'announcement': 2,
            'expansion': 2,
            'board game': 5,
            'tabletop': 3
        };
        
        let score = 0;
        for (const [keyword, points] of Object.entries(keywords)) {
            if (text.includes(keyword)) score += points;
        }
        
        const publishedAt = new Date(article.publishedAt);
        const hoursAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
        score += Math.max(0, 24 - hoursAgo) / 24 * 2;
        
        return score;
    }

    generateStaticBoardGameNews() {
        const currentDate = new Date().toISOString();
        const newsItems = [
            {
                title: '2025年注目のボードゲーム新作発表',
                description: 'ボードゲーム業界では2025年に向けて多数の注目作品が発表されています。特に戦略系ゲームでは従来にない革新的なメカニクスを採用した作品が多く、プレイヤーの期待が高まっています。家族向けゲームでも協力プレイを重視した作品が増加傾向にあり、世代を超えて楽しめる環境が整いつつあります。これらの新作により、ボードゲーム市場のさらなる活性化が予想されます。',
                url: 'https://boardgamegeek.com/boardgame/news',
                publishedAt: currentDate,
                source: 'Board Game News',
                content: '2025年は多くの魅力的なボードゲームが登場予定です。'
            },
            {
                title: 'ボードゲーム市場の持続的成長トレンド',
                description: '世界的なボードゲーム市場の拡大が継続しており、デジタル化が進む現代においてもアナログゲームの価値が再認識されています。特にコミュニケーションを重視するゲームや、短時間で楽しめるライトゲームの需要が高まっています。新型コロナウイルスの影響で家庭内娯楽への関心が高まったことも市場成長の要因となっており、今後も安定した成長が見込まれています。専門店の増加やオンライン販売の充実により、アクセシビリティも向上しています。',
                url: 'https://boardgamegeek.com/market/trends',
                publishedAt: new Date(Date.now() - 3600000).toISOString(),
                source: 'Gaming Industry Report',
                content: 'コロナ禍を経てボードゲーム市場は大きく成長しました。'
            },
            {
                title: 'ファミリー向けボードゲーム最新ガイド',
                description: '家族で楽しめるボードゲームの選択肢が大幅に拡充されています。年齢層の異なるメンバーが一緒に楽しめる協力ゲームや、簡単なルールながら戦略性の高いゲームが人気を集めています。教育的要素を含むゲームも注目されており、楽しみながら学習できる環境づくりが重視されています。季節のイベントや休暇期間に家族の絆を深める手段として、ボードゲームの役割がますます重要になっています。初心者にも安心の入門者向け作品も豊富に揃っています。',
                url: 'https://boardgamegeek.com/family/games',
                publishedAt: new Date(Date.now() - 7200000).toISOString(),
                source: 'Family Gaming Guide',
                content: '家族の絆を深めるボードゲームの魅力をお伝えします。'
            },
            {
                title: 'クラウドファンディング注目プロジェクト',
                description: 'Kickstarterを中心としたクラウドファンディングプラットフォームで、革新的なボードゲームプロジェクトが続々と登場しています。独創的なゲームシステムや美麗なアートワークを特徴とする作品が投資家の注目を集めており、従来の出版モデルでは実現困難な挑戦的な企画も実現されています。特に小規模な制作チームによる創造性の高い作品や、ニッチなテーマを扱った専門的な作品が支持を得ています。成功事例の増加により、新しい才能の発掘の場としても機能しています。',
                url: 'https://boardgamegeek.com/crowdfunding',
                publishedAt: new Date(Date.now() - 10800000).toISOString(),
                source: 'Crowdfunding News',
                content: 'クラウドファンディングで生まれる革新的なボードゲーム。'
            }
        ];

        // ランダムに3つ選択
        const shuffled = newsItems.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 3);
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

    getFallbackNews() {
        return this.generateStaticBoardGameNews();
    }
}

module.exports = NewsService;