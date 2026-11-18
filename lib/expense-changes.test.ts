import { describe, expect, it } from "vitest"

import { deleteRecipients, describeDelete, describeEdit, editRecipients, type ExpenseSnapshot } from "@/lib/expense-changes"

const base: ExpenseSnapshot = {
  id: "e",
  groupId: "g",
  description: "Groceries",
  amountPaise: 120000,
  payerId: "a",
  expenseDate: "2026-11-12",
  category: "groceries",
  createdBy: "a",
  shares: [
    { userId: "a", sharePaise: 60000 },
    { userId: "m", sharePaise: 60000 },
  ],
}
const names = (id: string) => ({ a: "Aarav", m: "Meera", k: "Kabir" })[id] ?? "Someone"

describe("describeEdit", () => {
  it("summarises amount and the recipient's share", () => {
    const after = { ...base, amountPaise: 150000, shares: [{ userId: "a", sharePaise: 75000 }, { userId: "m", sharePaise: 75000 }] }
    expect(describeEdit(base, after, "m", names)).toBe("₹1,200 → ₹1,500 · your share ₹600 → ₹750")
  })

  it("covers rename, date, payer and category", () => {
    const after = { ...base, description: "Big shop", expenseDate: "2026-11-14", payerId: "m", category: "household" }
    expect(describeEdit(base, after, "k", names)).toBe(
      "renamed from “Groceries” · date 12 Nov → 14 Nov · now paid by Meera · category Groceries → Household",
    )
    expect(describeEdit(base, after, "m", names)).toContain("now paid by you")
  })

  it("notes a split change when the recipient's own share is unchanged", () => {
    const after = {
      ...base,
      shares: [
        { userId: "a", sharePaise: 30000 },
        { userId: "m", sharePaise: 60000 },
        { userId: "k", sharePaise: 30000 },
      ],
    }
    expect(describeEdit(base, after, "m", names)).toBe("split changed")
  })

  it("says when someone is removed from the split", () => {
    const after = { ...base, shares: [{ userId: "a", sharePaise: 120000 }] }
    expect(describeEdit(base, after, "m", names)).toBe("you're no longer in the split")
  })

  it("returns null when nothing changed", () => {
    expect(describeEdit(base, { ...base }, "m", names)).toBeNull()
  })
})

describe("recipients", () => {
  it("splits newly added people from people to tell about the edit, never the editor", () => {
    const after = { ...base, shares: [{ userId: "a", sharePaise: 60000 }, { userId: "k", sharePaise: 60000 }] }
    expect(editRecipients(base, after, "a")).toEqual({ added: ["k"], edited: ["m"] })
  })

  it("tells everyone who had a share about a delete", () => {
    expect(deleteRecipients(base, "a")).toEqual(["m"])
    expect(describeDelete(base, "m")).toBe("₹1,200 · your share was ₹600")
  })
})
