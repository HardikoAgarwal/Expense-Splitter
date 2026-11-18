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

/** Chart colours, matching the category icon tints. */
export const CATEGORY_COLORS: Record<string, string> = {
  rent: "#1F6B4A",
  groceries: "#C08A2E",
  utilities: "#3D72B0",
  dining: "#C0533F",
  transport: "#6656A8",
  household: "#5C8C72",
  other: "#9A928A",
}

export function categoryColor(id: string | null): string {
  return CATEGORY_COLORS[id ?? "other"] ?? CATEGORY_COLORS.other
}
