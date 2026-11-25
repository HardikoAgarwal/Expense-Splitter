"use client"

import { useState } from "react"

import { FIELD, FIELD_LABEL } from "@/components/field"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type SignupValues = { name: string; email: string; password: string }

/** Name, email and password for someone creating their own account from an invite. */
export function SignupForm({
  onSubmit,
  pending,
  error,
  label,
  pendingLabel,
}: {
  onSubmit: (values: SignupValues) => void
  pending: boolean
  error: string | null
  label: string
  pendingLabel: string
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({ name, email, password })
      }}
      className="space-y-4"
    >
      <div className={FIELD}>
        <label htmlFor="su-name" className={FIELD_LABEL}>
          Name
        </label>
        <Input
          id="su-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
      </div>
      <div className={FIELD}>
        <label htmlFor="su-email" className={FIELD_LABEL}>
          Email
        </label>
        <Input
          id="su-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
      </div>
      <div className={FIELD}>
        <label htmlFor="su-password" className={FIELD_LABEL}>
          Password
        </label>
        <Input
          id="su-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
      </div>
      {error ? <Notice tone="negative" title="Could not create account">{error}</Notice> : null}
      <Button
        type="submit"
        size="xl"
        className="w-full"
        disabled={name.trim().length < 2 || !emailValid || password.length < 8}
        pending={pending}
      >
        {pending ? pendingLabel : label}
      </Button>
    </form>
  )
}
