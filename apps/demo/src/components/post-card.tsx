import { Link } from "react-router-dom";
import { Heart, MessageCircle, Repeat2, X } from "lucide-react";
import type { Post } from "@/types";
import { store } from "@/store";
import { UserAvatar } from "./avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const formatTime = (timestamp: number) => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hoursAgo = Math.floor(minutes / 60);
  if (hoursAgo < 24) return `${hoursAgo}h`;
  return `${Math.floor(hoursAgo / 24)}d`;
};

interface PostCardProps {
  post: Post;
  onUpdate: () => void;
}

export const PostCard = ({ post, onUpdate }: PostCardProps) => {
  const author = store.getUser(post.authorId);
  const currentUser = store.getCurrentUser();
  const replies = store.getReplies(post.id);
  const isLiked = currentUser ? post.likes.includes(currentUser.id) : false;
  const isOwn = currentUser?.id === post.authorId;

  if (!author) return null;

  const handleLike = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    store.toggleLike(post.id);
    onUpdate();
  };

  const handleDelete = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    store.deletePost(post.id);
    onUpdate();
  };

  return (
    <Link
      to={`/post/${post.id}`}
      className="flex gap-3 p-4 border-b border-border no-underline text-foreground hover:bg-accent transition-colors"
    >
      <Link to={`/profile/${author.handle}`} onClick={(event) => event.stopPropagation()}>
        <UserAvatar name={author.name} color={author.color} />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <Link
            to={`/profile/${author.handle}`}
            onClick={(event) => event.stopPropagation()}
            className="font-bold text-foreground no-underline hover:underline"
          >
            {author.name}
          </Link>
          <span className="text-muted-foreground">@{author.handle}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{formatTime(post.createdAt)}</span>
          {isOwn && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleDelete}
              className="ml-auto text-muted-foreground hover:text-destructive"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <p className="my-1 mb-3 text-foreground leading-relaxed text-[15px]">{post.content}</p>
        <div className="flex gap-12 text-muted-foreground text-[13px]">
          <span className="flex items-center gap-1.5 hover:text-primary transition-colors">
            <MessageCircle className="size-4" />
            {replies.length}
          </span>
          <span className="flex items-center gap-1.5 hover:text-green-500 transition-colors">
            <Repeat2 className="size-4" />
            {post.repostCount}
          </span>
          <button
            onClick={handleLike}
            className={cn(
              "flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-[13px] p-0 transition-colors",
              isLiked ? "text-[#f91880]" : "text-muted-foreground hover:text-[#f91880]",
            )}
          >
            <Heart className={cn("size-4", isLiked && "fill-current")} />
            {post.likes.length}
          </button>
        </div>
      </div>
    </Link>
  );
};
