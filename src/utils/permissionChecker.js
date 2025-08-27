const { PermissionsBitField } = require('discord.js');

class PermissionChecker {
    static requiredPermissions = [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.UseApplicationCommands
    ];

    static recommendedPermissions = [
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.UseExternalEmojis
    ];

    static checkBotPermissions(channel, botMember) {
        if (!channel || !botMember) {
            return {
                hasRequired: false,
                missing: ['チャンネルまたはBOTメンバーが見つかりません'],
                warnings: []
            };
        }

        const permissions = channel.permissionsFor(botMember);
        const missing = [];
        const warnings = [];

        // 必須権限チェック
        for (const permission of this.requiredPermissions) {
            if (!permissions.has(permission)) {
                missing.push(this.getPermissionName(permission));
            }
        }

        // 推奨権限チェック
        for (const permission of this.recommendedPermissions) {
            if (!permissions.has(permission)) {
                warnings.push(this.getPermissionName(permission));
            }
        }

        return {
            hasRequired: missing.length === 0,
            missing,
            warnings,
            permissions: permissions.toArray()
        };
    }

    static getPermissionName(permission) {
        const permissionNames = {
            [PermissionsBitField.Flags.ViewChannel]: 'View Channels',
            [PermissionsBitField.Flags.SendMessages]: 'Send Messages',
            [PermissionsBitField.Flags.ReadMessageHistory]: 'Read Message History',
            [PermissionsBitField.Flags.EmbedLinks]: 'Embed Links',
            [PermissionsBitField.Flags.UseApplicationCommands]: 'Use Slash Commands',
            [PermissionsBitField.Flags.AddReactions]: 'Add Reactions',
            [PermissionsBitField.Flags.UseExternalEmojis]: 'Use External Emojis'
        };

        return permissionNames[permission] || 'Unknown Permission';
    }

    static generatePermissionReport(guild, botMember) {
        if (!guild || !botMember) {
            return 'サーバーまたはBOTメンバーが見つかりません。';
        }

        let report = '# 🔍 BOT権限診断レポート\n\n';
        report += `**サーバー**: ${guild.name}\n`;
        report += `**BOT**: ${botMember.user.username}#${botMember.user.discriminator}\n\n`;
        
        // OAuth2 Scopesの確認情報
        report += '## 🎯 必要なOAuth2 Scopes\n';
        report += '✅ `bot` - 基本的なBOT機能\n';
        report += '✅ `applications.commands` - スラッシュコマンド機能\n';
        report += '❌ `identify`, `guilds`, `email` - **不要**（選択しないでください）\n\n';
        
        const channels = guild.channels.cache.filter(ch => ch.type === 0); // テキストチャンネルのみ
        let issuesFound = false;

        channels.forEach(channel => {
            const check = this.checkBotPermissions(channel, botMember);
            
            if (!check.hasRequired || check.warnings.length > 0) {
                issuesFound = true;
                report += `## #${channel.name}\n`;
                
                if (!check.hasRequired) {
                    report += '🔴 **不足している必須権限**:\n';
                    check.missing.forEach(perm => {
                        report += `- ${perm}\n`;
                    });
                }
                
                if (check.warnings.length > 0) {
                    report += '🟡 **不足している推奨権限**:\n';
                    check.warnings.forEach(perm => {
                        report += `- ${perm}\n`;
                    });
                }
                report += '\n';
            }
        });

        if (!issuesFound) {
            report += '✅ すべてのチャンネルで適切な権限が設定されています。\n';
        } else {
            report += '\n## 対処方法\n';
            report += '1. サーバー設定 → ロール → BOTのロール を選択\n';
            report += '2. または チャンネル設定 → 権限 → BOTを追加\n';
            report += '3. 上記の不足権限を許可に設定\n';
        }

        return report;
    }

    static async logPermissionCheck(client, channelId = null) {
        try {
            const channel = channelId ? client.channels.cache.get(channelId) : null;
            const guild = channel ? channel.guild : client.guilds.cache.first();
            
            if (!guild) {
                console.log('❌ BOT権限チェック: サーバーが見つかりません');
                return false;
            }

            const botMember = guild.members.cache.get(client.user.id);
            if (!botMember) {
                console.log('❌ BOT権限チェック: BOTメンバーが見つかりません');
                return false;
            }

            if (channel) {
                const check = this.checkBotPermissions(channel, botMember);
                console.log(`📋 チャンネル #${channel.name} の権限チェック:`);
                console.log(`   必須権限: ${check.hasRequired ? '✅' : '❌'}`);
                
                if (check.missing.length > 0) {
                    console.log(`   不足権限: ${check.missing.join(', ')}`);
                }
                
                return check.hasRequired;
            } else {
                console.log('📋 全チャンネルの権限チェックを実行中...');
                const report = this.generatePermissionReport(guild, botMember);
                console.log(report);
                return true;
            }
        } catch (error) {
            console.error('❌ 権限チェック中にエラーが発生しました:', error);
            return false;
        }
    }
}

module.exports = PermissionChecker;