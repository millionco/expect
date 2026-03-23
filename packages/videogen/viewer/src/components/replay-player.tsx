import { useRef } from "react";
import type { eventWithTime } from "@rrweb/types";
import { REPLAY_PLAYER_WIDTH_PX, REPLAY_PLAYER_HEIGHT_PX } from "@/constants";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { Card, CardContent } from "@/components/ui/card";
import "rrweb-player/dist/style.css";

export const ReplayPlayer = ({ events }: { events: eventWithTime[] }) => {
  const containerRef = useRef<HTMLDivElement>(undefined);
  const playerRef = useRef<unknown>(undefined);

  useMountEffect(() => {
    if (events.length < 2 || !containerRef.current || playerRef.current) return;

    let cancelled = false;

    import("rrweb-player").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const RrwebPlayer = mod.default;
      playerRef.current = new RrwebPlayer({
        target: containerRef.current,
        props: {
          events,
          width: REPLAY_PLAYER_WIDTH_PX,
          height: REPLAY_PLAYER_HEIGHT_PX,
          showController: true,
          autoPlay: false,
        },
      });
    });

    return () => {
      cancelled = true;
    };
  });

  if (events.length < 2) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-muted-foreground">
          {events.length === 0 ? "No replay events yet." : "Waiting for more events..."}
        </CardContent>
      </Card>
    );
  }

  return <div ref={containerRef} className="rounded-lg overflow-hidden" />;
};
