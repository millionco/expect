import { Link, useLocation, Outlet } from "react-router-dom";
import { Home, User, LogOut, LogIn } from "lucide-react";
import { store } from "@/store";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/profile", label: "Profile", icon: User },
];

export const Layout = ({ onUpdate }: { onUpdate: () => void }) => {
  const location = useLocation();
  const currentUser = store.getCurrentUser();

  return (
    <div className="flex justify-center min-h-screen">
      <nav className="w-60 p-5 border-r border-border sticky top-0 h-screen flex flex-col">
        <div className="text-3xl px-3 py-2 mb-2">🐦</div>
        {NAV_ITEMS.map((item) => {
          const profilePath = currentUser ? `/profile/${currentUser.handle}` : "/profile";
          const href = item.path === "/profile" ? profilePath : item.path;
          const isActive =
            item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
          const Icon = item.icon;

          return (
            <Button
              key={item.path}
              variant="ghost"
              asChild
              className={cn(
                "justify-start gap-4 rounded-full text-lg h-auto py-3 px-4",
                isActive && "font-bold",
              )}
            >
              <Link to={currentUser ? href : "/login"}>
                <Icon className="size-6" />
                <span>{item.label}</span>
              </Link>
            </Button>
          );
        })}
        <Separator className="my-2" />
        {currentUser && (
          <Button
            variant="ghost"
            onClick={() => {
              store.logout();
              onUpdate();
            }}
            className="justify-start gap-4 rounded-full text-lg h-auto py-3 px-4"
          >
            <LogOut className="size-6" />
            <span>Logout</span>
          </Button>
        )}
        {!currentUser && (
          <Button
            variant="ghost"
            asChild
            className="justify-start gap-4 rounded-full text-lg h-auto py-3 px-4"
          >
            <Link to="/login">
              <LogIn className="size-6" />
              <span>Login</span>
            </Link>
          </Button>
        )}
      </nav>
      <main className="w-[600px] border-r border-border">
        <Outlet />
      </main>
      <aside className="w-60" />
    </div>
  );
};
