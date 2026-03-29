import Parser from "rss-parser";
import { RSS_SOURCES } from "./config";

const parser = new Parser();

export async function fetchLatestNews(): Promise<string> {
  console.log("🌐 Yabancı kaynaklardan küresel haber akışları taranıyor...");
  let combinedNews = "";

  for (const source of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      combinedNews += `\n\n### Kaynak: ${source.name}\n`;
      // Fetch top 6 items
      const topItems = feed.items.slice(0, 6);
      for (const item of topItems) {
        // We clean out HTML tags if any
        const rawContent = (item.contentSnippet || item.content || item.summary || "").replace(/<[^>]*>?/gm, '');
        combinedNews += `- **${item.title}**: ${rawContent} (${item.pubDate})\n`;
      }
      console.log(`✅ [${source.name}] Başarıyla çekildi. (${topItems.length} haber okundu)`);
    } catch (error) {
      console.error(`❌ [${source.name}] Çekilemedi: ${(error as Error).message}`);
    }
  }

  return combinedNews;
}
