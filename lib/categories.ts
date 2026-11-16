export const CATEGORIES = [
  { id: "rent", label: "Rent" },
  { id: "groceries", label: "Groceries" },
  { id: "utilities", label: "Utilities" },
  { id: "dining", label: "Dining" },
  { id: "transport", label: "Transport" },
  { id: "household", label: "Household" },
  { id: "other", label: "Other" },
] as const

export type CategoryId = (typeof CATEGORIES)[number]["id"]

export function categoryLabel(id: string | null): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? "General"
}

export function isCategory(id: string | null | undefined): id is CategoryId {
  return CATEGORIES.some((category) => category.id === id)
}
