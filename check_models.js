// check_models.js - 直接向 Google 查詢可用模型清單 (REST API 版本)
require('dotenv').config();
const axios = require('axios');

async function getModelList() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        console.error("❌ 錯誤: 找不到 GEMINI_API_KEY，請檢查 .env 檔案");
        return;
    }

    console.log("🔍 正在向 Google 詢問您的 API Key 可用的模型清單...");
    
    try {
        // 直接呼叫 REST API 取得模型列表，不透過 SDK，這樣最準
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        const models = response.data.models;
        
        console.log("\n📋 您的帳號可用模型清單如下：");
        console.log("----------------------------------------");
        
        // 過濾出支援 "generateContent" (對話生成) 的模型
        const chatModels = models.filter(m => 
            m.supportedGenerationMethods.includes("generateContent")
        );

        if (chatModels.length === 0) {
            console.log("⚠️ 找不到支援對話的模型。這很不尋常，可能是 API Key 權限問題。");
        } else {
            // 排序，讓 gemini 系列排前面
            chatModels.sort((a, b) => b.name.localeCompare(a.name));

            chatModels.forEach(model => {
                // 模型名稱通常長這樣 "models/gemini-1.5-flash"，我們只取後面的 ID
                const modelId = model.name.replace('models/', '');
                console.log(`✅ ID: ${modelId}`);
                console.log(`   描述: ${model.displayName}`);
                console.log("----------------------------------------");
            });
        }

        console.log("\n💡 下一步：");
        console.log("請從上方選擇一個 ID (推薦 gemini-1.5-pro 或 gemini-1.5-flash)，");
        console.log("然後回到 backend/server.js 修改第 20 行。");

    } catch (error) {
        console.error("\n❌ 查詢失敗！");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error("錯誤訊息:", JSON.stringify(error.response.data, null, 2));
            
            if (error.response.status === 400) {
                console.error("👉 可能原因：API Key 無效。請檢查 .env 檔案是否有複製到空格。");
            }
        } else {
            console.error("錯誤原因:", error.message);
        }
    }
}

getModelList();