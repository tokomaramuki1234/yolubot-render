require('dotenv').config();
const WebSearchService = require('./src/services/webSearchService');

async function testWebSearch() {
    console.log('🧪 WebSearchService テスト開始\n');
    
    const webSearchService = new WebSearchService();
    
    // ヘルスチェック
    console.log('📊 ヘルスチェック実行中...');
    try {
        const health = await webSearchService.healthCheck();
        console.log('Health Check結果:', JSON.stringify(health, null, 2));
    } catch (error) {
        console.error('❌ ヘルスチェックエラー:', error.message);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // 検索テスト
    console.log('🔍 検索テスト実行中...');
    const testQueries = [
        'ボードゲーム 新作',
        'board game news',
        'Kickstarter board game'
    ];
    
    for (const query of testQueries) {
        console.log(`\n🎯 検索クエリ: "${query}"`);
        try {
            const startTime = Date.now();
            const results = await webSearchService.search(query, { maxResults: 3 });
            const duration = Date.now() - startTime;
            
            console.log(`✅ ${results.length}件の結果を取得 (${duration}ms)`);
            
            results.forEach((result, index) => {
                console.log(`  ${index + 1}. ${result.title}`);
                console.log(`     URL: ${result.url}`);
                console.log(`     Source: ${result.source} (${result.provider})`);
                if (result.publishedDate) {
                    console.log(`     Published: ${result.publishedDate}`);
                }
                console.log(`     Snippet: ${result.description?.substring(0, 100)}...`);
                console.log('');
            });
            
        } catch (error) {
            console.error(`❌ 検索エラー: ${error.message}`);
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // 統計情報
    console.log('📈 使用統計:');
    const stats = webSearchService.getUsageStats();
    console.log(JSON.stringify(stats, null, 2));
    
    console.log('\n🧪 テスト完了');
}

// テスト実行
testWebSearch().catch(error => {
    console.error('💥 テスト実行エラー:', error);
    process.exit(1);
});