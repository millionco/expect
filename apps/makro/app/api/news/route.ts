import { NextResponse } from "next/server";
import { getNewsFeed } from "@/lib/get-news-feed";

export const dynamic = "force-dynamic";

export const GET = async () => {
  const feed = await getNewsFeed();
  return NextResponse.json(feed);
};
