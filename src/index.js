require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const cron = require('node-cron');
const GeminiService = require('./services/geminiService');
const AdvancedNewsService = require('./services/advancedNewsService');
const DatabaseService = require('./services/databaseService');
const PermissionChecker = require('./utils/permissionChecker');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const geminiService = new GeminiService();
const newsService = new AdvancedNewsService();
const databaseService = new DatabaseService();

client.once(Events.ClientReady, async (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    
    await databaseService.init();
    
    // 権限チェックを実行
    await PermissionChecker.logPermissionCheck(client, process.env.CHANNEL_ID);
    
    cron.schedule('0 7,19 * * *', async () => {
        console.log('Running scheduled news update...');
        await postBoardGameNews();
    });
    
    cron.schedule('0 2 * * 0', async () => {
        console.log('Running weekly user preference analysis...');
        await analyzeUserPreferences();
    });
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    
    if (message.content.startsWith('!')) return;
    
    if (message.mentions.has(client.user)) {
        await handleUserQuestion(message);
    }
});

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
            case 'help':
                await handleHelpCommand(interaction);
                break;
            default:
                await interaction.reply('Unknown command');
        }
    } catch (error) {
        console.error('Error handling slash command:', error);
        const errorMessage = 'コマンドの実行中にエラーが発生しました。';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

async function postBoardGameNews() {
    try {
        const channel = client.channels.cache.get(process.env.CHANNEL_ID);
        if (!channel) {
            console.error('Channel not found');
            return;
        }

        const newsArticles = await newsService.getBoardGameNews(true); // isScheduled = true
        
        if (newsArticles.length === 1 && newsArticles[0].isNoNewsMessage) {
            // ニュースがない場合のメッセージ
            await channel.send(newsArticles[0].description);
            return;
        }
        
        const articlesToPost = newsArticles.slice(0, 3);
        
        for (const article of articlesToPost) {
            const summary = await geminiService.summarizeArticle(article);
            
            // スコア情報を含むリッチな埋め込み
            const embed = {
                title: article.title,
                description: summary,
                url: article.url || undefined,
                color: this.getScoreColor(article),
                timestamp: new Date().toISOString(),
                footer: {
                    text: `${article.source} • 信頼度:${article.credibilityScore || 'N/A'} 話題性:${article.relevanceScore || 'N/A'} 速報性:${article.urgencyScore || 'N/A'}`
                }
            };

            // 高スコア記事には特別な表示
            if (this.getTotalScore(article) > 200) {
                embed.author = {
                    name: '🔥 高評価ニュース',
                    icon_url: 'https://cdn.discordapp.com/emojis/fire.png'
                };
            }
            
            if (article.url) {
                await channel.send({ embeds: [embed] });
            } else {
                await channel.send({ content: summary });
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 投稿済み記事としてマーク（スコア情報込み）
        if (articlesToPost.length > 0 && !articlesToPost[0].isNoNewsMessage) {
            await newsService.markArticlesAsPosted(articlesToPost);
        }
    } catch (error) {
        console.error('Error posting news:', error);
    }
}

async function handleUserQuestion(message) {
    try {
        await message.channel.sendTyping();
        
        const conversationHistory = await databaseService.getConversationHistory(message.author.id, 10);
        const userPreferences = await databaseService.getUserPreferences(message.author.id);
        
        const response = await geminiService.generateResponse(message.content, conversationHistory, userPreferences);
        
        await databaseService.saveMessage(message.author.id, message.content, response);
        
        const messageCount = conversationHistory.length + 1;
        if (messageCount % 5 === 0) {
            console.log(`Analyzing preferences for user ${message.author.id} after ${messageCount} messages`);
            await updateUserPreferences(message.author.id);
        }
        
        await message.reply(response);
    } catch (error) {
        console.error('Error handling user question:', error);
        await message.reply('申し訳ございません。エラーが発生しました。');
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
        const newsArticles = await newsService.getBoardGameNews(false); // isScheduled = false (6時間)
        
        if (newsArticles.length === 1 && newsArticles[0].isNoNewsMessage) {
            await interaction.editReply(newsArticles[0].description);
            return;
        }
        
        const topArticles = newsArticles.slice(0, 3);
        
        if (topArticles.length === 0) {
            await interaction.editReply('直近24時間以内にめぼしいニュースはありませんでしたヨモ');
            return;
        }

        const embeds = [];
        for (const article of topArticles) {
            const summary = await geminiService.summarizeArticle(article);
            
            if (article.url) {
                const embed = {
                    title: article.title,
                    description: summary,
                    url: article.url,
                    color: getScoreColor(article),
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: `${article.source} • 信頼度:${article.credibilityScore || 'N/A'} 話題性:${article.relevanceScore || 'N/A'} 速報性:${article.urgencyScore || 'N/A'}`
                    }
                };

                // 高スコア記事には特別な表示
                if (getTotalScore(article) > 200) {
                    embed.author = {
                        name: '🔥 高評価ニュース'
                    };
                }

                embeds.push(embed);
            }
        }

        if (embeds.length > 0) {
            await interaction.editReply({ embeds });
        } else {
            await interaction.editReply('直近24時間以内にめぼしいニュースはありませんでしたヨモ');
        }
        
        // 手動取得した記事も投稿済みとしてマーク
        if (topArticles.length > 0 && !topArticles[0].isNoNewsMessage) {
            await newsService.markArticlesAsPosted(topArticles);
        }
    } catch (error) {
        console.error('Error in news command:', error);
        await interaction.editReply('ニュースの取得中にエラーが発生しました。');
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
                    value: `総記事数: ${analytics.overall.total_articles || 0}\n平均信頼度: ${Math.round(analytics.overall.avg_credibility || 0)}/100\n平均話題性: ${Math.round(analytics.overall.avg_relevance || 0)}/100\n平均速報性: ${Math.round(analytics.overall.avg_urgency || 0)}/100\n総合平均スコア: ${Math.round(analytics.overall.avg_total || 0)}/300`,
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

async function handleHelpCommand(interaction) {
    const embed = {
        title: '🤖 YOLUBot ヘルプ',
        description: 'ボードゲーム専門のAI BOTです！',
        fields: [
            {
                name: '🗞️ 自動ニュース機能',
                value: '毎日朝9時・夜18時に最新ボードゲームニュースを自動投稿',
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
                value: '`/news` - 手動でニュース取得（AI評価スコア付き）\n`/stats` - BOT統計\n`/preferences` - あなたの学習済み好み\n`/analytics` - 高度ニュース分析（管理者限定）\n`/permissions` - 権限チェック（管理者限定）\n`/help` - このヘルプ',
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
            text: 'Powered by Gemini AI'
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

client.login(process.env.DISCORD_TOKEN);