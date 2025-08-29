const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        // レート制限対策
        this.requestCount = 0;
        this.dailyLimit = 45; // 安全のため少し低く設定
        this.lastResetDate = new Date().toDateString();
        this.requestQueue = [];
        this.isProcessing = false;
    }

    async checkRateLimit() {
        const today = new Date().toDateString();
        
        // 日付が変わったらリセット
        if (this.lastResetDate !== today) {
            this.requestCount = 0;
            this.lastResetDate = today;
        }

        return this.requestCount < this.dailyLimit;
    }

    async makeRequest(prompt, fallbackResponse = '申し訳ございません。現在、AI機能が一時的に利用できません。') {
        return new Promise((resolve) => {
            this.requestQueue.push({ prompt, fallbackResponse, resolve });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isProcessing || this.requestQueue.length === 0) return;
        
        this.isProcessing = true;

        while (this.requestQueue.length > 0) {
            const { prompt, fallbackResponse, resolve } = this.requestQueue.shift();
            
            if (!await this.checkRateLimit()) {
                console.warn(`⚠️ Gemini API制限に達しました (${this.requestCount}/${this.dailyLimit}). フォールバック応答を使用`);
                resolve(fallbackResponse);
                continue;
            }

            try {
                this.requestCount++;
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                
                console.log(`✅ Gemini API使用: ${this.requestCount}/${this.dailyLimit}`);
                resolve(text);
                
                // リクエスト間の待機（レート制限対策）
                if (this.requestQueue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                console.error('❌ Gemini API error:', error.message);
                
                if (error.status === 429) {
                    // レート制限に達した場合
                    this.requestCount = this.dailyLimit; // 今日はもう使用しない
                    console.warn('🚫 Gemini API レート制限に達しました。今日はフォールバック応答のみ使用します。');
                }
                
                resolve(fallbackResponse);
            }
        }

        this.isProcessing = false;
    }

    async summarizeArticle(article) {
        const prompt = `
ボードゲームニュース記事の要約をお願いします。
以下の記事を日本語で簡潔に要約してください（300文字程度）：

タイトル: ${article.title}
内容: ${article.description || article.content || 'コンテンツなし'}
URL: ${article.url}

要約は以下の形式でお願いします：
- 記事の要点を具体的に説明
- ボードゲーム愛好者にとって興味深い点を強調
- なぜこの情報が重要なのかを説明
- 300文字程度の読みやすい日本語で
        `;

        const fallback = `📰 **${article.title}**\n\n${article.description || 'ボードゲーム関連のニュース記事です。'}\n\n詳細は記事をご覧ください。`;

        return await this.makeRequest(prompt, fallback);
    }

    async generateResponse(userMessage, conversationHistory = [], userPreferences = null) {
        let contextPrompt = `
あなたはボードゲーム専門のDiscord BOTです。以下の特徴があります：
- ボードゲームに関する知識が豊富
- フレンドリーで親しみやすい口調
- ユーザーの過去の会話を考慮して回答
- 日本語で回答
- ユーザーの好みに合わせた個人化された提案

${userPreferences ? `
ユーザーの好み・特徴：
- 好みのジャンル: ${userPreferences.preferences?.join(', ') || 'まだ学習中'}
- 興味のあるトピック: ${userPreferences.interests?.join(', ') || 'まだ学習中'}
- 経験レベル: ${userPreferences.experience_level || 'まだ学習中'}
- 好みのメカニクス: ${userPreferences.favorite_mechanics?.join(', ') || 'まだ学習中'}
` : ''}

${conversationHistory.length > 0 ? `
最近の会話履歴：
${conversationHistory.map(msg => `ユーザー: ${msg.user_message}\nBOT: ${msg.bot_response}`).join('\n\n')}
` : ''}

現在のユーザーメッセージ: ${userMessage}

上記を考慮して、親しみやすく有用な回答をしてください。`;

        const fallback = `こんにちは！ボードゲームについて何でもお聞きください。

🎲 ゲーム推薦
🎮 ルール説明  
📰 最新ニュース
🎯 コミュニティ情報

どのようなことをお手伝いできますか？`;

        return await this.makeRequest(contextPrompt, fallback);
    }

    async analyzeUserPreferences(conversationHistory) {
        const prompt = `
以下の会話履歴から、ユーザーのボードゲームに関する好みを分析し、
JSONフォーマットで出力してください：

会話履歴：
${conversationHistory.map(msg => `ユーザー: ${msg.user_message}\nBOT: ${msg.bot_response}`).join('\n\n')}

分析結果をこのJSONフォーマットで出力：
{
  "preferences": ["戦略ゲーム", "協力ゲーム", "etc"],
  "interests": ["新作情報", "コンポーネント", "etc"], 
  "experience_level": "初心者/中級者/上級者",
  "favorite_mechanics": ["ワーカープレイスメント", "ドラフト", "etc"],
  "play_style": "競争的/協力的/カジュアル"
}`;

        const fallback = JSON.stringify({
            preferences: ["まだ学習中"],
            interests: ["まだ学習中"],
            experience_level: "まだ学習中",
            favorite_mechanics: ["まだ学習中"],
            play_style: "まだ学習中"
        });

        try {
            const result = await this.makeRequest(prompt, fallback);
            return JSON.parse(result);
        } catch (error) {
            console.error('❌ ユーザー設定分析エラー:', error);
            return JSON.parse(fallback);
        }
    }

    // 今日の使用状況を取得
    getUsageStats() {
        return {
            requestsUsed: this.requestCount,
            dailyLimit: this.dailyLimit,
            resetDate: this.lastResetDate,
            remaining: Math.max(0, this.dailyLimit - this.requestCount)
        };
    }

    // 使用可能かチェック
    isAvailable() {
        return this.checkRateLimit();
    }
}

module.exports = GeminiService;