const axios = require('axios');

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
            const searchQueries = [
                'board games news',
                'tabletop games',
                'board game release',
                'ボードゲーム',
                '卓上ゲーム'
            ];

            const allArticles = [];
            
            for (const query of searchQueries) {
                const articles = await this.searchNews(query);
                allArticles.push(...articles);
            }

            const uniqueArticles = this.removeDuplicates(allArticles);
            return this.sortByRelevance(uniqueArticles).slice(0, 10);
            
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

    async searchAlternativeNews(query) {
        try {
            const searches = [
                {
                    url: 'https://www.boardgamegeek.com/rss/news',
                    parser: 'rss'
                },
                {
                    url: 'https://www.reddit.com/r/boardgames/new.json',
                    parser: 'reddit'
                }
            ];

            const articles = [];
            
            for (const search of searches) {
                try {
                    const response = await axios.get(search.url, {
                        timeout: 5000,
                        headers: {
                            'User-Agent': 'BoardGameBot/1.0'
                        }
                    });
                    
                    if (search.parser === 'reddit') {
                        const redditPosts = this.parseRedditData(response.data);
                        articles.push(...redditPosts);
                    }
                } catch (error) {
                    console.warn(`Error fetching from ${search.url}:`, error.message);
                }
            }

            return articles.filter(article => 
                this.isRelevantToBoardGames(article.title + ' ' + (article.description || ''))
            );
            
        } catch (error) {
            console.error('Error with alternative news search:', error);
            return [];
        }
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

    getFallbackNews() {
        return [
            {
                title: 'ボードゲーム業界の最新動向',
                description: '最新のボードゲームトレンドと注目作品について',
                url: '#',
                publishedAt: new Date().toISOString(),
                source: 'Fallback News',
                content: 'ニュース取得中にエラーが発生しました。'
            },
            {
                title: '今週のおすすめボードゲーム',
                description: '家族や友人と楽しめるゲームをご紹介',
                url: '#',
                publishedAt: new Date().toISOString(),
                source: 'Fallback News',
                content: 'ニュース取得中にエラーが発生しました。'
            },
            {
                title: 'ボードゲームカフェの新店舗情報',
                description: '全国各地の新しいボードゲームスポット',
                url: '#',
                publishedAt: new Date().toISOString(),
                source: 'Fallback News',
                content: 'ニュース取得中にエラーが発生しました。'
            }
        ];
    }
}

module.exports = NewsService;