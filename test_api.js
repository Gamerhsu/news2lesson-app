// 這是一個用來測試後端 API 是否正常的腳本
const axios = require('axios');

async function testBackend() {
    console.log("🔵 開始測試搜尋 API...");
    
    try {
        // 1. 測試搜尋
        const searchRes = await axios.post('http://localhost:3000/api/search-news', {
            query: "space exploration",
            date: "2025-12-05"
        });
        
        console.log("🟢 搜尋成功！找到", searchRes.data.length, "則新聞");
        console.log("第一則標題:", searchRes.data[0].title_zh);

        // 2. 測試生成 (拿搜尋到的第一則新聞來測)
        console.log("\n🔵 開始測試生成 API (這會花一點時間)...");
        const generateRes = await axios.post('http://localhost:3000/api/generate-content', {
            newsContent: searchRes.data[0], // 把整包新聞物件丟進去
            style: "Classic Doraemon"
        });

        console.log("🟢 生成成功！");
        console.log("--- 中文摘要預覽 ---");
        console.log(generateRes.data.synopsis_zh);
        console.log("------------------");

    } catch (error) {
        console.error("🔴 測試失敗:", error.message);
        if (error.response) console.error(error.response.data);
    }
}

testBackend();
