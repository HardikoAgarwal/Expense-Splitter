export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="10" fill="#1F6B4A" />
      <path d="M8 16.5h16" stroke="#F7F4EE" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12.5" cy="16.5" r="4.2" fill="none" stroke="#F7F4EE" strokeWidth="1.8" />
      <circle cx="19.5" cy="16.5" r="4.2" fill="none" stroke="#F7F4EE" strokeWidth="1.8" />
    </svg>
  )
}
