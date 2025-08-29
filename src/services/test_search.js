// test_search.js - WebSearch機能のテスト用スクリプト
require('dotenv').config();

const WebSearchService = require('./src/services/webSearchService');
const AdvancedNewsService = require('./src/services/advancedNewsService');

async function testWebSearch() {
    console.log('🧪 WebSearch機能テスト開始\n');
    
    try {
        // WebSearchServiceのテスト
        console.log('1️⃣ WebSearchServiceのテスト');
        const webSearch = new WebSearchService();
        
        const healthCheck = await webSearch.healthCheck();
        console.log('ヘルスチェック結果:', JSON.stringify(healthCheck, null, 2));
        
        if (healthCheck.overallStatus === 'error') {
            console.log('❌ WebSearchServiceが利用できません。APIキーを確認してください。');
            return;
        }
        
        // 実際の検索テスト
        console.log('\n2️⃣ 実際の検索テスト');
        const searchResults = await webSearch.search('board game news 2025', { maxResults: 3 });
        
        console.log(`検索結果: ${searchResults.length}件`);
        searchResults.forEach((result, i) => {
            console.log(`${i+1}. ${result.title}`);
            console.log(`   URL: ${result.url}`);
            console.log(`   概要: ${result.description?.substring(0, 100)}...`);
        });
        
        // AdvancedNewsServiceのテスト
        console.log('\n3️⃣ AdvancedNewsServiceのテスト');
        const newsService = new AdvancedNewsService(webSearch);
        
        const news = await newsService.getBoardGameNews(false);
        
        console.log(`ニュース結果: ${news.length}件`);
        news.forEach((article, i) => {
            if (article.isNoNewsMessage) {
                console.log(`${i+1}. ${article.title}: ${article.description}`);
            } else {
                console.log(`${i+1}. ${article.title}`);
                console.log(`   信頼度: ${article.credibilityScore}/100`);
                console.log(`   関連性: ${article.relevanceScore}/100`);
                console.log(`   緊急度: ${article.urgencyScore}/100`);
                console.log(`   URL: ${article.url}`);
            }
        });
        
        console.log('\n✅ テスト完了');
        
    } catch (error) {
        console.error('❌ テスト失敗:', error.message);
    }
}

// テスト実行
if (require.main === module) {
    testWebSearch();
}

module.exports = testWebSearch;
