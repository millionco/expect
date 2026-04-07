import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { store } from "@/store";
import { UserAvatar } from "@/components/avatar";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const ProfilePage = ({ onUpdate }: { onUpdate: () => void }) => {
  const { handle } = useParams<{ handle: string }>();
  const user = handle ? store.getUserByHandle(handle) : undefined;

  if (!user) {
    return <div className="p-5 text-center text-muted-foreground">User not found.</div>;
  }

  const posts = store.getPostsByUser(user.id);
  const currentUser = store.getCurrentUser();
  const isOwnProfile = currentUser?.id === user.id;

  return (
    <div>
      <div className="px-4 py-3 text-xl font-bold border-b border-border flex items-center gap-6 sticky top-0 bg-background/85 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" asChild className="rounded-full -ml-2">
          <Link to="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        {user.name}
      </div>
      <div className="pt-12 px-4 pb-4 border-b border-border">
        <UserAvatar name={user.name} color={user.color} size="lg" />
        <div className="mt-3">
          <div className="font-bold text-xl text-foreground">{user.name}</div>
          <div className="text-muted-foreground">@{user.handle}</div>
        </div>
        <div className="mt-3 flex gap-5 text-muted-foreground text-sm">
          <span>
            <strong className="text-foreground">{posts.length}</strong> Posts
          </span>
          <span>
            <strong className="text-foreground">
              {posts.reduce((sum, post) => sum + post.likes.length, 0)}
            </strong>{" "}
            Likes received
          </span>
        </div>
        {isOwnProfile && (
          <Badge variant="secondary" className="mt-3">
            This is you
          </Badge>
        )}
      </div>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onUpdate={onUpdate} />
      ))}
      {posts.length === 0 && (
        <div className="p-10 text-center text-muted-foreground">No posts yet.</div>
      )}
    </div>
  );
};
