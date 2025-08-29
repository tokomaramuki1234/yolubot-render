// src/utils/errorHandler.js - 統一エラーハンドリング

class ErrorHandler {
    static logError(context, error, additionalInfo = {}) {
        const timestamp = new Date().toISOString();
        console.error(`❌ [${timestamp}] ${context}:`);
        console.error(`   エラー: ${error.message}`);
        console.error(`   スタック: ${error.stack}`);
        
        if (Object.keys(additionalInfo).length > 0) {
            console.error('   追加情報:', JSON.stringify(additionalInfo, null, 2));
        }
    }

    static async handleDiscordInteractionError(interaction, error, context = 'Unknown') {
        this.logError(context, error);
        
        const errorMessage = '申し訳ございません。処理中にエラーが発生しました。';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (replyError) {
            this.logError('Discord Error Reply', replyError);
        }
    }

    static createSafeAsyncWrapper(fn, context) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.logError(context, error);
                throw error;
            }
        };
    }
}

module.exports = ErrorHandler;