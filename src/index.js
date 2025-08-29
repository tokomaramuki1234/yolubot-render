require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const cron = require('node-cron');
const GeminiService = require('./services/geminiService');
const AdvancedNewsService = require('./services/advancedNewsService');
const WebSearchService = require('./services/webSearchService');
const DatabaseService = require('./services/databaseService');
const PermissionChecker = require('./utils/permissionChecker');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// シンプル化された重複防止システム
const processingMessages = new Set();
const userCooldowns = new Map();
const COOLDOWN_DURATION = 5000;

// サービス初期化
const geminiService = new GeminiService();
const webSearchService = new WebSearchService();
const databaseService = new DatabaseService();
const newsService = new AdvancedNewsService(webSearchService, databaseService);

client.once(Events.ClientReady, async (c) => {
    console.log(`🤖 YOLUBot接続完了: ${c.user.tag}`);
    
    try {
        await databaseService.init();
        console.log('✅ データベース初期化完了');
        
        // 権限チェック
        await PermissionChecker.logPermissionCheck(client, process.env.CHANNEL_ID);
        console.log('✅ 権限チェック完了');
        
    } catch (error) {
        console.error('❌ 初期化エラー:', error);
    }
    
    // 定期ニュース投稿（朝7時・夜19時）
    cron.schedule('0 7,19 * * *', () => postBoardGameNews());
    
    // 週次ユーザー設定分析（日曜日2時）
    cron.schedule('0 2 * * 0', () => analyzeUserPreferences());
});

client.on(Events.MessageCreate, async (message) => {
    // Bot・システム・Webhookメッセージを除外
    if (message.author.bot || message.author.system || message.webhookId) {
        return;
    }
    
    // コマンドプレフィックスをスキップ
    if (message.content.startsWith('!') || message.content.startsWith('/')) {
        return;
    }
    
    // メンション判定
    if (!message.mentions.has(client.user)) {
        return;
    }
    
    // 重複処理防止
    if (processingMessages.has(message.id)) {
        return;
    }
    
    // クールダウンチェック
    const userId = message.author.id;
    const now = Date.now();
    
    if (userCooldowns.has(userId)) {
        const cooldownExpiry = userCooldowns.get(userId);
        if (now < cooldownExpiry) {
            await message.react('⏰');
            return;
        }
    }
    
    // 処理開始
    processingMessages.add(message.id);
    userCooldowns.set(userId, now + COOLDOWN_DURATION);
    
    try {
        await handleUserQuestion(message);
    } catch (error) {
        console.error(`❌ ユーザー質問処理エラー:`, error);
        try {
            await message.reply({
                content: '申し訳ございません。エラーが発生しました。しばらく時間をおいて再度お試しください。',
                allowedMentions: { repliedUser: true }
            });
        } catch (replyError) {
            console.error('❌ エラー応答送信失敗:', replyError);
        }
    } finally {
        processingMessages.delete(message.id);
    }
});

async function handleUserQuestion(message) {
    try {
        await message.channel.sendTyping();
        
        const conversationHistory = await databaseService.getConversationHistory(message.author.id, 5);
        const userPreferences = await databaseService.getUserPreferences(message.author.id);
        
        // メッセージからBOTメンションを除去
        const cleanMessage = message.content
            .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
            .trim();
        
        // AI応答生成
        const response = await geminiService.generateResponse(
            cleanMessage, 
            conversationHistory, 
            userPreferences
        );
        
        // データベース保存
        await databaseService.saveMessage(message.author.id, cleanMessage, response);
        
        // ユーザー設定分析（5メッセージごと）
        if (conversationHistory.length % 5 === 4) {
            await updateUserPreferences(message.author.id);
        }
        
        // レスポンス送信
        if (response.length > 2000) {
            // 長文の場合は分割して送信
            const chunks = splitMessage(response, 2000);
            
            await message.reply({
                content: chunks[0],
                allowedMentions: { repliedUser: true }
            });
            
            for (let i = 1; i < chunks.length; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                await message.channel.send(chunks[i]);
            }
        } else {
            await message.reply({
                content: response,
                allowedMentions: { repliedUser: true }
            });
        }
        
    } catch (error) {
        console.error('❌ handleUserQuestion エラー:', error);
        throw error;
    }
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        switch (commandName) {
            case 'news':
                await handleNewsCommand(interaction);
                break;
            case 'stats':
                await handleStatsCommand(interaction);
                break;
            case 'preferences':
                await handlePreferencesCommand(interaction);
                break;
            case 'permissions':
                await handlePermissionsCommand(interaction);
                break;
            case 'analytics':
                await handleAnalyticsCommand(interaction);
                break;
            case 'websearch':
                await handleWebSearchCommand(interaction);
                break;
            case 'help':
                await handleHelpCommand(interaction);
                break;
            default:
                await interaction.reply('Unknown command');
        }
    } catch (error) {
        console.error(`❌ コマンドエラー '${commandName}':`, error);
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'コマンドの実行中にエラーが発生しました。', ephemeral: true });
            } else {
                await interaction.reply({ content: 'コマンドの実行中にエラーが発生しました。', ephemeral: true });
            }
        } catch (replyError) {
            console.error('❌ エラーメッセージ送信失敗:', replyError);
        }
    }
});

async function postBoardGameNews() {
    try {
        console.log('📰 定期ニュース投稿開始');
        
        const channel = client.channels.cache.get(process.env.CHANNEL_ID);
        if (!channel) {
            console.error('❌ チャンネルが見つかりません:', process.env.CHANNEL_ID);
            return;
        }

        const newsArticles = await newsService.getBoardGameNews(true);
        
        if (newsArticles.length === 1 && newsArticles[0].isNoNewsMessage) {
            await channel.send(newsArticles[0].description);
            return;
        }
        
        const articlesToPost = newsArticles.slice(0, 3);
        
        for (const [index, article] of articlesToPost.entries()) {
            try {
                const summary = await geminiService.summarizeArticle(article);
                const trimmedSummary = summary.length > 500 ? 
                    summary.substring(0, 497) + '...' : summary;
                
                const embed = {
                    title: article.title,
                    description: trimmedSummary,
                    url: article.url || undefined,
                    color: getScoreColor(article),
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: `${article.source} • 信頼度:${article.credibilityScore || 'N/A'} 話題性:${article.relevanceScore || 'N/A'} 速報性:${article.urgencyScore || 'N/A'}`
                    }
                };

                const totalScore = getTotalScore(article);
                if (totalScore > 200) {
                    embed.author = { name: '🔥 高評価ニュース' };
                }
                
                await channel.send({ embeds: [embed] });
                
                if (index < articlesToPost.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (articleError) {
                console.error(`記事投稿エラー "${article.title}":`, articleError);
            }
        }
        
        console.log(`✅ ニュース投稿完了: ${articlesToPost.length}件`);
        
    } catch (error) {
        console.error('❌ 定期ニュース投稿エラー:', error);
    }
}

// コマンドハンドラー群
async function handleNewsCommand(interaction) {
    await interaction.deferReply();

    try {
        const newsArticles = await newsService.getBoardGameNews(false, 3);
        
        if (newsArticles.length === 1 && newsArticles[0].isNoNewsMessage) {
            await interaction.editReply(newsArticles[0].description);
            return;
        }

        const embeds = await Promise.all(newsArticles.map(async (article) => {
            const summary = await geminiService.summarizeArticle(article);
            const trimmedSummary = summary.length > 300 ? 
                summary.substring(0, 297) + '...' : summary;

            return {
                title: article.title,
                description: trimmedSummary,
                url: article.url || undefined,
                color: getScoreColor(article),
                timestamp: new Date().toISOString(),
                footer: {
                    text: `${article.source} • スコア: ${getTotalScore(article)}`
                }
            };
        }));

        await interaction.editReply({ embeds });
        
    } catch (error) {
        console.error('❌ newsコマンドエラー:', error);
        await interaction.editReply('ニュースの取得中にエラーが発生しました。');
    }
}

async function handleStatsCommand(interaction) {
    try {
        const stats = await databaseService.getStats();
        const webSearchStats = webSearchService.getUsageStats();
        
        const embed = {
            title: '📊 YOLUBot統計情報',
            fields: [
                {
                    name: '💬 会話統計',
                    value: `総メッセージ数: ${stats.totalMessages || 0}\n総ユーザー数: ${stats.totalUsers || 0}`,
                    inline: true
                },
                {
                    name: '🔍 検索統計',
                    value: `本日のSerper使用: ${webSearchStats.today.serper}\n本日のGoogle使用: ${webSearchStats.today.google}\nキャッシュサイズ: ${webSearchStats.cacheSize}`,
                    inline: true
                }
            ],
            color: 0x0099ff,
            timestamp: new Date().toISOString()
        };
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('❌ statsコマンドエラー:', error);
        await interaction.reply('統計情報の取得中にエラーが発生しました。');
    }
}

async function handlePreferencesCommand(interaction) {
    try {
        const userId = interaction.user.id;
        const preferences = await databaseService.getUserPreferences(userId);
        
        if (!preferences) {
            await interaction.reply('まだ設定が記録されていません。メッセージを送って会話を開始してください。');
            return;
        }
        
        const embed = {
            title: '🎯 あなたの設定',
            description: `**興味のあるゲーム**: ${preferences.favoriteGenres?.join(', ') || 'まだ学習中'}\n**プレイヤー人数**: ${preferences.preferredPlayerCount || 'まだ学習中'}\n**複雑さ**: ${preferences.complexityPreference || 'まだ学習中'}`,
            color: 0x00ff99,
            timestamp: new Date().toISOString(),
            footer: {
                text: `最終更新: ${new Date(preferences.lastUpdated).toLocaleString('ja-JP')}`
            }
        };
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('❌ preferencesコマンドエラー:', error);
        await interaction.reply('設定情報の取得中にエラーが発生しました。');
    }
}

async function handlePermissionsCommand(interaction) {
    try {
        const permissions = await PermissionChecker.checkBotPermissions(client, interaction.guildId);
        
        const embed = {
            title: '🔐 Bot権限チェック',
            description: Object.entries(permissions)
                .map(([perm, has]) => `${has ? '✅' : '❌'} ${perm}`)
                .join('\n'),
            color: Object.values(permissions).every(Boolean) ? 0x00ff00 : 0xff9900,
            timestamp: new Date().toISOString()
        };
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('❌ permissionsコマンドエラー:', error);
        await interaction.reply('権限チェック中にエラーが発生しました。');
    }
}

async function handleAnalyticsCommand(interaction) {
    try {
        const analytics = await newsService.getAnalytics();
        
        const embed = {
            title: '📈 詳細分析',
            fields: [
                {
                    name: '🔍 検索統計',
                    value: `成功率: ${analytics.searchSuccessRate}%\n平均応答時間: ${analytics.avgResponseTime}ms`,
                    inline: true
                },
                {
                    name: '📰 ニュース品質',
                    value: `平均スコア: ${analytics.avgNewsScore}\n高品質記事率: ${analytics.highQualityRate}%`,
                    inline: true
                }
            ],
            color: 0x9932cc,
            timestamp: new Date().toISOString()
        };
        
        await interaction.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('❌ analyticsコマンドエラー:', error);
        await interaction.reply('分析データの取得中にエラーが発生しました。');
    }
}

async function handleWebSearchCommand(interaction) {
    await interaction.deferReply();
    
    try {
        const query = interaction.options.getString('query');
        const results = await webSearchService.search(query, { maxResults: 3 });
        
        if (!results || results.length === 0) {
            await interaction.editReply(`検索結果が見つかりませんでした: "${query}"`);
            return;
        }
        
        const embed = {
            title: `🔍 検索結果: "${query}"`,
            fields: results.slice(0, 3).map((result, index) => ({
                name: `${index + 1}. ${result.title}`,
                value: `${result.description}\n[🔗 リンク](${result.url})`,
                inline: false
            })),
            color: 0x4287f5,
            timestamp: new Date().toISOString(),
            footer: {
                text: `検索プロバイダー: ${results[0]?.provider || 'Unknown'}`
            }
        };
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('❌ websearchコマンドエラー:', error);
        await interaction.editReply('Web検索中にエラーが発生しました。');
    }
}

async function handleHelpCommand(interaction) {
    const embed = {
        title: '🤖 YOLUBot ヘルプ',
        description: 'ボードゲーム専門のDiscord Botです。',
        fields: [
            {
                name: '💬 基本的な使い方',
                value: 'Botをメンション（@YOLUBot）してメッセージを送信してください。',
                inline: false
            },
            {
                name: '🎮 利用可能コマンド',
                value: '`/news` - 最新ニュース取得\n`/stats` - Bot統計情報\n`/preferences` - あなたの設定確認\n`/permissions` - Bot権限チェック\n`/analytics` - 詳細分析\n`/websearch` - Web検索',
                inline: false
            },
            {
                name: '⏰ 自動機能',
                value: '毎日7時と19時にニュースを自動投稿\n週1回ユーザー設定を分析・更新',
                inline: false
            }
        ],
        color: 0xff6b35,
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [embed] });
}

// ヘルパー関数群
function splitMessage(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    
    const sentences = text.split('\n');
    
    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length + 1 <= maxLength) {
            currentChunk += (currentChunk ? '\n' : '') + sentence;
        } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = sentence;
        }
    }
    
    if (currentChunk) chunks.push(currentChunk);
    
    return chunks;
}

function getScoreColor(article) {
    const totalScore = getTotalScore(article);
    if (totalScore > 200) return 0xff0000; // 赤
    if (totalScore > 150) return 0xff9900; // オレンジ
    if (totalScore > 100) return 0xffff00; // 黄色
    return 0x99ccff; // 青
}

function getTotalScore(article) {
    return (article.credibilityScore || 0) + 
           (article.relevanceScore || 0) + 
           (article.urgencyScore || 0);
}

async function updateUserPreferences(userId) {
    try {
        const conversationHistory = await databaseService.getConversationHistory(userId, 20);
        
        if (conversationHistory.length < 5) return;
        
        const preferences = await geminiService.analyzeUserPreferences(conversationHistory);
        await databaseService.updateUserPreferences(userId, preferences);
        
        console.log(`✅ ユーザー設定更新完了: ${userId}`);
        
    } catch (error) {
        console.error(`❌ ユーザー設定更新エラー (${userId}):`, error);
    }
}

async function analyzeUserPreferences() {
    try {
        const users = await databaseService.getAllActiveUsers();
        console.log(`📊 週次分析開始: ${users.length}ユーザー`);
        
        for (const userId of users) {
            await updateUserPreferences(userId);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('✅ 週次ユーザー設定分析完了');
        
    } catch (error) {
        console.error('❌ 週次分析エラー:', error);
    }
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
    console.error('❌ 未処理のPromise拒否:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ 未処理の例外:', error);
    process.exit(1);
});

client.login(process.env.DISCORD_TOKEN);