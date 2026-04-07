import { Avatar as ShadAvatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "size-8",
  md: "size-10",
  lg: "size-20",
};

const TEXT_SIZES = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-2xl",
};

export const UserAvatar = ({ name, color, size = "md", className }: UserAvatarProps) => {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <ShadAvatar className={cn(SIZES[size], className)}>
      <AvatarFallback
        className={cn("text-white font-bold", TEXT_SIZES[size])}
        style={{ backgroundColor: color }}
      >
        {initials}
      </AvatarFallback>
    </ShadAvatar>
  );
};
