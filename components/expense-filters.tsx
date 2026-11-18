"use client"

import { useState } from "react"
import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FIELD } from "@/components/field"
import { CATEGORIES, categoryLabel } from "@/lib/categories"
import { activeFilterCount, EMPTY_FILTERS, type ExpenseFilters } from "@/lib/expense-filters"
import { formatDay } from "@/lib/money"
import type { Member } from "@/lib/types"
import { cn } from "@/lib/utils"

const selectClass =
  "h-11 w-full rounded-[12px] border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

/**
 * Search plus filters for an expense list. Desktop gets an inline bar; on phones the
 * filters open in a centred dialog. Active filters show as removable chips.
 */
export function ExpenseFilterBar({
  filters,
  onChange,
  members,
  userId,
  total,
  shown,
}: {
  filters: ExpenseFilters
  onChange: (filters: ExpenseFilters) => void
  members: Member[]
  userId: string
  total: number
  shown: number
}) {
  const [open, setOpen] = useState(false)
  const count = activeFilterCount({ ...filters, query: "" })
  const name = (id: string) => (id === userId ? "You" : (members.find((member) => member.id === id)?.displayName.split(" ")[0] ?? "Someone"))
  const set = (patch: Partial<ExpenseFilters>) => onChange({ ...filters, ...patch })

  const chips: { key: string; label: string; clear: Partial<ExpenseFilters> }[] = []
  if (filters.paidBy) chips.push({ key: "paidBy", label: `Paid by ${name(filters.paidBy)}`, clear: { paidBy: null } })
  if (filters.involves) chips.push({ key: "involves", label: `Involves ${name(filters.involves)}`, clear: { involves: null } })
  if (filters.category) chips.push({ key: "category", label: categoryLabel(filters.category === "other" ? null : filters.category), clear: { category: null } })
  if (filters.from || filters.to) {
    const label =
      filters.from && filters.to
        ? `${formatDay(filters.from)} – ${formatDay(filters.to)}`
        : filters.from
          ? `From ${formatDay(filters.from)}`
          : `Until ${formatDay(filters.to!)}`
    chips.push({ key: "dates", label, clear: { from: null, to: null } })
  }

  const fields = (
    <>
      <Field label="Paid by" id="filter-paid-by">
        <select id="filter-paid-by" className={selectClass} value={filters.paidBy ?? ""} onChange={(event) => set({ paidBy: event.target.value || null })}>
          <option value="">Anyone</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.id === userId ? "You" : member.displayName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Involves" id="filter-involves">
        <select id="filter-involves" className={selectClass} value={filters.involves ?? ""} onChange={(event) => set({ involves: event.target.value || null })}>
          <option value="">Anyone</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.id === userId ? "You" : member.displayName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Category" id="filter-category">
        <select id="filter-category" className={selectClass} value={filters.category ?? ""} onChange={(event) => set({ category: event.target.value || null })}>
          <option value="">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="From" id="filter-from">
        <Input id="filter-from" type="date" value={filters.from ?? ""} max={filters.to ?? undefined} onChange={(event) => set({ from: event.target.value || null })} className="h-11 rounded-[12px]" />
      </Field>
      <Field label="To" id="filter-to">
        <Input id="filter-to" type="date" value={filters.to ?? ""} min={filters.from ?? undefined} onChange={(event) => set({ to: event.target.value || null })} className="h-11 rounded-[12px]" />
      </Field>
    </>
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="expense-search" className="sr-only">
            Search expenses
          </label>
          <Input
            id="expense-search"
            type="search"
            value={filters.query}
            onChange={(event) => set({ query: event.target.value })}
            placeholder="Search expenses"
            className="h-11 rounded-[12px] pl-10 text-base md:text-sm"
          />
        </div>
        <Button variant="outline" size="lg" className="relative lg:hidden" onClick={() => setOpen(true)} aria-label={`Filters${count ? `, ${count} active` : ""}`}>
          <SlidersHorizontalIcon />
          <span className="hidden sm:inline">Filters</span>
          {count ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{count}</span>
          ) : null}
        </Button>
      </div>

      <div className="hidden grid-cols-5 gap-2 lg:grid">{fields}</div>

      {chips.length > 0 || filters.query.trim() ? (
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => set(chip.clear)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent/70"
            >
              {chip.label}
              <XIcon className="size-3.5" aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <span className="text-xs text-muted-foreground">
            {shown} of {total}
          </span>
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="ml-auto text-xs font-semibold text-primary">
            Clear all
          </button>
        </div>
      ) : null}

      <AppSheet
        open={open}
        onOpenChange={setOpen}
        title="Filter expenses"
        description="Narrow the list by person, category or date."
        footer={
          <div className="grid w-full grid-cols-[auto_1fr] gap-2">
            <Button variant="outline" size="xl" onClick={() => onChange({ ...EMPTY_FILTERS, query: filters.query })}>
              Reset
            </Button>
            <Button size="xl" onClick={() => setOpen(false)}>
              Show {shown} {shown === 1 ? "expense" : "expenses"}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 pb-2 [&>*:nth-child(-n+3)]:col-span-2">{fields}</div>
      </AppSheet>
    </div>
  )
}

function Field({ label, id, children, className }: { label: string; id: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(FIELD, className)}>
      <label htmlFor={id} className="block text-xs leading-none font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
