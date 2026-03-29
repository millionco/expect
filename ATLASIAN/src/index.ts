import { fetchLatestNews } from "./fetcher";
import { analyzeAndSynthesize } from "./analyzer";
import * as fs from "fs";
import * as path from "path";

async function main() {
    console.log("🚀 ATLASIAN Küresel Haber & Sentez Ajanı Başlatıldı...\n");
    console.log("Veri Hattı: (WSJ, CNBC, Yahoo Finance, Investing Yabancı ve Yerle Kaynakları)\n");
    
    try {
        // 1. Haberleri Çek (İngilizce Ham Veriler)
        const newsRawData = await fetchLatestNews();
        if (!newsRawData.trim()) {
            console.warn("Haber verisi çekilemedi. Kaynak bağlantısında bir sorun var.");
            return;
        }
        
        console.log("---- ÖRNEK HAM YABANCI VERİ (LLM'E GİDECEK OLAN KISIM) ----");
        console.log(newsRawData.substring(0, 800) + "\n...\n");
        console.log("----------------------------------------------------------\n");
        
        // 2. LLM Analizi (İngilizce -> Türkçe, Raporlama)
        const synthesisMarkdown = await analyzeAndSynthesize(newsRawData);
        
        // 3. Dosyaya Yaz (../haber-ajansi/ klasörüne)
        const targetDir = path.resolve(__dirname, "../../haber-ajansi");
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        // Dosya ismi için tarih-saat eklentisi
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const reportPath = path.join(targetDir, `v3-uluslararasi-sentez-${timestamp}.md`);
        
        // Final Kayıt
        fs.writeFileSync(reportPath, synthesisMarkdown, "utf8");
        console.log(`\n🎉 Küresel Analiz Görevi Tamamlandı! Raporunuz şuraya kaydedildi:\n👉 ${reportPath}`);

    } catch (error) {
        console.error("\n❌ ATLASIAN Sistem Hatası:", error);
    }
}

// Botu Tetikle
main();
