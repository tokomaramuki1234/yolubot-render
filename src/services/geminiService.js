const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }

    async summarizeArticle(article) {
        try {
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

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Error summarizing article:', error);
            return '記事の要約を生成できませんでした。';
        }
    }

    async generateResponse(userMessage, conversationHistory = [], userPreferences = null) {
        try {
            let contextPrompt = `
あなたはボードゲーム専門のDiscord BOTです。以下の特徴があります：
- ボードゲームに関する知識が豊富
- フレンドリーで親しみやすい口調
- ユーザーの過去の会話を考慮して回答
- 日本語で回答
- ユーザーの好みに合わせた個人化された提案

${userPreferences ? `
ユーザーの好み・特徴：
- 好みのジャンル: ${userPreferences.preferences.join(', ')}
- 興味のあるトピック: ${userPreferences.interests.join(', ')}
- 経験レベル: ${userPreferences.experience_level}
- 好みのメカニクス: ${userPreferences.favorite_mechanics.join(', ')}
` : ''}

過去の会話履歴：
${conversationHistory.map(conv => `ユーザー: ${conv.user_message}\nBOT: ${conv.bot_response}`).join('\n')}

現在のユーザーメッセージ: ${userMessage}

ユーザーの好みや経験レベルを考慮して、適切で個人化された回答をしてください：
            `;

            const result = await this.model.generateContent(contextPrompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Error generating response:', error);
            return 'すみません、回答の生成中にエラーが発生しました。もう一度お試しください。';
        }
    }

    async analyzeUserPreferences(conversationHistory) {
        try {
            const prompt = `
以下の会話履歴から、ユーザーのボードゲームの好みや興味を分析してください：

${conversationHistory.map(conv => `ユーザー: ${conv.user_message}\nBOT: ${conv.bot_response}`).join('\n')}

以下の形式でJSON形式で回答してください：
{
    "preferences": ["好みのジャンル1", "好みのジャンル2"],
    "interests": ["興味のあるトピック1", "興味のあるトピック2"],
    "experience_level": "初心者/中級者/上級者",
    "favorite_mechanics": ["好みのメカニクス1", "好みのメカニクス2"]
}
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            
            try {
                return JSON.parse(response.text());
            } catch (parseError) {
                console.error('Error parsing preferences JSON:', parseError);
                return null;
            }
        } catch (error) {
            console.error('Error analyzing user preferences:', error);
            return null;
        }
    }
}

module.exports = GeminiService;