"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { CheckIcon, CopyIcon, SmartphoneIcon } from "lucide-react"

import { formatINR } from "@/lib/money"
import { upiPayLink } from "@/lib/upi"
import { cn } from "@/lib/utils"

/**
 * Pay someone over UPI. Phones get a button that opens their UPI app; larger screens get
 * a QR code of the same link to scan with a phone. Paying here records nothing: the user
 * still taps "I've paid" so the payee can approve.
 */
export function UpiPay({
  vpa,
  name,
  amountPaise,
  onOpened,
}: {
  vpa: string
  name: string
  amountPaise: number
  onOpened?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const firstName = name.split(" ")[0]
  const link = upiPayLink({ vpa, name, amountPaise })
  const valid = amountPaise > 0

  async function copy() {
    try {
      await navigator.clipboard.writeText(vpa)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  return (
    <section aria-label={`Pay ${firstName} with UPI`} className="rounded-[16px] bg-card p-4 ring-1 ring-border">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pay with UPI</p>
          <button type="button" onClick={copy} className="mt-0.5 flex max-w-full items-center gap-1.5 text-sm font-medium hover:text-primary">
            <span className="truncate">{vpa}</span>
            {copied ? <CheckIcon className="size-3.5 shrink-0 text-positive" /> : <CopyIcon className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="sr-only">{copied ? "Copied" : "Copy UPI ID"}</span>
          </button>
        </div>
      </div>

      {/* Phones: open the UPI app directly. */}
      <a
        href={valid ? link : undefined}
        aria-disabled={!valid}
        onClick={() => valid && onOpened?.()}
        className={cn(
          "gradient-primary mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[12px] text-base font-semibold shadow-sm md:hidden",
          !valid && "pointer-events-none opacity-50",
        )}
      >
        <SmartphoneIcon className="size-5" />
        Pay {valid ? formatINR(amountPaise) : ""} to {firstName}
      </a>

      {/* Larger screens: scan the same link with a phone. */}
      <div className="mt-3 hidden items-center gap-5 md:flex">
        <div className="rounded-[12px] bg-white p-2.5 ring-1 ring-border">
          {valid ? (
            <QRCodeSVG value={link} size={148} level="M" marginSize={0} title={`UPI QR code to pay ${firstName}`} />
          ) : (
            <div className="size-[148px]" />
          )}
        </div>
        <div className="text-sm">
          <p className="font-semibold">
            Scan to pay {valid ? formatINR(amountPaise) : ""} to {firstName}
          </p>
          <p className="mt-1 text-muted-foreground">Open GPay, PhonePe, Paytm or any UPI app on your phone and scan this code.</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">After paying, tap &ldquo;I&apos;ve paid&rdquo; so {firstName} can approve it.</p>
    </section>
  )
}
