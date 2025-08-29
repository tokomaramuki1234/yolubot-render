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

// 重複防止・レート制限対策
const userCooldowns = new Map();
const processingMessages = new Set();
const processedMessages = new Map(); // 新規追加：メッセージ重複防止
const COOLDOWN_DURATION = 5000; // 5秒
const MESSAGE_CACHE_DURATION = 30000; // 30秒

const geminiService = new GeminiService();
const webSearchService = new WebSearchService();
const newsService = new AdvancedNewsService(webSearchService);
const databaseService = new DatabaseService();

// Gateway接続監視
let connectionCount = 0;
let isConnected = false;

client.once(Events.ClientReady, async (c) => {
    connectionCount++;
    isConnected = true;
    console.log(`🔗 [CONNECTION #${connectionCount}] Discord Gateway接続完了`);
    console.log(`🤖 Bot User: ${c.user.tag} (ID: ${c.user.id})`);
    console.log(`📊 接続状態: ${client.ws.status}`);
    
    try {
        await databaseService.init();
        console.log('✅ データベース初期化完了');
    } catch (error) {
        console.error('❌ データベース初期化失敗:', error);
    }
    
    // WebSearchServiceとAdvancedNewsServiceの実装確認
    try {
        const health = await newsService.healthCheck();
        console.log('📊 AdvancedNewsService Health Check:', health);
    } catch (error) {
        console.error('❌ AdvancedNewsService Health Check Failed:', error.message);
    }
    
    // 権限チェックを実行
    try {
        await PermissionChecker.logPermissionCheck(client, process.env.CHANNEL_ID);
    } catch (error) {
        console.error('❌ 権限チェック失敗:', error);
    }
    
    // 定期ニュース投稿スケジュール（朝7時・夜19時）
    cron.schedule('0 7,19 * * *', async () => {
        console.log('⏰ 定期ニュース更新実行中...');
        await postBoardGameNews();
    });
    
    // 週次ユーザー設定分析（日曜日2時）
    cron.schedule('0 2 * * 0', async () => {
        console.log('📊 週次ユーザー設定分析実行中...');
        await analyzeUserPreferences();
    });
});

client.on('disconnect', () => {
    isConnected = false;
    console.log(`❌ [CONNECTION #${connectionCount}] Discord Gateway切断`);
});

client.on('reconnecting', () => {
    console.log(`🔄 [CONNECTION #${connectionCount}] Discord Gateway再接続中...`);
});

client.on('resume', () => {
    console.log(`▶️ [CONNECTION #${connectionCount}] Discord Gateway接続復旧`);
});

// WebSocket状態監視
setInterval(() => {
    if (isConnected) {
        console.log(`📡 WebSocket状態: ${client.ws.status} | Ping: ${client.ws.ping}ms | 接続数: ${connectionCount}`);
    }
}, 300000); // 5分毎

// メッセージ重複防止システム（強化版）
client.on(Events.MessageCreate, async (message) => {
    // 🔥 緊急修正: Bot・System・Webhookメッセージの完全除外
    if (message.author.bot || message.author.system || message.webhookId) {
        // デバッグログのみ出力して処理終了
        if (message.author.bot && message.author.id === client.user.id) {
            console.log(`🤖 [DEBUG] 自分のBot応答を検出: ${message.id} - "${message.content.substring(0, 50)}..."`);
        }
        return; // ここで完全に処理終了
    }
    
    // 重複メッセージチェック（強化版）
    const messageHash = `${message.id}-${message.author.id}-${message.createdTimestamp}`;
    
    if (processedMessages.has(messageHash)) {
        console.log(`⚠️ [重要] 重複メッセージ検出: ${messageHash} from ${message.author.tag}`);
        console.log(`   初回処理時刻: ${new Date(processedMessages.get(messageHash)).toISOString()}`);
        console.log(`   重複検出時刻: ${new Date().toISOString()}`);
        return;
    }
    
    // メッセージをキャッシュに追加
    processedMessages.set(messageHash, Date.now());
    console.log(`📥 [重要] 新規メッセージ登録: ${messageHash} from ${message.author.tag}`);
    
    // 古いキャッシュを削除
    setTimeout(() => {
        processedMessages.delete(messageHash);
        console.log(`🗑️ キャッシュ削除: ${messageHash}`);
    }, MESSAGE_CACHE_DURATION);
    
    // コマンドプレフィックスのスキップ
    if (message.content.startsWith('!') || message.content.startsWith('/')) {
        return;
    }
    
    // メンション判定（より厳密に）
    if (!message.mentions.has(client.user)) {
        return;
    }
    
    // 重複処理防止（既存システムとの併用）
    if (processingMessages.has(message.id)) {
        console.log(`⚠️ 既存システムでの重複処理をスキップ: ${message.id}`);
        return;
    }
    
    // クールダウンチェック
    const userId = message.author.id;
    const now = Date.now();
    
    if (userCooldowns.has(userId)) {
        const cooldownExpiry = userCooldowns.get(userId);
        if (now < cooldownExpiry) {
            const remainingTime = Math.ceil((cooldownExpiry - now) / 1000);
            console.log(`❄️ ユーザー ${message.author.tag} はクールダウン中 (残り${remainingTime}秒)`);
            
            // クールダウン中の通知（1回のみ）
            try {
                await message.react('⏰');
            } catch (error) {
                console.error('クールダウンリアクション失敗:', error);
            }
            return;
        }
    }
    
    // 処理開始
    processingMessages.add(message.id);
    userCooldowns.set(userId, now + COOLDOWN_DURATION);
    
    console.log(`📝 [重要] ユーザー質問処理開始: ${message.author.tag} - "${message.content.substring(0, 50)}..." (Hash: ${messageHash})`);
    
    try {
        await handleUserQuestion(message);
    } catch (error) {
        console.error(`❌ ユーザー質問処理エラー (${message.author.tag}):`, error);
    } finally {
        // 処理完了後のクリーンアップ
        processingMessages.delete(message.id);
        
        // 10分後にクリーンアップ（メモリリーク防止）
        setTimeout(() => {
            processingMessages.delete(message.id);
        }, 10 * 60 * 1000);
        
        console.log(`🧹 [重要] メッセージ処理完了: ${messageHash}`);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    console.log('🎯 Interaction received:', interaction.type, interaction.commandName || 'no-command');
    
    if (!interaction.isChatInputCommand()) {
        console.log('❌ Not a chat input command');
        return;
    }

    const { commandName } = interaction;
    console.log(`📝 Processing command: ${commandName}`);

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
        console.error(`🚨 Error handling slash command '${commandName}':`, error);
        const errorMessage = 'コマンドの実行中にエラーが発生しました。';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (replyError) {
            console.error('🚨 Error sending error message:', replyError);
        }
    }
});

async function postBoardGameNews() {
    try {
        console.log('📰 定期ニュース投稿開始...');
        
        const channel = client.channels.cache.get(process.env.CHANNEL_ID);
        if (!channel) {
            console.error('❌ チャンネルが見つかりません: ', process.env.CHANNEL_ID);
            return;
        }

        const newsArticles = await newsService.getBoardGameNews(true); // isScheduled = true
        
        if (newsArticles.length === 1 && newsArticles[0].isNoNewsMessage) {
            await channel.send(newsArticles[0].description);
            console.log('📰 ニュースなしメッセージを投稿');
            return;
        }
        
        let successCount = 0;
        const articlesToPost = newsArticles.slice(0, 3);
        
        for (const [index, article] of articlesToPost.entries()) {
            try {
                const summary = await geminiService.summarizeArticle(article);
                
                // 記事の長さ制限（500文字以下）
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

                // 高スコア記事の特別表示
                const totalScore = getTotalScore(article);
                if (totalScore > 200) {
                    embed.author = {
                        name: '🔥 高評価ニュース'
                    };
                }
                
                await channel.send({ embeds: [embed] });
                successCount++;
                
                // 連投防止
                if (index < articlesToPost.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (articleError) {
                console.error(`記事投稿エラー "${article.title}":`, articleError);
                continue; // 他の記事は継続
            }
        }
        
        // 投稿済み記事としてマーク
        if (successCount > 0) {
            await newsService.markArticlesAsPosted(articlesToPost.slice(0, successCount));
            console.log(`✅ 定期ニュース投稿完了: ${successCount}件`);
        }
        
    } catch (error) {
        console.error('❌ 定期ニュース投稿エラー:', error);
        
        // エラー通知（オプション）
        try {
            const channel = client.channels.cache.get(process.env.CHANNEL_ID);
            if (channel) {
                await channel.send('⚠️ ニュース取得中にエラーが発生しました。管理者に連絡してください。');
            }
        } catch (notifyError) {
            console.error('エラー通知失敗:', notifyError);
        }
    }
}

async function handleUserQuestion(message) {
    const messageId = message.id;
    const userId = message.author.id;
    const userTag = message.author.tag;
    
    console.log(`🔍 [DEBUG] handleUserQuestion開始: ${userTag} (${messageId})`);
    
    try {
        // 入力指示の送信
        await message.channel.sendTyping();
        
        console.log(`🧠 [DEBUG] AI応答生成開始: ${userTag}`);
        
        const conversationHistory = await databaseService.getConversationHistory(userId, 10);
        const userPreferences = await databaseService.getUserPreferences(userId);
        
        console.log(`📊 [DEBUG] 会話履歴: ${conversationHistory.length}件, 設定: ${userPreferences ? 'あり' : 'なし'}`);
        
        // 🔥 重要: AI応答を1回だけ生成
        const response = await geminiService.generateResponse(message.content, conversationHistory, userPreferences);
        
        console.log(`✍️ [DEBUG] AI応答生成完了: ${response.length}文字`);
        console.log(`📝 [DEBUG] 応答内容プレビュー: "${response.substring(0, 100)}..."`);
        
        // データベース保存
        await databaseService.saveMessage(userId, message.content, response);
        console.log(`💾 [DEBUG] データベース保存完了`);
        
        const messageCount = conversationHistory.length + 1;
        if (messageCount % 5 === 0) {
            console.log(`📈 [DEBUG] ユーザー設定分析実行: ${userId} (${messageCount}メッセージ後)`);
            await updateUserPreferences(userId);
        }
        
        // 🔥 重要: リプライを1回だけ送信
        console.log(`📤 [DEBUG] リプライ送信準備: ${userTag}`);
        
        const MAX_MESSAGE_LENGTH = 2000;
        if (response.length > MAX_MESSAGE_LENGTH) {
            console.log(`📏 [DEBUG] 長文対応: ${response.length}文字を分割`);
            const chunks = response.match(/.{1,2000}/g);
            
            console.log(`📤 [DEBUG] 1回目のリプライ送信: ${chunks[0].length}文字`);
            await message.reply({
                content: chunks[0],
                allowedMentions: { repliedUser: true }
            });
            
            for (let i = 1; i < chunks.length; i++) {
                console.log(`📤 [DEBUG] 追加メッセージ送信 ${i+1}/${chunks.length}: ${chunks[i].length}文字`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
                await message.channel.send(chunks[i]);
            }
        } else {
            console.log(`📤 [DEBUG] 単一リプライ送信: ${response.length}文字`);
            await message.reply({
                content: response,
                allowedMentions: { repliedUser: true }
            });
        }
        
        console.log(`✅ [DEBUG] AI応答送信完了: ${userTag} (メッセージID: ${messageId})`);
        
    } catch (error) {
        console.error(`❌ [ERROR] ユーザー質問処理エラー (${userTag}, ${messageId}):`, error);
        console.error(`❌ [ERROR] エラースタック:`, error.stack);
        
        try {
            console.log(`🚨 [DEBUG] エラー応答送信: ${userTag}`);
            await message.reply({
                content: '申し訳ございません。エラーが発生しました。しばらく時間をおいて再度お試しください。',
                allowedMentions: { repliedUser: true }
            });
        } catch (replyError) {
            console.error(`❌ [ERROR] エラー返信送信失敗 (${userTag}):`, replyError);
        }
    }
}

async function updateUserPreferences(userId) {
    try {
        const conversationHistory = await databaseService.getConversationHistory(userId, 20);
        if (conversationHistory.length < 3) return;
        
        const preferences = await geminiService.analyzeUserPreferences(conversationHistory);
        if (preferences) {
            await databaseService.saveUserPreferences(userId, preferences);
            console.log(`Updated preferences for user ${userId}`);
        }
    } catch (error) {
        console.error('Error updating user preferences:', error);
    }
}

async function analyzeUserPreferences() {
    try {
        const recentUsers = await databaseService.getRecentUsers(7);
        
        for (const user of recentUsers) {
            if (user.message_count >= 3) {
                await updateUserPreferences(user.user_id);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        const stats = await databaseService.getMessageStats();
        console.log('Weekly Analysis Complete:', stats);
    } catch (error) {
        console.error('Error in weekly analysis:', error);
    }
}

async function handleNewsCommand(interaction) {
    await interaction.deferReply();
    
    try {
        console.log('🔍 手動ニュース検索開始...');
        const startTime = Date.now();
        
        const newsArticles = await newsService.getBoardGameNews(false); // 6時間以内
        
        // デバッグ情報
        const stats = newsService.getSearchStats();
        console.log('📊 検索統計:', JSON.stringify(stats, null, 2));
        console.log(`⏱️ 検索時間: ${Date.now() - startTime}ms`);
        
        if (newsArticles.length === 1 && newsArticles[0].isNoNewsMessage) {
            await interaction.editReply(newsArticles[0].description);
            return;
        }
        
        if (newsArticles.length === 0) {
            await interaction.editReply('直近6時間以内にめぼしいニュースはありませんでしたヨモ');
            return;
        }

        const embeds = [];
        const topArticles = newsArticles.slice(0, 3);
        
        for (const article of topArticles) {
            try {
                const summary = await geminiService.summarizeArticle(article);
                
                // 500文字制限
                const trimmedSummary = summary.length > 500 ? 
                    summary.substring(0, 497) + '...' : summary;
                
                if (article.url && article.title) {
                    const embed = {
                        title: article.title,
                        description: trimmedSummary,
                        url: article.url,
                        color: getScoreColor(article),
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `${article.source} • 信頼度:${article.credibilityScore || 'N/A'} 話題性:${article.relevanceScore || 'N/A'} 速報性:${article.urgencyScore || 'N/A'}`
                        }
                    };

                    // 高スコア記事の特別表示
                    if (getTotalScore(article) > 200) {
                        embed.author = {
                            name: '🔥 高評価ニュース'
                        };
                    }

                    embeds.push(embed);
                }
            } catch (summaryError) {
                console.error(`記事要約エラー "${article.title}":`, summaryError);
                // 要約失敗時は元の説明を使用
                if (article.url && article.title) {
                    embeds.push({
                        title: article.title,
                        description: article.description || '記事の詳細はURLをご確認ください。',
                        url: article.url,
                        color: 0x0099ff,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `${article.source} • スコア情報取得エラー`
                        }
                    });
                }
            }
        }

        if (embeds.length > 0) {
            await interaction.editReply({ embeds });
            
            // 手動取得記事も投稿済みとしてマーク
            await newsService.markArticlesAsPosted(topArticles.filter(a => !a.isNoNewsMessage));
            
        } else {
            await interaction.editReply('記事の処理中にエラーが発生しました。');
        }
        
    } catch (error) {
        console.error('❌ ニュースコマンドエラー:', error);
        await interaction.editReply('ニュースの取得中にエラーが発生しました。`/websearch`でシステム状況をご確認ください。');
    }
}

async function handleStatsCommand(interaction) {
    try {
        const stats = await databaseService.getMessageStats();
        
        const embed = {
            title: '📊 BOT統計情報',
            fields: [
                {
                    name: '総メッセージ数',
                    value: stats.totalMessages.toString(),
                    inline: true
                },
                {
                    name: 'ユニークユーザー数',
                    value: stats.uniqueUsers.toString(),
                    inline: true
                },
                {
                    name: '今日のメッセージ数',
                    value: stats.messagesToday.toString(),
                    inline: true
                }
            ],
            color: 0x00ff00,
            timestamp: new Date().toISOString()
        };
        
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in stats command:', error);
        await interaction.reply('統計情報の取得中にエラーが発生しました。');
    }
}

async function handlePreferencesCommand(interaction) {
    try {
        const preferences = await databaseService.getUserPreferences(interaction.user.id);
        
        if (!preferences) {
            await interaction.reply({
                content: 'まだ学習データがありません。BOTと会話を続けると、あなたの好みを学習します！',
                ephemeral: true
            });
            return;
        }
        
        const embed = {
            title: '🎲 あなたの学習済み好み',
            fields: [
                {
                    name: '好みのジャンル',
                    value: preferences.preferences.length > 0 ? preferences.preferences.join(', ') : 'データなし',
                    inline: false
                },
                {
                    name: '興味のあるトピック',
                    value: preferences.interests.length > 0 ? preferences.interests.join(', ') : 'データなし',
                    inline: false
                },
                {
                    name: '経験レベル',
                    value: preferences.experience_level || 'データなし',
                    inline: true
                },
                {
                    name: '好みのメカニクス',
                    value: preferences.favorite_mechanics.length > 0 ? preferences.favorite_mechanics.join(', ') : 'データなし',
                    inline: false
                }
            ],
            color: 0xff9900,
            footer: {
                text: '会話を続けることで、より正確な好み分析が可能になります'
            }
        };
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error in preferences command:', error);
        await interaction.reply('好み情報の取得中にエラーが発生しました。');
    }
}

async function handlePermissionsCommand(interaction) {
    // 管理者権限チェック
    if (!interaction.member.permissions.has('Administrator')) {
        await interaction.reply({
            content: '❌ このコマンドは管理者のみ使用できます。',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const guild = interaction.guild;
        const botMember = guild.members.cache.get(client.user.id);
        
        if (!botMember) {
            await interaction.editReply('❌ BOTメンバー情報を取得できませんでした。');
            return;
        }

        const report = PermissionChecker.generatePermissionReport(guild, botMember);
        
        // レポートが長い場合は分割
        if (report.length > 2000) {
            const chunks = report.match(/[\s\S]{1,2000}/g);
            await interaction.editReply(chunks[0]);
            
            for (let i = 1; i < chunks.length; i++) {
                await interaction.followUp({ content: chunks[i], ephemeral: true });
            }
        } else {
            await interaction.editReply(report);
        }
    } catch (error) {
        console.error('Error in permissions command:', error);
        await interaction.editReply('権限チェック中にエラーが発生しました。');
    }
}

async function handleAnalyticsCommand(interaction) {
    try {
        // 管理者権限チェック
        if (!interaction.member.permissions.has('Administrator')) {
            await interaction.reply({ content: 'このコマンドは管理者限定です。', ephemeral: true });
            return;
        }

        await interaction.deferReply();

        // 高度な分析データを取得
        const analytics = await databaseService.getNewsAnalytics(30);
        
        const embed = {
            title: '📊 高度ニュース分析レポート (過去30日)',
            fields: [
                {
                    name: '📈 総合統計',
                    value: `総記事数: ${analytics.overall.total_articles || 0}\n平均信頼度: ${Math.round(analytics.overall.avg_credibility || 0)}/100\n平均話題性: ${Math.round(analytics.overall.avg_relevance || 0)}/100\n平均速報性: ${Math.round(analytics.overall.avg_urgency || 0)}/100\n総合平均スコア: ${Math.round(analytics.overall.avg_total || 0)}/300\n実記事成功率: ${analytics.overall.success_rate || '0%'}`,
                    inline: true
                },
                {
                    name: '🎯 品質指標',
                    value: `🔥 高評価記事: ${analytics.bySource.filter(s => s.avg_score > 200).length}件\n⭐ 良質記事: ${analytics.bySource.filter(s => s.avg_score > 150 && s.avg_score <= 200).length}件\n📰 標準記事: ${analytics.bySource.filter(s => s.avg_score <= 150).length}件`,
                    inline: true
                },
                {
                    name: '📡 トップソース',
                    value: analytics.bySource.slice(0, 5).map((source, index) => 
                        `${index + 1}. ${source.source}: ${Math.round(source.avg_score)}/300 (${source.article_count}件)`
                    ).join('\n') || 'データなし',
                    inline: false
                }
            ],
            color: 0xFF6B6B,
            timestamp: new Date().toISOString(),
            footer: {
                text: '高度ニュース分析システム v2.0'
            }
        };

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in analytics command:', error);
        await interaction.editReply('分析データの取得中にエラーが発生しました。');
    }
}

async function handleWebSearchCommand(interaction) {
    try {
        // 管理者権限チェック
        if (!interaction.member.permissions.has('Administrator')) {
            await interaction.reply({ 
                content: 'このコマンドは管理者限定です。', 
                ephemeral: true 
            });
            return;
        }

        await interaction.deferReply();

        // 安全な統計取得
        let stats = {
            today: { serper: 0, google: 0, resetDate: new Date().toDateString() },
            providers: [],
            cacheSize: 0,
            error: '統計情報取得中にエラーが発生しました'
        };

        let health = {
            serper: { status: 'unknown', reason: 'チェック中にエラーが発生しました' },
            google: { status: 'unknown', reason: 'チェック中にエラーが発生しました' }
        };

        try {
            // newsServiceが利用可能かチェック
            if (newsService && typeof newsService.getWebSearchStats === 'function') {
                stats = newsService.getWebSearchStats();
            } else {
                console.warn('getWebSearchStats method not available');
                stats.error = 'getWebSearchStats メソッドが利用できません';
            }
        } catch (statsError) {
            console.error('Stats retrieval error:', statsError);
            stats.error = `統計取得エラー: ${statsError.message}`;
        }

        try {
            // ヘルスチェック
            if (newsService && typeof newsService.checkWebSearchHealth === 'function') {
                health = await newsService.checkWebSearchHealth();
            } else {
                console.warn('checkWebSearchHealth method not available');
                health = {
                    serper: { status: 'unknown', reason: 'checkWebSearchHealth メソッドが利用できません' },
                    google: { status: 'unknown', reason: 'checkWebSearchHealth メソッドが利用できません' }
                };
            }
        } catch (healthError) {
            console.error('Health check error:', healthError);
            health = {
                serper: { status: 'error', error: healthError.message },
                google: { status: 'error', error: healthError.message }
            };
        }

        // 結果表示用のembed作成
        const embed = {
            title: '🔍 WebSearch システム状況',
            fields: [
                {
                    name: '📊 本日の使用量',
                    value: `Serper: ${stats.today.serper}\nGoogle: ${stats.today.google}\nリセット日: ${stats.today.resetDate}`,
                    inline: true
                },
                {
                    name: '⚙️ プロバイダー設定',
                    value: stats.providers.length > 0 ? 
                        stats.providers.map(p => 
                            `${p.name}: ${p.enabled ? '✅' : '❌'} (制限: ${p.rateLimit})`
                        ).join('\n') : 
                        'プロバイダー情報取得エラー',
                    inline: true
                },
                {
                    name: '🗄️ キャッシュ状況',
                    value: `キャッシュサイズ: ${stats.cacheSize}件`,
                    inline: true
                },
                {
                    name: '🏥 健全性チェック',
                    value: Object.entries(health).map(([provider, status]) => {
                        const statusIcon = status.status === 'healthy' ? '✅' : 
                                       status.status === 'disabled' ? '⚠️' : '❌';
                        const reason = status.reason || status.error || '';
                        return `${provider}: ${statusIcon} ${reason}`;
                    }).join('\n'),
                    inline: false
                }
            ],
            color: 0x00ff00,
            timestamp: new Date().toISOString(),
            footer: {
                text: 'WebSearch統合システム v2.0.1'
            }
        };

        // エラー情報がある場合は色を変更
        if (stats.error) {
            embed.color = 0xff9900; // オレンジ
            embed.fields.unshift({
                name: '⚠️ エラー情報',
                value: stats.error,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in websearch command:', error);
        
        const errorMessage = 'WebSearch統計の取得中にエラーが発生しました。\n\n' +
                          `エラー詳細: ${error.message}\n` +
                          '管理者に連絡して、ログを確認してください。';
        
        try {
            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
        }
    }
}

async function handleHelpCommand(interaction) {
    const embed = {
        title: '🤖 YOLUBot ヘルプ',
        description: 'ボードゲーム専門のAI BOTです！',
        fields: [
            {
                name: '🗞️ 自動ニュース機能',
                value: '毎日朝7時・夜19時に最新ボードゲームニュースを自動投稿',
                inline: false
            },
            {
                name: '💬 AI対話機能',
                value: '@YOLUBot をつけてメッセージを送ると回答します\n例：@YOLUBot おすすめのボードゲームは？',
                inline: false
            },
            {
                name: '🧠 学習機能',
                value: '会話を通じてあなたの好みを学習し、個人化された回答を提供',
                inline: false
            },
            {
                name: '📋 スラッシュコマンド',
                value: '`/news` - 手動でニュース取得（リアルタイムWeb検索）\n`/stats` - BOT統計\n`/preferences` - あなたの学習済み好み\n`/analytics` - 高度ニュース分析（管理者限定）\n`/websearch` - WebSearch統計（管理者限定）\n`/permissions` - 権限チェック（管理者限定）\n`/help` - このヘルプ',
                inline: false
            },
            {
                name: '🎯 高度評価システム',
                value: '信頼度・話題性・速報性の3軸で記事を自動評価\n🔥 高評価記事には特別表示\nスコアに応じた色分け表示',
                inline: false
            }
        ],
        color: 0x0099ff,
        footer: {
            text: 'Powered by Gemini AI & Real-time Web Search'
        }
    };
    
    await interaction.reply({ embeds: [embed] });
}

// ヘルパー関数
function getScoreColor(article) {
    const totalScore = getTotalScore(article);
    if (totalScore > 250) return 0xFF6B6B; // 赤 - 最高評価
    if (totalScore > 200) return 0xFF9F43; // オレンジ - 高評価
    if (totalScore > 150) return 0x4ECDC4; // 青緑 - 良好
    return 0x95E1D3; // 薄緑 - 標準
}

function getTotalScore(article) {
    return (article.credibilityScore || 0) + (article.relevanceScore || 0) + (article.urgencyScore || 0);
}

// 定期的なメモリクリーンアップ（1時間毎）
setInterval(() => {
    const now = Date.now();
    
    // 期限切れのクールダウンを削除
    for (const [userId, expiry] of userCooldowns.entries()) {
        if (now > expiry) {
            userCooldowns.delete(userId);
        }
    }
    
    // 期限切れのメッセージハッシュを削除
    for (const [messageHash, timestamp] of processedMessages.entries()) {
        if (now - timestamp > MESSAGE_CACHE_DURATION) {
            processedMessages.delete(messageHash);
        }
    }
    
    console.log(`🧹 メモリクリーンアップ完了: クールダウン${userCooldowns.size}件, 処理中${processingMessages.size}件, メッセージキャッシュ${processedMessages.size}件`);
}, 60 * 60 * 1000);

// Render.com用の簡易HTTPサーバー（ポートスキャン対策）
const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'YOLUBot is running',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '2.0.3',
        features: {
            webSearch: 'enabled',
            realTimeNews: 'enabled',
            aiConversation: 'enabled'
        },
        debug: {
            activeUsers: userCooldowns.size,
            processingMessages: processingMessages.size,
            messageCache: processedMessages.size,
            connections: connectionCount
        }
    }));
});

server.listen(port, () => {
    console.log(`Health check server running on port ${port}`);
});

client.login(process.env.DISCORD_TOKEN);
