import { useState } from "react";
import type { Reply } from "@/types";
import { store } from "@/store";
import { UserAvatar } from "./avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const formatTime = (timestamp: number) => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hoursAgo = Math.floor(minutes / 60);
  if (hoursAgo < 24) return `${hoursAgo}h`;
  return `${Math.floor(hoursAgo / 24)}d`;
};

interface ReplyThreadProps {
  postId: string;
  onUpdate: () => void;
}

export const ReplyThread = ({ postId, onUpdate }: ReplyThreadProps) => {
  const [replyText, setReplyText] = useState("");
  const replies = store.getReplies(postId);
  const currentUser = store.getCurrentUser();

  const handleReply = () => {
    if (!replyText.trim()) return;
    store.addReply(postId, replyText.trim());
    setReplyText("");
    onUpdate();
  };

  return (
    <div>
      {currentUser && (
        <div className="flex gap-3 p-4 border-b border-border">
          <UserAvatar name={currentUser.name} color={currentUser.color} size="sm" />
          <div className="flex-1">
            <Textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder="Post your reply"
              className="border-none shadow-none text-[15px] min-h-[40px] resize-none focus-visible:ring-0 px-0"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleReply}
                disabled={!replyText.trim()}
                size="sm"
                className="rounded-full"
              >
                Reply
              </Button>
            </div>
          </div>
        </div>
      )}
      {replies.map((reply) => (
        <ReplyItem key={reply.id} reply={reply} />
      ))}
    </div>
  );
};

const ReplyItem = ({ reply }: { reply: Reply }) => {
  const author = store.getUser(reply.authorId);
  if (!author) return null;

  return (
    <div className="flex gap-3 p-4 border-b border-border">
      <UserAvatar name={author.name} color={author.color} size="sm" />
      <div>
        <div className="flex items-center gap-1">
          <span className="font-bold text-foreground text-sm">{author.name}</span>
          <span className="text-muted-foreground text-sm">@{author.handle}</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-muted-foreground text-sm">{formatTime(reply.createdAt)}</span>
        </div>
        <p className="mt-1 text-foreground text-sm leading-relaxed">{reply.content}</p>
      </div>
    </div>
  );
};
