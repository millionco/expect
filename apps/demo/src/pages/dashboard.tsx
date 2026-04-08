import { SpreadsheetGrid } from "@/components/spreadsheet-grid";

export const DashboardPage = ({ onUpdate }: { onUpdate: () => void }) => {
  return (
    <div className="h-[calc(100vh-56px)]">
      <SpreadsheetGrid onUpdate={onUpdate} />
    </div>
  );
};
