require('dotenv').config();
const { REST, Routes } = require('discord.js');

const commands = [
    {
        name: 'news',
        description: 'ボードゲームの最新ニュースを手動で取得します'
    },
    {
        name: 'stats',
        description: 'BOTの統計情報を表示します'
    },
    {
        name: 'preferences',
        description: 'あなたの学習済み好みを表示します'
    },
    {
        name: 'permissions',
        description: 'BOTの権限状況をチェックします（管理者限定）'
    },
    {
        name: 'analytics',
        description: '高度なニュース分析情報を表示します（管理者限定）'
    },
    {
        name: 'help',
        description: 'BOTの使い方を表示します'
    }
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();