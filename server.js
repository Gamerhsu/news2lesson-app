// server.js - News2Lesson Accelerator (v2.0: NotebookLM 格式修正版)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// --- 靜態檔案設定 ---
// 告訴 Express: public 資料夾裡的東西直接給人用 (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// 首頁路由: 任何沒定義的 API 路徑，都回傳 index.html (讓前端接手)
// [修正] 使用正規表達式 /.*/ 來匹配所有路徑，解決 PathError 問題
app.get(/.*/, (req, res) => {
    // 如果請求的是 API 相關路徑但沒對應到，回傳 404 JSON
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API Not Found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// 1. 設定模型
const MODEL_NAME = "gemini-2.5-pro"; 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// --- 風格設定資料庫 ---
const STYLE_PROMPTS = {
    "3D Animated Movie": `Style: High-End 3D Animated Movie Style (Pixar-esque). Keywords: "3D render, cute and expressive characters, soft cinematic lighting, warm color palette, high fidelity, subsurface scattering, 8k resolution, Unreal Engine 5 style, Disney/Pixar aesthetic."`,
    
    "Modern Organic Vector": `Style: Modern Organic Vector Illustration with Subtle Texture. Keywords: "Clean and friendly vector art, rounded organic shapes, no sharp edges, cheerful color palette, subtle paper grain texture overlay, clear composition, educational infographic aesthetic, approachable design."`,
    
    "Soft Watercolor": `Style: Whimsical Watercolor Children's Book Illustration. Keywords: "Hand-painted texture, soft watercolor washes, ink outlines, pastel color palette, dreamy atmosphere, artistic, textured paper background, gentle and calming, Beatrix Potter style."`,
    
    "Classic Doraemon": `Style: Classic Fujiko F. Fujio Anime Style (Doraemon aesthetic). Keywords: "Retro Japanese TV anime look, cel-shaded, bold black outlines, flat bright primary colors, simple rounded character designs, hand-drawn animation texture, warm and nostalgic atmosphere, playful, manga panel feel."

## Character Integration Strategy
**Crucial Instruction:** To make the visuals engaging for children, you must feature the main characters, **Doraemon and Nobita**, as the protagonists in the visual descriptions for most slides.
- **Rule:** Doraemon and Nobita must be present in the scene, interacting with the news topic.
- **How to implement:**
  - **Action & Emotion:** Describe their reactions to the story events (e.g., looking surprised at a discovery, smiling at an animal).
  - **Contextual Setting:** Place them directly into the news environment (e.g., floating in space, exploring a jungle, or visiting a museum).`,
    
    "Layered Paper Cutout": `Style: 3D Layered Paper Cutout Art (Diorama Style). Keywords: "Layered paper craft, depth and shadows, intricate paper details, origami elements, vibrant contrasting colors, lightbox effect, isometric view, magical and crafted feel."`,
    
    "Modern Cozy Storybook": `Style: Modern Cozy Narrative Children's Book Illustration. Keywords: "Soft gouache and colored pencil texture mimicking traditional media, visible paper grain, warm and inviting color palette with earth tones and soft greens, diffused golden hour lighting, gentle volumetric shadows, cute rounded expressive characters with friendly faces, no harsh black outlines, colored linework, comforting and whimsical atmosphere, detailed storybook spread aesthetic."`,
    
    "Vibrant Kids Comic": `Style: Vibrant and Playful Children's Comic Book Style. Keywords: "Bold expressive outlines, dynamic character poses, bright saturated colors, halftone dot patterns, energetic composition, fun speech bubbles, action lines."`
};

app.get('/', (req, res) => {
    res.send(`🚀 News2Lesson Backend (v2.0 NotebookLM Format Fixed) is running on ${MODEL_NAME}!`);
});

// Helper: 讓 Gemini 幫我們想搜尋關鍵字 (Query Expansion)
async function generateSmartQuery(userTopic) {
    try {
        const prompt = `
        You are a Search Query Optimizer for an educational kids' news app.
        
        User Topic: "${userTopic}"
        
        Goal: Create a strict search query string for the "Tavily API" to find REAL NEWS suitable for children (Science, Animals, Space, Nature).
        
        Rules:
        1. **Disambiguate**: If the topic is "Panda", ensure we find the ANIMAL, not "Panda Express" (restaurant) or "Foodpanda". If "Mars", find the PLANET, not the chocolate bar.
        2. **Exclude Noise**: ALWAYS include negative keywords to remove business, politics, and crime.
        3. **Format**: Output ONLY the raw query string. No quotes, no explanations.
        
        Example Input: "Panda"
        Example Output: "Giant Panda" conservation zoo news -restaurant -food -delivery -express -business
        
        Example Input: "Space"
        Example Output: space exploration nasa astronomy news -military -war -politics
        
        Now, optimize for: "${userTopic}"
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Smart Query Failed:", error.message);
        // 如果 AI 思考失敗，回退到基本邏輯
        return `"${userTopic}" news science nature -business -politics`;
    }
}

// API: 搜尋新聞 (The Smart Hunter)
app.post('/api/search-news', async (req, res) => {
    try {
        const { query, date } = req.body;
        console.log(`🔍 [收到請求] 原始關鍵字: ${query}`);

        // [步驟 1: AI 智慧查詢擴展]
        console.log("🧠 正在思考最佳搜尋關鍵字...");
        const optimizedQuery = await generateSmartQuery(query);
        console.log(`👉 AI 優化後的搜尋指令: [ ${optimizedQuery} ]`);

        // [步驟 2: Tavily 搜尋]
        const tavilyResponse = await axios.post('https://api.tavily.com/search', {
            api_key: process.env.TAVILY_API_KEY,
            query: optimizedQuery, // 使用 AI 想出來的關鍵字
            topic: "news",
            days: 180,
            max_results: 8,
            include_images: false
        });

        const rawResults = tavilyResponse.data.results;
        console.log(`✅ [Tavily] 抓取到 ${rawResults.length} 筆資料`);

        if (!rawResults || rawResults.length === 0) {
            return res.json([]);
        }

        // [步驟 3: Gemini 最終過濾]
        const filterPrompt = `
        You are a strict "Child Safety News Editor".
        User Original Topic: "${query}"
        
        Task: 
        1. Review the news search results.
        2. **RELEVANCE**: Keep stories about the biological/scientific subject. DISCARD commercial/business news (e.g., stocks, restaurants).
        3. **SAFETY**: DISCARD politics, crime, violence.
        4. Select TOP 3 best stories.
        5. Translate to **Traditional Chinese (Taiwan)**.
        
        Output JSON Array: [{ "title_zh", "summary_zh", "source", "url", "content" }]

        Raw Data:
        ${JSON.stringify(rawResults)}
        `;

        const result = await model.generateContent(filterPrompt);
        const response = await result.response;
        let text = response.text().replace(/```json|```/g, '').trim();
        
        let filteredNews = [];
        try {
            filteredNews = JSON.parse(text);
        } catch (e) {
            console.error("JSON Parse Error:", e);
        }

        // 保底：如果 AI 過濾壞了，回傳原始資料的前 3 筆
        if (!filteredNews || filteredNews.length === 0) {
            console.log("⚠️ AI 過濾後為空，使用原始資料保底");
            filteredNews = rawResults.slice(0, 3).map(news => ({
                title_zh: news.title + " (未翻譯)",
                summary_zh: news.content.substring(0, 50) + "...",
                source: news.source,
                url: news.url,
                content: news.content
            }));
        }

        console.log(`✅ [Gemini] 回傳 ${filteredNews.length} 筆精準新聞`);
        res.json(filteredNews);

    } catch (error) {
        console.error('❌ Search Error:', error);
        if (error.message.includes('404')) {
            console.error("👉 錯誤提示：您的 API Key 可能不支援 'gemini-2.5-pro'。請嘗試改回 'gemini-1.5-pro'。");
        }
        res.status(500).json({ error: '搜尋失敗' });
    }
});

// API: 生成內容 (The Writer)
app.post('/api/generate-content', async (req, res) => {
    try {
        const { newsContent, style } = req.body;
        console.log(`✍️ [生成開始] 風格: ${style}`);

        // 取得風格 Prompt，沒選到就預設 3D
        const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS["3D Animated Movie"];
        
        // 判斷是否需要整合哆啦A夢角色 (邏輯判斷)
        let characterIntegrationRule = "";
        if (style === "Classic Doraemon") {
            characterIntegrationRule = "MUST instruct NotebookLM to visualize Doraemon and Nobita presenting the news in the *Visual Prompts* of the slides.";
        } else {
            characterIntegrationRule = "Stick to the generic visual style provided. DO NOT include specific copyrighted characters unless requested.";
        }

        // 這是要給 NotebookLM 的完整指令模板
        // 我們直接在這裡組裝字串，而不是讓 Gemini 去生成這個 Prompt
        // 這樣可以確保格式 100% 準確
        const notebookLMPromptTemplate = `
# Role
You are a "Zero-Prep" Online ESL Teacher's Assistant.
**Target Audience:** 10-year-old non-native English speakers.
**Goal:** Create a comprehensive **Lesson Slide Deck** based on the uploaded story.

# Constraint: Flexible Slide Count
- **Minimum Slides:** 15
- **Maximum Slides:** No limit (Expand as needed).
- **CRITICAL RULE:** Do NOT overcrowd a slide. If a Story Chapter is long, **split it into multiple slides** (e.g., Chapter 1 Part A, Chapter 1 Part B). Ensure the text size remains readable for children.

# Source Material
Use the provided **Story Chapters** and **Bilingual Vocabulary Data** as the core content.

# Visual Style Requirement
For the "Visual Prompt" section of every slide, use the following style:
👉 **${stylePrompt}** 👈

---

# Task: Generate the Slide Deck
Output the content for each slide following this structure:

## Slide [Number]: [Topic/Title]

**1. Visual Prompt:**
*(Describe the image for AI generation based on the style above. ${characterIntegrationRule})*

**2. Student Reading (The Text):**
*(Copy text chunks from the Source Story. **Keep paragraphs short.** If the chapter is long, stop here and continue the rest on the next slide.)*

**3. Vocabulary Box (Bilingual):**
*(Select 1-2 keywords from the text on this slide. Format: **English Word** - **Chinese Translation** - Definition)*

**4. Teacher's Script & Action:**
*(Exact instructions for the teacher)*
- **Script:** "Teacher says: [Simple sentence]..."
- **Action:** (e.g., "Ask student to read.")
- **Check Question:** (Simple comprehension question)

---

# Suggested Outline (Use this as a guide, but add slides if needed):

**Phase 1: Warm-up & Pre-teach**
* **Slide 1:** Title Page & Visual Hook (Main Character).
* **Slide 2:** Vocabulary Pre-teach (First 3 key words from data).
* **Slide 3:** Vocabulary Pre-teach (Next 3 key words from data).

**Phase 2: The Story (The Core Reading)**
*(Instruction: Iterate through all 6 Chapters. **Create as many slides as necessary** to cover the full story text comfortably.)*
* **Slide 4+:** Chapter 1 (The Setting & Problem)
* **Slide [Next]:** Chapter 2 (The Challenge)
* **Slide [Next]:** ... (Continue for Chapters 3, 4, 5)
* **Slide [Next]:** Chapter 6 (The Happy Ending)
*(Note: Insert an "Interactive Pause" slide with a discussion question in the middle of the story.)*

**Phase 3: Review & Wrap-up**
* **Slide [Final-2]:** Comprehension Quiz (3 Multiple Choice Questions).
* **Slide [Final-1]:** Vocabulary Matching Game (English <-> Chinese).
* **Slide [Final]:** Homework & Summary (1 sentence summary).
        `;

        const writerPrompt = `
        # Role
        You are the "News Hunter & Content Architect." Convert the news into **ENGLISH** educational materials for ESL students.

        SOURCE NEWS:
        ${JSON.stringify(newsContent)}

        # Workflow & Output (JSON Format)

        Please generate a JSON object with exactly these 2 fields (Note: Field 3 is handled by code):

        ## Field 1: "synopsis_zh" (Brief Summary)
        - Language: Traditional Chinese.
        - Length: Short and concise (approx. 50-80 words).
        - Content: Quickly summarize the main event of the story.

        ## Field 2: "source_material" (The Content for NotebookLM)
        - Format: Markdown string.
        - Content Requirements:
          1. **Meta Data**: Original Source Link & Date.
          2. **The Story**: 
             - Language: **ENGLISH ONLY**.
             - Write 6 distinct chapters.
             - Style: **Narrative Story (Non-fiction adapted as a story)**. 
             - **CRITICAL**: The story must be about the ACTUAL news event. **DO NOT introduce fictional characters like Doraemon or Nobita into the text of the story.** Keep it factual but engaging for 10-year-olds (A2/B1 level).
          3. **Bilingual Vocabulary Data**: 
             - List 10-12 words.
             - Format: **English Word** (Traditional Chinese Translation) : Simple English Definition.
          4. **Comprehension Check Data**:
             - Language: **ENGLISH**.
             - 5 multiple choice questions.
             - **DO NOT mark the correct answer.**
        `;

        const result = await model.generateContent(writerPrompt);
        const response = await result.response;
        const text = response.text().replace(/```json|```/g, '').trim();
        const generatedData = JSON.parse(text);

        // 將我們在後端組裝好的 NotebookLM 指令塞進去回傳給前端
        generatedData.notebooklm_instruction = notebookLMPromptTemplate;

        console.log(`✅ [Gemini] 內容生成完畢`);
        res.json(generatedData);

    } catch (error) {
        console.error('❌ Generate Error:', error);
        res.status(500).json({ error: '生成失敗' });
    }
});

app.listen(port, () => {
    console.log(`----------------------------------------------------------------`);
    console.log(`✅ Server Updated (v2.0 NotebookLM Format Fixed) & Running on ${MODEL_NAME}!`);
    console.log(`🌐 Local URL: http://localhost:${port}`);
    console.log(`----------------------------------------------------------------`);
});