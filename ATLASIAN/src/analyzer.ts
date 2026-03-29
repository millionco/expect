import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import { LLM_PROMPT } from "./config";

dotenv.config();

export async function analyzeAndSynthesize(newsText: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("❌ GEMINI_API_KEY bulunamadı! Lütfen ATLASIAN/ klasöründe .env dosyası oluşturup içine GEMINI_API_KEY='anahtarınız' şeklinde ekleyin.");
    }

    // Initialize the official Google Gen AI SDK
    const ai = new GoogleGenAI({ apiKey });
    
    // Inject the raw news data into the prompt template
    const prompt = LLM_PROMPT.replace("{{NEWS_DATA}}", newsText);
    
    console.log("🧠 ATLASIAN Yapay Zeka (Gemini) verileri sizin için okuyor ve sentezliyor...");
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        
        return response.text || "Yapay zeka analiz sonucu üretemedi.";
    } catch (e) {
        console.error("❌ Sentezleme Hatası (API veya Kota Sınırı):", e);
        throw e;
    }
}
