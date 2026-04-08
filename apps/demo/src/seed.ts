import type { CellData } from "./types";

export const SEED_CELLS: Record<string, CellData> = {
  A1: { value: "Item" },
  B1: { value: "Category" },
  C1: { value: "Amount" },
  D1: { value: "Date" },
  E1: { value: "Status" },
  F1: { value: "Notes" },

  A2: { value: "Salary" },
  B2: { value: "Income" },
  C2: { value: "4500" },
  D2: { value: "2026-04-01" },
  E2: { value: "Received" },
  F2: { value: "" },

  A3: { value: "Freelance" },
  B3: { value: "Income" },
  C3: { value: "800" },
  D3: { value: "2026-04-05" },
  E3: { value: "Pending" },
  F3: { value: "Invoice #1042" },

  A4: { value: "Side project" },
  B4: { value: "Income" },
  C4: { value: "" },
  D4: { value: "" },
  E4: { value: "" },
  F4: { value: "Need to invoice" },

  A5: { value: "Rent" },
  B5: { value: "Housing" },
  C5: { value: "-1200" },
  D5: { value: "2026-04-01" },
  E5: { value: "Paid" },
  F5: { value: "" },

  A6: { value: "Groceries" },
  B6: { value: "Food" },
  C6: { value: "-340" },
  D6: { value: "2026-04-03" },
  E6: { value: "Paid" },
  F6: { value: "" },

  A7: { value: "Electric bill" },
  B7: { value: "Utilities" },
  C7: { value: "-150" },
  D7: { value: "2026-04-06" },
  E7: { value: "Paid" },
  F7: { value: "" },

  A8: { value: "Coffee" },
  B8: { value: "Food" },
  C8: { value: "-45" },
  D8: { value: "2026-04-07" },
  E8: { value: "Paid" },
  F8: { value: "" },

  A9: { value: "Internet" },
  B9: { value: "Utilities" },
  C9: { value: "-80" },
  D9: { value: "2026-04-08" },
  E9: { value: "" },
  F9: { value: "" },

  A10: { value: "Gym" },
  B10: { value: "" },
  C10: { value: "-50" },
  D10: { value: "" },
  E10: { value: "" },
  F10: { value: "" },

  A11: { value: "" },
  B11: { value: "" },
  C11: { value: "" },
  D11: { value: "" },
  E11: { value: "" },
  F11: { value: "" },

  A13: { value: "Summary" },

  A14: { value: "Total Income" },
  C14: { value: "=SUM(C2:C4)" },

  A15: { value: "Total Expenses" },
  C15: { value: "=SUM(C5:C10)" },

  A16: { value: "Net" },
  C16: { value: "=SUM(C2:C10)" },
};
