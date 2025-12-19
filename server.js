// server.js - News2Lesson Accelerator (v2.1: 支援網址/純文字輸入)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio'); // [新增] 用來解析 HTML
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // [新增] 提高限制以支援長文章貼上
app.use(express.static(path.join(__dirname, 'public')));

// 1. 設定模型
const MODEL_NAME = "gemini-2.5-pro"; 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// --- 風格設定資料庫 ---
const STYLE_PROMPTS = {
    "3D Animated Movie": `Style: High-End 3D Animated Movie Style (Pixar-esque). Keywords: "3D render, cute and expressive characters, soft cinematic lighting, warm color palette, high fidelity, subsurface scattering, 8k resolution, Unreal Engine 5 style, Disney/Pixar aesthetic."`,
    "Classic Doraemon": `Style: Classic Fujiko F. Fujio Anime Style (Doraemon aesthetic). Keywords: "Retro Japanese TV anime look, cel-shaded, bold black outlines, flat bright primary colors, simple rounded character designs, hand-drawn animation texture, warm and nostalgic atmosphere, playful, manga panel feel."
    ## Character Integration Strategy
    **Crucial Instruction:** To make the visuals engaging for children, you must feature the main characters, **Doraemon and Nobita**, as the protagonists in the visual descriptions for most slides.`,
    "Modern Organic Vector": `Style: Modern Organic Vector Illustration with Subtle Texture. Keywords: "Clean and friendly vector art, rounded organic shapes, no sharp edges, cheerful color palette, subtle paper grain texture overlay, clear composition."`,
    "Soft Watercolor": `Style: Whimsical Watercolor Children's Book Illustration. Keywords: "Hand-painted texture, soft watercolor washes, ink outlines, pastel color palette, dreamy atmosphere, artistic, textured paper background, gentle and calming."`,
    "Vibrant Kids Comic": `Style: Vibrant and Playful Children's Comic Book Style. Keywords: "Bold expressive outlines, dynamic character poses, bright saturated colors, halftone dot patterns, energetic composition, fun speech bubbles, action lines."`,
    "Layered Paper Cutout": `Style: 3D Layered Paper Cutout Art (Diorama Style). Keywords: "Layered paper craft, depth and shadows, intricate paper details, origami elements, vibrant contrasting colors, lightbox effect."`,
    "Modern Cozy Storybook": `Style: Modern Cozy Narrative Children's Book Illustration. Keywords: "Soft gouache and colored pencil texture mimicking traditional media, visible paper grain, warm and inviting color palette with earth tones and soft greens, diffused golden hour lighting, gentle volumetric shadows."`
};

// --- 工具函式 ---
async function generateSmartQuery(userTopic) {
    try {
        const prompt = `You are a Search Optimizer. Topic: "${userTopic}". Output a strict search query for Tavily API to find educational kids news (Science, Animals, Nature). Include negative keywords for business/politics. Output Query String ONLY.`;
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (e) { return `${userTopic} news science animal -business`; }
}

// --- API 路線 ---

// 1. 搜尋新聞 (原功能)
app.post('/api/search-news', async (req, res) => {
    try {
        const { query, date } = req.body;
        console.log(`🔍 [搜尋] ${query}`);
        
        const optimizedQuery = await generateSmartQuery(query);
        const tavilyResponse = await axios.post('https://api.tavily.com/search', {
            api_key: process.env.TAVILY_API_KEY,
            query: optimizedQuery, topic: "news", days: 180, max_results: 8, include_images: false
        });

        const rawResults = tavilyResponse.data.results || [];
        if (rawResults.length === 0) return res.json([]);

        // Gemini 過濾
        const filterPrompt = `
        Role: Strict Child Safety Editor.
        Task: Filter news. Keep: Science, Nature, Animals, Space. Exclude: Politics, Crime, Business.
        Input: ${JSON.stringify(rawResults)}
        Output: JSON Array [{ "title_zh", "summary_zh", "source", "url", "content" }] (Translate title/summary to Traditional Chinese Taiwan).
        `;
        
        const result = await model.generateContent(filterPrompt);
        let text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));

    } catch (error) {
        console.error('Search Error:', error.message);
        res.status(500).json({ error: '搜尋失敗' });
    }
});

// [新增] 2. 處理直接輸入 (網址或純文字)
app.post('/api/process-direct', async (req, res) => {
    try {
        const { content, type } = req.body; // type: 'url' or 'text'
        console.log(`📥 [直接輸入處理] 類型: ${type}`);

        let rawText = content;
        let sourceName = "User Input";
        let sourceUrl = "";

        // 如果是網址，先嘗試爬取內容
        if (type === 'url') {
            try {
                // 簡單驗證網址格式
                new URL(content); 
                sourceUrl = content;
                sourceName = new URL(content).hostname;
                console.log(`🌐 正在抓取網址: ${content}`);
                
                const page = await axios.get(content, { 
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 10000 
                });
                
                // 使用 Cheerio 提取主要文字 (去除 script, style 等)
                const $ = cheerio.load(page.data);
                $('script, style, nav, footer, header, ads').remove();
                rawText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 15000); // 限制長度以免爆 token
                
            } catch (e) {
                console.warn("爬蟲失敗，將網址視為純文字處理:", e.message);
                rawText = `(User provided URL but scraping failed): ${content}`;
            }
        }

        // 使用 Gemini 將雜亂的文字或爬蟲結果「正規化」為標準新聞格式
        const normalizePrompt = `
        Role: Content Normalizer.
        Input Text: "${rawText.substring(0, 10000)}"
        
        Task:
        1. Analyze the input text.
        2. Extract/Generate a clear **Traditional Chinese Title** (title_zh).
        3. Write a 1-sentence **Traditional Chinese Summary** (summary_zh).
        4. Organize the main content into clear paragraphs (content).
        
        Output JSON Object ONLY:
        {
            "title_zh": "...",
            "summary_zh": "...",
            "source": "${sourceName}",
            "url": "${sourceUrl}",
            "content": "..."
        }
        `;

        const result = await model.generateContent(normalizePrompt);
        let text = result.response.text().replace(/```json|```/g, '').trim();
        const normalizedData = JSON.parse(text);

        console.log(`✅ [處理完成] 標題: ${normalizedData.title_zh}`);
        res.json(normalizedData);

    } catch (error) {
        console.error('Direct Process Error:', error);
        res.status(500).json({ error: '內容處理失敗' });
    }
});

// 3. 生成教材內容 (原功能)
app.post('/api/generate-content', async (req, res) => {
    try {
        const { newsContent, style } = req.body;
        console.log(`✍️ [生成開始] 風格: ${style}`);

        const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS["3D Animated Movie"];
        
        let characterRule = style === "Classic Doraemon" 
            ? "MUST instruct NotebookLM to visualize Doraemon and Nobita presenting the news." 
            : "Stick to the generic visual style provided.";

        const notebookLMPromptTemplate = `
# Role
You are a "Zero-Prep" Online ESL Teacher's Assistant.
**Target Audience:** 10-year-old non-native English speakers.
**Goal:** Create a comprehensive **Lesson Slide Deck** based on the uploaded story.

# Constraint: Flexible Slide Count
- **Minimum Slides:** 15
- **Maximum Slides:** No limit.
- **CRITICAL RULE:** Do NOT overcrowd a slide. Split long chapters.

# Visual Style Requirement
👉 **${stylePrompt}** 👈

# Task: Generate the Slide Deck
(Follow standard output structure defined in previous prompts)
...
        `;

        const writerPrompt = `
        # Role
        You are the "News Hunter & Content Architect." Convert the news into **ENGLISH** educational materials.

        SOURCE NEWS:
        ${JSON.stringify(newsContent)}

        # Workflow & Output (JSON Format)
        Please generate a JSON object with exactly these 2 fields:
        1. "synopsis_zh" (Brief Summary in Traditional Chinese)
        2. "source_material" (Markdown content: Meta Data, 6-Chapter Story in ENGLISH ONLY, Bilingual Vocab, Quiz without answers)
        `;

        const result = await model.generateContent(writerPrompt);
        const response = await result.response;
        const text = response.text().replace(/```json|```/g, '').trim();
        const generatedData = JSON.parse(text);

        generatedData.notebooklm_instruction = notebookLMPromptTemplate; // 簡化版，實際會用完整字串

        console.log(`✅ [Gemini] 內容生成完畢`);
        res.json(generatedData);

    } catch (error) {
        console.error('Generate Error:', error);
        res.status(500).json({ error: '生成失敗' });
    }
});

// 前端路由支援
app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API Not Found' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`✅ Server v2.1 Running on port ${port}`);
});