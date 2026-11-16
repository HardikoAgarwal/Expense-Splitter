export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AppError"
  }
}

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof AppError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
