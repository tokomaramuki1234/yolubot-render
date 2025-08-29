async function handleUserQuestion(message) {
    const messageId = message.id;
    const userId = message.author.id;
    const userTag = message.author.tag;
    
    console.log(`🔍 [CRITICAL] handleUserQuestion開始: ${userTag} (${messageId}) - ${new Date().toISOString()}`);
    
    // 🔥 厳密な重複チェック
    const executionKey = `execution_${messageId}`;
    if (global[executionKey]) {
        console.log(`🚫 [CRITICAL] handleUserQuestion重複実行をブロック: ${messageId}`);
        return;
    }
    global[executionKey] = true;
    
    try {
        // 入力指示の送信
        await message.channel.sendTyping();
        
        console.log(`🧠 [CRITICAL] AI応答生成開始: ${userTag} - ${new Date().toISOString()}`);
        
        const conversationHistory = await databaseService.getConversationHistory(userId, 10);
        const userPreferences = await databaseService.getUserPreferences(userId);
        
        console.log(`📊 [DEBUG] 会話履歴: ${conversationHistory.length}件, 設定: ${userPreferences ? 'あり' : 'なし'}`);
        
        // メンションを削除してクリーンなメッセージにする
        const cleanMessage = message.content.replace(/<@!?\d+>/g, '').trim();
        console.log(`🧹 [DEBUG] メッセージクリーニング: "${message.content}" → "${cleanMessage}"`);
        
        // 🔥 重要: AI応答を1回だけ生成
        console.log(`🧠 [CRITICAL] geminiService.generateResponse() 呼び出し開始: ${new Date().toISOString()}`);
        const response = await geminiService.generateResponse(cleanMessage, conversationHistory, userPreferences);
        console.log(`✍️ [CRITICAL] geminiService.generateResponse() 呼び出し完了: ${new Date().toISOString()}`);
        
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
            console.log(`📤 [CRITICAL] message.reply() 実行開始 - MessageID: ${messageId} - ${new Date().toISOString()}`);
            const sentMessage = await message.reply(chunks[0]);
            console.log(`📤 [CRITICAL] message.reply() 実行完了 - 送信済みメッセージID: ${sentMessage.id} - ${new Date().toISOString()}`);
            
            for (let i = 1; i < chunks.length; i++) {
                console.log(`📤 [DEBUG] 追加メッセージ送信 ${i+1}/${chunks.length}: ${chunks[i].length}文字`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
                const additionalMessage = await message.channel.send(chunks[i]);
                console.log(`📤 [CRITICAL] 追加メッセージ送信完了 - ID: ${additionalMessage.id}`);
            }
        } else {
            console.log(`📤 [DEBUG] 単一リプライ送信: ${response.length}文字`);
            console.log(`📤 [CRITICAL] message.reply() 実行開始 - MessageID: ${messageId} - ${new Date().toISOString()}`);
            const sentMessage = await message.reply(response);
            console.log(`📤 [CRITICAL] message.reply() 実行完了 - 送信済みメッセージID: ${sentMessage.id} - ${new Date().toISOString()}`);
        }
        
        console.log(`✅ [DEBUG] AI応答送信完了: ${userTag} (メッセージID: ${messageId})`);
        
    } catch (error) {
        console.error(`❌ [ERROR] ユーザー質問処理エラー (${userTag}, ${messageId}):`, error);
        console.error(`❌ [ERROR] エラースタック:`, error.stack);
        
        try {
            console.log(`🚨 [CRITICAL] エラー応答送信: ${userTag} - ${new Date().toISOString()}`);
            const errorMessage = await message.reply('申し訳ございません。エラーが発生しました。しばらく時間をおいて再度お試しください。');
            console.log(`🚨 [CRITICAL] エラー応答送信完了 - ID: ${errorMessage.id}`);
        } catch (replyError) {
            console.error(`❌ [ERROR] エラー返信送信失敗 (${userTag}):`, replyError);
        }
    } finally {
        // 🔥 実行フラグをクリーンアップ
        delete global[executionKey];
        console.log(`🧹 [CRITICAL] 実行フラグクリーンアップ完了: ${messageId} - ${new Date().toISOString()}`);
    }
}
