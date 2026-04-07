import { store } from "@/store";
import { PostCard } from "@/components/post-card";
import { ComposeBox } from "@/components/compose-box";

export const FeedPage = ({ onUpdate }: { onUpdate: () => void }) => {
  const posts = store.getPosts();

  return (
    <div>
      <div className="px-4 py-3 text-xl font-bold border-b border-border sticky top-0 bg-background/85 backdrop-blur-md z-10">
        Home
      </div>
      <ComposeBox onUpdate={onUpdate} />
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onUpdate={onUpdate} />
      ))}
    </div>
  );
};
