import type { ActionLogEntry } from "./constants";

interface ActionHistoryProps {
  actions: ActionLogEntry[];
}

export const ActionHistory = ({ actions }: ActionHistoryProps) => {
  if (actions.length === 0) {
    return <div className="px-3 py-4 text-center text-white/40 text-xs">No actions yet</div>;
  }

  return (
    <div className="flex flex-col py-1.5 max-h-64 overflow-y-auto">
      {actions.map((action, index) => (
        <div
          key={index}
          className="flex items-start gap-2.5 px-3 py-2 hover:bg-white/[0.06] transition-colors duration-100"
        >
          <div
            className="flex items-center justify-center shrink-0 size-5 rounded-full text-white text-[10px] font-semibold mt-0.5"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            {index + 1}
          </div>
          <div className="min-w-0 text-[13px] leading-[1.4] text-white/80 truncate">
            {action.description}
          </div>
        </div>
      ))}
    </div>
  );
};
