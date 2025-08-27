const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');

class DatabaseService {
    constructor() {
        // Render無料プランではSQLiteを強制使用
        this.isPostgres = false;
        this.dbPath = path.join(__dirname, '../../database.sqlite');
        this.db = null;
        this.pgClient = null;
    }

    async init() {
        if (this.isPostgres) {
            return await this.initPostgreSQL();
        } else {
            return await this.initSQLite();
        }
    }

    async initPostgreSQL() {
        try {
            this.pgClient = new Client({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            });

            await this.pgClient.connect();
            console.log('PostgreSQL connected successfully');
            await this.createPostgresTables();
            return Promise.resolve();
        } catch (error) {
            console.error('PostgreSQL connection error:', error);
            return Promise.reject(error);
        }
    }

    async initSQLite() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening SQLite database:', err);
                    reject(err);
                } else {
                    console.log('SQLite database connected successfully');
                    this.createSQLiteTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createPostgresTables() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_message TEXT NOT NULL,
                bot_response TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS user_preferences (
                id SERIAL PRIMARY KEY,
                user_id TEXT UNIQUE NOT NULL,
                preferences TEXT,
                interests TEXT,
                experience_level TEXT,
                favorite_mechanics TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS news_posts (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                url TEXT UNIQUE NOT NULL,
                description TEXT,
                posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const query of tables) {
            await this.pgClient.query(query);
        }
    }

    async createSQLiteTables() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                user_message TEXT NOT NULL,
                bot_response TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                preferences TEXT,
                interests TEXT,
                experience_level TEXT,
                favorite_mechanics TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
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
                posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS article_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                article_url TEXT NOT NULL,
                user_id TEXT,
                click_count INTEGER DEFAULT 0,
                dwell_time INTEGER DEFAULT 0,
                user_rating INTEGER,
                feedback_type TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS search_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                search_keyword TEXT NOT NULL,
                layer_type TEXT NOT NULL,
                success_rate REAL DEFAULT 0.0,
                avg_relevance_score REAL DEFAULT 0.0,
                usage_count INTEGER DEFAULT 0,
                last_used DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const query of tables) {
            await this.runQuery(query);
        }
    }

    async runQuery(query, params = []) {
        if (this.isPostgres) {
            try {
                const result = await this.pgClient.query(query, params);
                return result;
            } catch (error) {
                console.error('PostgreSQL query error:', error);
                throw error;
            }
        } else {
            return new Promise((resolve, reject) => {
                this.db.run(query, params, function(err) {
                    if (err) {
                        console.error('SQLite query error:', err);
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
            try {
                const result = await this.pgClient.query(query, params);
                return result.rows;
            } catch (error) {
                console.error('PostgreSQL query error:', error);
                throw error;
            }
        } else {
            return new Promise((resolve, reject) => {
                this.db.all(query, params, (err, rows) => {
                    if (err) {
                        console.error('SQLite query error:', err);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        }
    }

    async saveMessage(userId, userMessage, botResponse) {
        const query = `INSERT INTO conversations (user_id, user_message, bot_response) 
                       VALUES ($1, $2, $3)`;
        try {
            await this.runQuery(query, [userId, userMessage, botResponse]);
            console.log('Message saved to database');
        } catch (error) {
            console.error('Error saving message:', error);
        }
    }

    async getConversationHistory(userId, limit = 10) {
        const query = `SELECT user_message, bot_response, timestamp 
                       FROM conversations 
                       WHERE user_id = $1 
                       ORDER BY timestamp DESC 
                       LIMIT $2`;
        try {
            const rows = await this.getQuery(query, [userId, limit]);
            return rows.reverse();
        } catch (error) {
            console.error('Error getting conversation history:', error);
            return [];
        }
    }

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
            console.log('User preferences saved');
        } catch (error) {
            console.error('Error saving user preferences:', error);
        }
    }

    async getUserPreferences(userId) {
        const query = `SELECT preferences, interests, experience_level, favorite_mechanics 
                       FROM user_preferences 
                       WHERE user_id = $1`;
        try {
            const rows = await this.getQuery(query, [userId]);
            if (rows.length > 0) {
                const row = rows[0];
                return {
                    preferences: JSON.parse(row.preferences || '[]'),
                    interests: JSON.parse(row.interests || '[]'),
                    experience_level: row.experience_level || '',
                    favorite_mechanics: JSON.parse(row.favorite_mechanics || '[]')
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting user preferences:', error);
            return null;
        }
    }

    async saveNewsPost(title, url, description, article = {}) {
        const query = this.isPostgres
            ? `INSERT INTO news_posts (title, url, description, source, credibility_score, 
               relevance_score, urgency_score, total_score, search_keywords, published_at) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               ON CONFLICT (url) DO NOTHING`
            : `INSERT OR IGNORE INTO news_posts (title, url, description, source, credibility_score,
               relevance_score, urgency_score, total_score, search_keywords, published_at) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;
        try {
            const totalScore = (article.credibilityScore || 0) + (article.relevanceScore || 0) + (article.urgencyScore || 0);
            await this.runQuery(query, [
                title, 
                url, 
                description,
                article.source || 'Unknown',
                article.credibilityScore || 0,
                article.relevanceScore || 0,
                article.urgencyScore || 0,
                totalScore,
                article.searchKeyword || '',
                article.publishedAt || new Date().toISOString()
            ]);
        } catch (error) {
            console.error('Error saving news post:', error);
        }
    }

    async saveArticleFeedback(articleUrl, userId, feedbackData) {
        const query = `INSERT INTO article_feedback 
                       (article_url, user_id, click_count, dwell_time, user_rating, feedback_type) 
                       VALUES ($1, $2, $3, $4, $5, $6)`;
        try {
            await this.runQuery(query, [
                articleUrl,
                userId,
                feedbackData.clickCount || 0,
                feedbackData.dwellTime || 0,
                feedbackData.userRating || null,
                feedbackData.feedbackType || 'view'
            ]);
        } catch (error) {
            console.error('Error saving article feedback:', error);
        }
    }

    async updateSearchAnalytics(keyword, layerType, successRate, avgRelevance) {
        const updateQuery = `INSERT OR REPLACE INTO search_analytics 
                           (search_keyword, layer_type, success_rate, avg_relevance_score, 
                           usage_count, last_used) 
                           VALUES ($1, $2, $3, $4, 
                           COALESCE((SELECT usage_count FROM search_analytics 
                           WHERE search_keyword = $1 AND layer_type = $2), 0) + 1,
                           CURRENT_TIMESTAMP)`;
        try {
            await this.runQuery(updateQuery, [keyword, layerType, successRate, avgRelevance]);
        } catch (error) {
            console.error('Error updating search analytics:', error);
        }
    }

    async getTopPerformingKeywords(layerType, limit = 10) {
        const query = `SELECT search_keyword, success_rate, avg_relevance_score, usage_count 
                       FROM search_analytics 
                       WHERE layer_type = $1 
                       ORDER BY (success_rate * avg_relevance_score) DESC 
                       LIMIT $2`;
        try {
            return await this.getQuery(query, [layerType, limit]);
        } catch (error) {
            console.error('Error getting top performing keywords:', error);
            return [];
        }
    }

    async getNewsAnalytics(days = 30) {
        const queries = this.isPostgres ? [
            `SELECT AVG(credibility_score) as avg_credibility, 
             AVG(relevance_score) as avg_relevance, 
             AVG(urgency_score) as avg_urgency,
             AVG(total_score) as avg_total,
             COUNT(*) as total_articles
             FROM news_posts 
             WHERE posted_at > NOW() - INTERVAL '${days} days'`,
            `SELECT source, COUNT(*) as article_count, AVG(total_score) as avg_score
             FROM news_posts 
             WHERE posted_at > NOW() - INTERVAL '${days} days'
             GROUP BY source 
             ORDER BY avg_score DESC`
        ] : [
            `SELECT AVG(credibility_score) as avg_credibility, 
             AVG(relevance_score) as avg_relevance, 
             AVG(urgency_score) as avg_urgency,
             AVG(total_score) as avg_total,
             COUNT(*) as total_articles
             FROM news_posts 
             WHERE posted_at > datetime('now', '-${days} days')`,
            `SELECT source, COUNT(*) as article_count, AVG(total_score) as avg_score
             FROM news_posts 
             WHERE posted_at > datetime('now', '-${days} days')
             GROUP BY source 
             ORDER BY avg_score DESC`
        ];

        try {
            const [overallStats] = await this.getQuery(queries[0]);
            const sourceStats = await this.getQuery(queries[1]);
            
            return {
                overall: overallStats,
                bySource: sourceStats
            };
        } catch (error) {
            console.error('Error getting news analytics:', error);
            return { overall: {}, bySource: [] };
        }
    }

    async getRecentUsers(days = 7) {
        const query = this.isPostgres
            ? `SELECT DISTINCT user_id, COUNT(*) as message_count
               FROM conversations 
               WHERE timestamp > NOW() - INTERVAL '${days} days'
               GROUP BY user_id
               ORDER BY message_count DESC`
            : `SELECT DISTINCT user_id, COUNT(*) as message_count
               FROM conversations 
               WHERE timestamp > datetime('now', '-${days} days')
               GROUP BY user_id
               ORDER BY message_count DESC`;
        try {
            return await this.getQuery(query);
        } catch (error) {
            console.error('Error getting recent users:', error);
            return [];
        }
    }

    async getMessageStats() {
        const queries = this.isPostgres ? [
            'SELECT COUNT(*) as total_messages FROM conversations',
            'SELECT COUNT(DISTINCT user_id) as unique_users FROM conversations',
            'SELECT COUNT(*) as messages_today FROM conversations WHERE DATE(timestamp) = CURRENT_DATE'
        ] : [
            'SELECT COUNT(*) as total_messages FROM conversations',
            'SELECT COUNT(DISTINCT user_id) as unique_users FROM conversations',
            'SELECT COUNT(*) as messages_today FROM conversations WHERE date(timestamp) = date("now")'
        ];

        try {
            const results = await Promise.all(
                queries.map(query => this.getQuery(query))
            );

            return {
                totalMessages: parseInt(results[0][0].total_messages),
                uniqueUsers: parseInt(results[1][0].unique_users),
                messagesToday: parseInt(results[2][0].messages_today)
            };
        } catch (error) {
            console.error('Error getting message stats:', error);
            return { totalMessages: 0, uniqueUsers: 0, messagesToday: 0 };
        }
    }

    close() {
        if (this.isPostgres && this.pgClient) {
            this.pgClient.end().then(() => {
                console.log('PostgreSQL connection closed');
            }).catch(err => {
                console.error('Error closing PostgreSQL connection:', err);
            });
        } else if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing SQLite database:', err);
                } else {
                    console.log('SQLite database connection closed');
                }
            });
        }
    }
}

module.exports = DatabaseService;