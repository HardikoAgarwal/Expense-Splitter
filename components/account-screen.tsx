"use client"

import { useState } from "react"
import {
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LogOutIcon,
  MailIcon,
  PencilIcon,
  ShieldCheckIcon,
  WalletIcon,
  UserRoundIcon,
} from "lucide-react"

import { ManageUsers } from "@/components/admin-screen"
import { AppSheet } from "@/components/app-sheet"
import { Notice } from "@/components/notice"
import { Person } from "@/components/person"
import { PushToggle } from "@/components/push-toggle"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FIELD, FIELD_LABEL, FIELDS, SectionTitle } from "@/components/field"
import { signOutAction, updateNameAction, updatePasswordAction, updateUpiAction } from "@/lib/actions"
import type { AppUser, SessionUser } from "@/lib/types"
import { normalizeUpi, upiError } from "@/lib/upi"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

export type AccountTab = "profile" | "users"

export function AccountScreen({
  user,
  people,
  initialTab = "profile",
  upiId = null,
  pushKey = null,
}: {
  user: SessionUser
  /** Only loaded for admins. */
  people: AppUser[] | null
  initialTab?: AccountTab
  upiId?: string | null
  /** Public VAPID key; null when push is not configured on the server. */
  pushKey?: string | null
}) {
  const canManage = user.isAdmin && people !== null
  const [tab, setTab] = useState<AccountTab>(canManage ? initialTab : "profile")
  // Follow the URL when it changes from outside (the sidebar link), without remounting.
  const [lastInitial, setLastInitial] = useState(initialTab)
  if (initialTab !== lastInitial) {
    setLastInitial(initialTab)
    if (canManage) setTab(initialTab)
  }

  function choose(next: AccountTab) {
    setTab(next)
    // Keep the tab in the URL so refresh and the sidebar link land on the same view.
    const url = next === "users" ? "/account?tab=users" : "/account"
    window.history.replaceState(null, "", url)
  }

  return (
    <div className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6 md:px-0 md:pt-6">
      <ProfileHeader user={user} />

      {canManage ? (
        <div role="tablist" aria-label="Account sections" className="mt-5 grid grid-cols-2 rounded-[12px] bg-muted p-1 md:max-w-sm">
          {(
            [
              ["profile", "Profile", <UserRoundIcon key="p" />],
              ["users", "Manage users", <ShieldCheckIcon key="u" />],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              id={`tab-${value}`}
              type="button"
              role="tab"
              aria-selected={tab === value}
              aria-controls={`panel-${value}`}
              onClick={() => choose(value)}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition [&_svg]:size-4",
                tab === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        {tab === "users" && canManage ? (
          <div role="tabpanel" id="panel-users" aria-labelledby="tab-users">
            <ManageUsers user={user} people={people} />
          </div>
        ) : (
          <div role={canManage ? "tabpanel" : undefined} id="panel-profile" aria-labelledby={canManage ? "tab-profile" : undefined}>
            <ProfileSettings user={user} upiId={upiId} pushKey={pushKey} />
          </div>
        )}
      </div>
    </div>
  )
}

function ProfileHeader({ user }: { user: SessionUser }) {
  return (
    <section className="gradient-hero relative overflow-hidden rounded-[16px] px-5 py-5 md:px-6 md:py-6">
      <div className="flex items-center gap-4">
        <Person
          id={user.id}
          name={user.displayName}
          className="size-16 text-lg ring-2 ring-white/40 after:hidden md:size-[72px] md:text-xl"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-white">{user.displayName}</h1>
            {user.isAdmin ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/18 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                <ShieldCheckIcon className="size-3" /> Admin
              </span>
            ) : null}
          </div>
          <p className="truncate text-sm text-white/75">{user.email}</p>
        </div>
      </div>
    </section>
  )
}

function ProfileSettings({ user, upiId, pushKey }: { user: SessionUser; upiId: string | null; pushKey: string | null }) {
  const [nameOpen, setNameOpen] = useState(false)
  const [upiOpen, setUpiOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const signingOut = useAction()

  const [signOutOpen, setSignOutOpen] = useState(false)

  function signOut() {
    signingOut.run(() => signOutAction(), { navigate: "/login", replace: true })
  }

  return (
    <div className="space-y-8">
      <SettingsGroup title="Account details">
        <SettingsRow icon={<UserRoundIcon />} label="Name" value={user.displayName} onClick={() => setNameOpen(true)} actionIcon={<PencilIcon />} />
        <SettingsRow icon={<MailIcon />} label="Email" value={user.email} hint="Ask the admin to change it" />
      </SettingsGroup>

      <SettingsGroup title="Payments">
        <SettingsRow
          icon={<WalletIcon />}
          label="UPI ID"
          value={upiId ?? "Add your UPI ID"}
          hint={upiId ? "Roommates can pay you in one tap" : "So roommates can pay you in one tap"}
          onClick={() => setUpiOpen(true)}
          actionIcon={<PencilIcon />}
        />
      </SettingsGroup>

      {user.demo ? null : (
        <SettingsGroup title="Notifications">
          <PushToggle publicKey={pushKey} />
        </SettingsGroup>
      )}

      <SettingsGroup title="Security">
        <SettingsRow
          icon={<KeyRoundIcon />}
          label="Password"
          value="Change your password"
          onClick={() => setPasswordOpen(true)}
          actionIcon={<ChevronRightIcon />}
        />
      </SettingsGroup>

      {user.demo ? <Notice title="Demo mode">Local ledger. Sign in as the other roommate to approve a payment.</Notice> : null}

      <SettingsGroup>
        <button
          type="button"
          onClick={() => setSignOutOpen(true)}
          disabled={signingOut.pending}
          aria-haspopup="dialog"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-negative transition hover:bg-negative/5 disabled:opacity-60"
        >
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-negative/10 [&_svg]:size-4">
            <LogOutIcon />
          </span>
          <span className="flex-1 font-medium">{signingOut.pending ? "Signing out…" : "Sign out"}</span>
        </button>
      </SettingsGroup>

      <EditNameDialog user={user} open={nameOpen} onOpenChange={setNameOpen} />
      <EditUpiDialog upiId={upiId} open={upiOpen} onOpenChange={setUpiOpen} />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      <Dialog open={signOutOpen} onOpenChange={(open) => !signingOut.pending && setSignOutOpen(open)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-[20px]">
          <DialogHeader>
            <DialogTitle>Sign out of Hissa?</DialogTitle>
            <DialogDescription>You&apos;ll need your email and password to sign back in on this device.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-2 bg-transparent sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-[12px]"
              disabled={signingOut.pending}
              onClick={() => setSignOutOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11 rounded-[12px] bg-negative text-white hover:bg-negative/90 focus-visible:ring-negative/30 dark:bg-negative dark:text-white"
              pending={signingOut.pending}
              onClick={signOut}
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section>
      {title ? <SectionTitle className="px-1">{title}</SectionTitle> : null}
      <div className="divide-y overflow-hidden rounded-[16px] bg-card ring-1 ring-border">{children}</div>
    </section>
  )
}

function SettingsRow({
  icon,
  label,
  value,
  hint,
  onClick,
  actionIcon,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  onClick?: () => void
  actionIcon?: React.ReactNode
}) {
  const body = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate font-medium">{value}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {actionIcon ? <span className="text-muted-foreground [&_svg]:size-4">{actionIcon}</span> : null}
    </>
  )
  if (!onClick) return <div className="flex items-center gap-3 px-4 py-3">{body}</div>
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/60">
      {body}
    </button>
  )
}

function EditNameDialog({
  user,
  open,
  onOpenChange,
}: {
  user: SessionUser
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(user.displayName)
  const { pending, run } = useAction()
  const trimmed = name.trim()
  const error = trimmed.length > 0 && (trimmed.length < 2 || trimmed.length > 40) ? "Use 2 to 40 characters." : null

  function save(event: React.FormEvent) {
    event.preventDefault()
    if (error || !trimmed) return
    run(() => updateNameAction(trimmed), { success: "Name updated", onSuccess: () => onOpenChange(false) })
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={(next) => {
        if (next) setName(user.displayName)
        onOpenChange(next)
      }}
      title="Edit name"
      description="This is how roommates see you in groups."
      footer={
        <Button
          type="submit"
          form="edit-name"
          size="xl"
          className="w-full"
          disabled={!trimmed || Boolean(error) || trimmed === user.displayName}
          pending={pending}
        >
          {pending ? "Saving…" : "Save name"}
        </Button>
      }
    >
      <form id="edit-name" onSubmit={save} className={cn(FIELD, "pb-2")}>
        <label htmlFor="display-name" className={FIELD_LABEL}>
          Name
        </label>
        <Input
          id="display-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "display-name-error" : undefined}
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
        {error ? (
          <p id="display-name-error" className="text-xs text-negative">
            {error}
          </p>
        ) : null}
      </form>
    </AppSheet>
  )
}

function EditUpiDialog({
  upiId,
  open,
  onOpenChange,
}: {
  upiId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState(upiId ?? "")
  const [touched, setTouched] = useState(false)
  const { pending, run } = useAction()
  const error = upiError(value)
  const next = normalizeUpi(value)
  const unchanged = next === (upiId ?? null)

  function save(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (error) return
    run(() => updateUpiAction(next), {
      success: next ? "UPI ID saved" : "UPI ID removed",
      onSuccess: () => onOpenChange(false),
    })
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setValue(upiId ?? "")
          setTouched(false)
        }
        onOpenChange(nextOpen)
      }}
      title="UPI ID"
      description="When someone owes you, Hissa shows them a Pay button that opens their UPI app with the amount filled in."
      footer={
        <div className="grid w-full gap-2">
          <Button type="submit" form="edit-upi" size="xl" className="w-full" disabled={unchanged || Boolean(error)} pending={pending}>
            {pending ? "Saving…" : "Save UPI ID"}
          </Button>
          {upiId ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full text-negative"
              disabled={pending}
              onClick={() => run(() => updateUpiAction(null), { success: "UPI ID removed", onSuccess: () => onOpenChange(false) })}
            >
              Remove UPI ID
            </Button>
          ) : null}
        </div>
      }
    >
      <form id="edit-upi" onSubmit={save} className={cn(FIELD, "pb-2")}>
        <label htmlFor="upi-id" className={FIELD_LABEL}>
          UPI ID
        </label>
        <Input
          id="upi-id"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="yourname@okicici"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          aria-invalid={touched && error ? true : undefined}
          aria-describedby="upi-help"
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
        <p id="upi-help" className={cn("text-xs", touched && error ? "text-negative" : "text-muted-foreground")}>
          {touched && error ? error : "Find it in GPay, PhonePe or Paytm under your profile. Looks like name@bank."}
        </p>
      </form>
    </AppSheet>
  )
}

export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (password.length === 0) return { score: 0, label: "" }
  if (password.length < 8) return { score: 0, label: `${8 - password.length} more characters` }
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
  if (password.length >= 12 && variety >= 3) return { score: 3, label: "Strong" }
  if (password.length >= 10 || variety >= 3) return { score: 2, label: "Good" }
  return { score: 1, label: "Okay. Longer is stronger." }
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [visible, setVisible] = useState(false)
  const [touched, setTouched] = useState(false)
  const { pending, run } = useAction()
  const strength = passwordStrength(password)
  const tooShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && confirm !== password
  const canSave = password.length >= 8 && confirm === password

  function reset() {
    setPassword("")
    setConfirm("")
    setVisible(false)
    setTouched(false)
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!canSave) return
    run(() => updatePasswordAction(password), {
      success: "Password changed",
      onSuccess: () => {
        reset()
        onOpenChange(false)
      },
    })
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Change password"
      description="Use at least 8 characters. You stay signed in on this device."
      footer={
        <Button type="submit" form="change-password" size="xl" className="w-full" disabled={!canSave} pending={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      }
    >
      <form id="change-password" onSubmit={save} className={cn(FIELDS, "pb-2")}>
        <div className={FIELD}>
          <div className="flex items-center justify-between">
            <label htmlFor="new-password" className={FIELD_LABEL}>
              New password
            </label>
            <button
              type="button"
              onClick={() => setVisible((value) => !value)}
              aria-pressed={visible}
              className="inline-flex items-center gap-1 rounded-[8px] px-1.5 py-1 text-xs font-medium text-primary hover:bg-accent"
            >
              {visible ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
              {visible ? "Hide" : "Show"}
            </button>
          </div>
          <Input
            id="new-password"
            type={visible ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            aria-invalid={touched && tooShort ? true : undefined}
            aria-describedby="password-strength"
            className="h-12 rounded-[12px] px-3.5 text-base"
          />
          <div id="password-strength" aria-live="polite" className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1" aria-hidden>
              {[1, 2, 3].map((level) => (
                <span
                  key={level}
                  className={cn(
                    "h-1 rounded-full bg-muted transition-colors",
                    password.length > 0 && strength.score >= level && (strength.score === 1 ? "bg-warning" : "bg-positive"),
                    password.length > 0 && strength.score === 0 && level === 1 && "bg-negative/60",
                  )}
                />
              ))}
            </div>
            <p className={cn("text-xs", tooShort ? "text-negative" : "text-muted-foreground")}>
              {strength.label || "At least 8 characters. Mix letters, numbers and symbols."}
            </p>
          </div>
        </div>
        <div className={FIELD}>
          <label htmlFor="confirm-password" className={FIELD_LABEL}>
            Confirm new password
          </label>
          <Input
            id="confirm-password"
            type={visible ? "text" : "password"}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch ? true : undefined}
            aria-describedby={mismatch ? "confirm-error" : undefined}
            className="h-12 rounded-[12px] px-3.5 text-base"
          />
          {mismatch ? (
            <p id="confirm-error" className="text-xs text-negative">
              Passwords do not match yet.
            </p>
          ) : confirm.length > 0 && canSave ? (
            <p className="text-xs text-positive">Passwords match.</p>
          ) : null}
        </div>
      </form>
    </AppSheet>
  )
}
