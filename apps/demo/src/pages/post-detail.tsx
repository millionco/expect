import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { store } from "@/store";
import { UserAvatar } from "@/components/avatar";
import { ReplyThread } from "@/components/reply-thread";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export const PostDetailPage = ({ onUpdate }: { onUpdate: () => void }) => {
  const { postId } = useParams<{ postId: string }>();
  const post = postId ? store.getPost(postId) : undefined;
  const author = post ? store.getUser(post.authorId) : undefined;
  const currentUser = store.getCurrentUser();
  const isLiked = currentUser && post ? post.likes.includes(currentUser.id) : false;

  if (!post || !author) {
    return <div className="p-5 text-center text-muted-foreground">Post not found.</div>;
  }

  const handleLike = () => {
    store.toggleLike(post.id);
    onUpdate();
  };

  const date = new Date(post.createdAt);
  const timeString = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateString = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <div className="px-4 py-3 text-xl font-bold border-b border-border flex items-center gap-6 sticky top-0 bg-background/85 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" asChild className="rounded-full -ml-2">
          <Link to="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        Post
      </div>
      <div className="p-4">
        <div className="flex gap-3 mb-3">
          <Link to={`/profile/${author.handle}`}>
            <UserAvatar name={author.name} color={author.color} />
          </Link>
          <div>
            <Link
              to={`/profile/${author.handle}`}
              className="font-bold text-foreground no-underline hover:underline block"
            >
              {author.name}
            </Link>
            <span className="text-muted-foreground">@{author.handle}</span>
          </div>
        </div>
        <p className="text-2xl leading-snug mb-3 text-foreground">{post.content}</p>
        <div className="text-muted-foreground text-[15px] pb-3">
          {timeString} · {dateString}
        </div>
        <Separator />
        <div className="flex gap-6 py-3 text-muted-foreground text-sm">
          <span className="flex items-center gap-1.5">
            <MessageCircle className="size-4" />
            <strong className="text-foreground">{store.getReplies(post.id).length}</strong> Replies
          </span>
          <span className="flex items-center gap-1.5">
            <Repeat2 className="size-4" />
            <strong className="text-foreground">{post.repostCount}</strong> Reposts
          </span>
          <span className="flex items-center gap-1.5">
            <Heart className={cn("size-4", isLiked && "fill-[#f91880] text-[#f91880]")} />
            <strong className="text-foreground">{post.likes.length}</strong> Likes
          </span>
        </div>
        <Separator />
        <div className="flex justify-center py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLike}
            className={cn(
              "rounded-full",
              isLiked
                ? "text-[#f91880] hover:bg-pink-50"
                : "text-muted-foreground hover:text-[#f91880] hover:bg-pink-50",
            )}
          >
            <Heart className={cn("size-5", isLiked && "fill-current")} />
          </Button>
        </div>
        <Separator />
      </div>
      <ReplyThread postId={post.id} onUpdate={onUpdate} />
    </div>
  );
};
