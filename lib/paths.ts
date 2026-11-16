export function safeNext(value: string | undefined | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/groups"
  }
  return value
}
