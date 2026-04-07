import { useState } from "react";
import { store } from "@/store";
import { UserAvatar } from "./avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

export const ComposeBox = ({ onUpdate }: { onUpdate: () => void }) => {
  const [text, setText] = useState("");
  const currentUser = store.getCurrentUser();

  if (!currentUser) return null;

  const handleSubmit = () => {
    if (!text.trim()) return;
    store.createPost(text.trim());
    setText("");
    onUpdate();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <>
      <div className="flex gap-3 p-4">
        <UserAvatar name={currentUser.name} color={currentUser.color} />
        <div className="flex-1">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's happening?"
            className="border-none shadow-none text-lg min-h-[60px] resize-none focus-visible:ring-0 px-0"
          />
          <div className="flex justify-end pt-2">
            <Button onClick={handleSubmit} disabled={!text.trim()} className="rounded-full px-5">
              Post
            </Button>
          </div>
        </div>
      </div>
      <Separator />
    </>
  );
};
