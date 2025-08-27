require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const cron = require('node-cron');
const GeminiService = require('./services/geminiService');
const NewsService = require('./services/newsService');
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
const newsService = new NewsService();
const databaseService = new DatabaseService();

client.once(Events.ClientReady, async (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    
    await databaseService.init();
    
    // 権限チェックを実行
    await PermissionChecker.logPermissionCheck(client, process.env.CHANNEL_ID);
    
    cron.schedule('0 9,18 * * *', async () => {
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

        const newsArticles = await newsService.getBoardGameNews();
        
        for (const article of newsArticles.slice(0, 3)) {
            const summary = await geminiService.summarizeArticle(article);
            
            const embed = {
                title: article.title,
                description: summary,
                url: article.url,
                color: 0x0099ff,
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Board Game News Bot'
                }
            };
            
            await channel.send({ embeds: [embed] });
            await new Promise(resolve => setTimeout(resolve, 1000));
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
        const newsArticles = await newsService.getBoardGameNews();
        const topArticles = newsArticles.slice(0, 3);
        
        if (topArticles.length === 0) {
            await interaction.editReply('現在、ニュース記事を取得できませんでした。');
            return;
        }

        const embeds = [];
        for (const article of topArticles) {
            const summary = await geminiService.summarizeArticle(article);
            
            embeds.push({
                title: article.title,
                description: summary,
                url: article.url,
                color: 0x0099ff,
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Board Game News Bot'
                }
            });
        }
        
        await interaction.editReply({ embeds });
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
                value: '`/news` - 手動でニュース取得\n`/stats` - BOT統計\n`/preferences` - あなたの学習済み好み\n`/permissions` - 権限チェック（管理者限定）\n`/help` - このヘルプ',
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

client.login(process.env.DISCORD_TOKEN);