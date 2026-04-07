import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { store } from "@/store";
import { UserAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const LoginPage = ({ onUpdate }: { onUpdate: () => void }) => {
  const [selectedUser, setSelectedUser] = useState("");
  const navigate = useNavigate();
  const users = store.getUsers();

  const handleLogin = () => {
    if (!selectedUser) return;
    store.login(selectedUser);
    onUpdate();
    navigate("/");
  };

  return (
    <div>
      <div className="px-4 py-3 text-xl font-bold border-b border-border">Login</div>
      <div className="p-8 max-w-sm mx-auto">
        <div className="text-3xl mb-2 text-center">🐦</div>
        <h2 className="text-2xl font-bold mb-6 text-center text-foreground">Sign in to Chirp</h2>
        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <Card
              key={user.id}
              className={cn(
                "flex items-center gap-3 p-3 cursor-pointer transition-colors border-2",
                selectedUser === user.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground",
              )}
              onClick={() => setSelectedUser(user.id)}
            >
              <UserAvatar name={user.name} color={user.color} />
              <div>
                <div className="font-semibold text-foreground">{user.name}</div>
                <div className="text-muted-foreground text-sm">@{user.handle}</div>
              </div>
            </Card>
          ))}
        </div>
        <Button
          onClick={handleLogin}
          disabled={!selectedUser}
          className="w-full mt-6 rounded-full py-3 h-auto text-base"
        >
          Log in
        </Button>
      </div>
    </div>
  );
};
