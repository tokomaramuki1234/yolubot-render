const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');

class DatabaseService {
    constructor() {
        // 環境に応じたDB選択（より明確な判定）
        this.isPostgres = process.env.DATABASE_URL && process.env.NODE_ENV === 'production';
        this.dbPath = path.join(__dirname, '../../database.sqlite');
        this.db = null;
        this.pgClient = null;
        this.isInitialized = false;
        
        console.log(`🗄️ データベース初期化: ${this.isPostgres ? 'PostgreSQL' : 'SQLite'}`);
    }

    async init() {
        if (this.isInitialized) {
            console.log('🗄️ データベースはすでに初期化済み');
            return;
        }

        try {
            if (this.isPostgres) {
                await this.initPostgreSQL();
            } else {
                await this.initSQLite();
            }
            this.isInitialized = true;
            console.log('✅ データベース初期化完了');
        } catch (error) {
            console.error('❌ データベース初期化失敗:', error);
            throw error;
        }
    }

    async initPostgreSQL() {
        this.pgClient = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        await this.pgClient.connect();
        await this.createPostgresTables();
        console.log('✅ PostgreSQL接続成功');
    }

    async initSQLite() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, async (err) => {
                if (err) {
                    reject(err);
                } else {
                    try {
                        await this.createSQLiteTables();
                        console.log('✅ SQLite接続成功');
                        resolve();
                    } catch (createErr) {
                        reject(createErr);
                    }
                }
            });
        });
    }

    async createPostgresTables() {
        const tables = [
            // 会話履歴テーブル
            `CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_message TEXT NOT NULL,
                bot_response TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            // ユーザー設定テーブル
            `CREATE TABLE IF NOT EXISTS user_preferences (
                id SERIAL PRIMARY KEY,
                user_id TEXT UNIQUE NOT NULL,
                preferences TEXT,
                interests TEXT,
                experience_level TEXT,
                favorite_mechanics TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            // ニュース投稿テーブル（改善版）
            `CREATE TABLE IF NOT EXISTS news_posts (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                url TEXT UNIQUE NOT NULL,
                description TEXT,
                source TEXT,
                credibility_score INTEGER DEFAULT 0,
                relevance_score INTEGER DEFAULT 0,
                urgency_score INTEGER DEFAULT 0,
                total_score INTEGER DEFAULT 0,
                search_keywords TEXT,
                published_at TIMESTAMP,
                posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_fallback BOOLEAN DEFAULT FALSE
            )`,
            // インデックス作成
            `CREATE INDEX IF NOT EXISTS idx_news_posts_url ON news_posts(url)`,
            `CREATE INDEX IF NOT EXISTS idx_news_posts_posted_at ON news_posts(posted_at)`,
            `CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)`
        ];

        for (const query of tables) {
            await this.pgClient.query(query);
        }
    }

    async createSQLiteTables() {
        const tables = [
            // 会話履歴テーブル
            `CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                user_message TEXT NOT NULL,
                bot_response TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            // ユーザー設定テーブル
            `CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                preferences TEXT,
                interests TEXT,
                experience_level TEXT,
                favorite_mechanics TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            // ニュース投稿テーブル（改善版）
            `CREATE TABLE IF NOT EXISTS news_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                url TEXT UNIQUE NOT NULL,
                description TEXT,
                source TEXT,
                credibility_score INTEGER DEFAULT 0,
                relevance_score INTEGER DEFAULT 0,
                urgency_score INTEGER DEFAULT 0,
                total_score INTEGER DEFAULT 0,
                search_keywords TEXT,
                published_at DATETIME,
                posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_fallback INTEGER DEFAULT 0
            )`,
            // インデックス作成
            `CREATE INDEX IF NOT EXISTS idx_news_posts_url ON news_posts(url)`,
            `CREATE INDEX IF NOT EXISTS idx_news_posts_posted_at ON news_posts(posted_at)`,
            `CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)`
        ];

        for (const query of tables) {
            await this.runQuery(query);
        }
    }

    async runQuery(query, params = []) {
        if (this.isPostgres) {
            return await this.pgClient.query(query, params);
        } else {
            return new Promise((resolve, reject) => {
                this.db.run(query, params, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this);
                    }
                });
            });
        }
    }

    async getQuery(query, params = []) {
        if (this.isPostgres) {
            const result = await this.pgClient.query(query, params);
            return result.rows;
        } else {
            return new Promise((resolve, reject) => {
                this.db.all(query, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                });
            });
        }
    }

    // メッセージ保存（エラーハンドリング改善）
    async saveMessage(userId, userMessage, botResponse) {
        const query = `INSERT INTO conversations (user_id, user_message, bot_response) 
                       VALUES ($1, $2, $3)`;
        try {
            await this.runQuery(query, [userId, userMessage, botResponse]);
        } catch (error) {
            console.error('メッセージ保存エラー:', error);
            throw error; // エラーを隠さない
        }
    }

    // 会話履歴取得（安全性向上）
    async getConversationHistory(userId, limit = 10) {
        const query = `SELECT user_message, bot_response, timestamp 
                       FROM conversations 
                       WHERE user_id = $1 
                       ORDER BY timestamp DESC 
                       LIMIT $2`;
        try {
            const rows = await this.getQuery(query, [userId, Math.max(1, parseInt(limit))]);
            return rows.reverse() || [];
        } catch (error) {
            console.error('会話履歴取得エラー:', error);
            return [];
        }
    }

    // ニュース投稿保存（改善版）
    async saveNewsPost(article) {
        // 引数が単一のarticleオブジェクトの場合の処理
        if (typeof article === 'string') {
            // 古い形式のパラメータ（title, url, description）をサポート
            const [title, url, description, extraData] = arguments;
            article = {
                title,
                url,
                description,
                ...extraData
            };
        }

        if (!article.title || !article.url) {
            throw new Error('タイトルとURLは必須です');
        }

        const query = this.isPostgres
            ? `INSERT INTO news_posts (title, url, description, source, credibility_score, 
               relevance_score, urgency_score, total_score, search_keywords, published_at, is_fallback) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (url) DO NOTHING`
            : `INSERT OR IGNORE INTO news_posts (title, url, description, source, credibility_score,
               relevance_score, urgency_score, total_score, search_keywords, published_at, is_fallback) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

        try {
            const totalScore = (article.totalScore || 0);
            
            await this.runQuery(query, [
                article.title, 
                article.url, 
                article.description || '',
                article.source || 'Unknown',
                article.credibilityScore || 0,
                article.relevanceScore || 0,
                article.urgencyScore || 0,
                totalScore,
                article.searchKeyword || '',
                article.publishedDate || new Date().toISOString(),
                article.isFallback ? (this.isPostgres ? true : 1) : (this.isPostgres ? false : 0)
            ]);
        } catch (error) {
            console.error('ニュース投稿保存エラー:', error);
            throw error;
        }
    }

    // ユーザー設定保存（JSON処理安全性向上）
    async saveUserPreferences(userId, preferences) {
        const query = this.isPostgres 
            ? `INSERT INTO user_preferences 
               (user_id, preferences, interests, experience_level, favorite_mechanics, updated_at) 
               VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
               ON CONFLICT (user_id) DO UPDATE SET
               preferences = EXCLUDED.preferences,
               interests = EXCLUDED.interests,
               experience_level = EXCLUDED.experience_level,
               favorite_mechanics = EXCLUDED.favorite_mechanics,
               updated_at = CURRENT_TIMESTAMP`
            : `INSERT OR REPLACE INTO user_preferences 
               (user_id, preferences, interests, experience_level, favorite_mechanics, updated_at) 
               VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`;
        
        try {
            await this.runQuery(query, [
                userId,
                JSON.stringify(preferences.preferences || []),
                JSON.stringify(preferences.interests || []),
                preferences.experience_level || '',
                JSON.stringify(preferences.favorite_mechanics || [])
            ]);
        } catch (error) {
            console.error('ユーザー設定保存エラー:', error);
            throw error;
        }
    }

    // ユーザー設定取得（JSON解析安全性向上）
    async getUserPreferences(userId) {
        const query = `SELECT preferences, interests, experience_level, favorite_mechanics 
                       FROM user_preferences 
                       WHERE user_id = $1`;
        try {
            const rows = await this.getQuery(query, [userId]);
            if (rows.length > 0) {
                const row = rows[0];
                return {
                    preferences: this.safeJSONParse(row.preferences, []),
                    interests: this.safeJSONParse(row.interests, []),
                    experience_level: row.experience_level || '',
                    favorite_mechanics: this.safeJSONParse(row.favorite_mechanics, [])
                };
            }
            return null;
        } catch (error) {
            console.error('ユーザー設定取得エラー:', error);
            return null;
        }
    }

    // 安全なJSON解析
    safeJSONParse(jsonString, defaultValue) {
        try {
            return JSON.parse(jsonString || '[]');
        } catch {
            return defaultValue;
        }
    }

    // ニュース分析データ取得（改善版）
    async getNewsAnalytics(days = 30) {
        const overallQuery = this.isPostgres
            ? `SELECT 
                AVG(credibility_score) as avg_credibility, 
                AVG(relevance_score) as avg_relevance, 
                AVG(urgency_score) as avg_urgency,
                AVG(total_score) as avg_total,
                COUNT(*) as total_articles,
                COUNT(CASE WHEN is_fallback = false THEN 1 END) as real_articles,
                COUNT(CASE WHEN is_fallback = true THEN 1 END) as fallback_articles
               FROM news_posts 
               WHERE posted_at > NOW() - INTERVAL '${days} days'`
            : `SELECT 
                AVG(credibility_score) as avg_credibility, 
                AVG(relevance_score) as avg_relevance, 
                AVG(urgency_score) as avg_urgency,
                AVG(total_score) as avg_total,
                COUNT(*) as total_articles,
                COUNT(CASE WHEN is_fallback = 0 THEN 1 END) as real_articles,
                COUNT(CASE WHEN is_fallback = 1 THEN 1 END) as fallback_articles
               FROM news_posts 
               WHERE posted_at > datetime('now', '-${days} days')`;

        const sourceQuery = this.isPostgres
            ? `SELECT source, COUNT(*) as article_count, AVG(total_score) as avg_score,
               COUNT(CASE WHEN is_fallback = false THEN 1 END) as real_count
               FROM news_posts 
               WHERE posted_at > NOW() - INTERVAL '${days} days'
               GROUP BY source 
               ORDER BY avg_score DESC`
            : `SELECT source, COUNT(*) as article_count, AVG(total_score) as avg_score,
               COUNT(CASE WHEN is_fallback = 0 THEN 1 END) as real_count
               FROM news_posts 
               WHERE posted_at > datetime('now', '-${days} days')
               GROUP BY source 
               ORDER BY avg_score DESC`;

        try {
            const [overallStats] = await this.getQuery(overallQuery);
            const sourceStats = await this.getQuery(sourceQuery);
            
            return {
                overall: {
                    ...overallStats,
                    success_rate: overallStats.total_articles > 0 ? 
                        (overallStats.real_articles / overallStats.total_articles * 100).toFixed(1) + '%' : '0%'
                },
                bySource: sourceStats
            };
        } catch (error) {
            console.error('分析データ取得エラー:', error);
            return { 
                overall: { total_articles: 0, success_rate: '0%' }, 
                bySource: [] 
            };
        }
    }

    // 最近のユーザー取得（エラーハンドリング改善）
    async getRecentUsers(days = 7) {
        const query = this.isPostgres
            ? `SELECT user_id, COUNT(*) as message_count
               FROM conversations 
               WHERE timestamp > NOW() - INTERVAL '${days} days'
               GROUP BY user_id
               ORDER BY message_count DESC`
            : `SELECT user_id, COUNT(*) as message_count
               FROM conversations 
               WHERE timestamp > datetime('now', '-${days} days')
               GROUP BY user_id
               ORDER BY message_count DESC`;
        try {
            return await this.getQuery(query);
        } catch (error) {
            console.error('最近のユーザー取得エラー:', error);
            return [];
        }
    }

    // メッセージ統計（改善版）
    async getMessageStats() {
        try {
            const queries = this.isPostgres ? [
                'SELECT COUNT(*) as total FROM conversations',
                'SELECT COUNT(DISTINCT user_id) as unique FROM conversations',
                'SELECT COUNT(*) as today FROM conversations WHERE DATE(timestamp) = CURRENT_DATE'
            ] : [
                'SELECT COUNT(*) as total FROM conversations',
                'SELECT COUNT(DISTINCT user_id) as unique FROM conversations',
                'SELECT COUNT(*) as today FROM conversations WHERE date(timestamp) = date("now")'
            ];

            const results = await Promise.all(queries.map(q => this.getQuery(q)));

            return {
                totalMessages: parseInt(results[0][0]?.total || 0),
                uniqueUsers: parseInt(results[1][0]?.unique || 0),
                messagesToday: parseInt(results[2][0]?.today || 0)
            };
        } catch (error) {
            console.error('統計取得エラー:', error);
            return { totalMessages: 0, uniqueUsers: 0, messagesToday: 0 };
        }
    }

    // 接続終了（改善版）
    async close() {
        try {
            if (this.isPostgres && this.pgClient) {
                await this.pgClient.end();
                console.log('PostgreSQL接続終了');
            } else if (this.db) {
                await new Promise((resolve) => {
                    this.db.close((err) => {
                        if (err) console.error('SQLite終了エラー:', err);
                        else console.log('SQLite接続終了');
                        resolve();
                    });
                });
            }
            this.isInitialized = false;
        } catch (error) {
            console.error('データベース終了エラー:', error);
        }
    }
}

module.exports = DatabaseService;
