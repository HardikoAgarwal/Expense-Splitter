import { redirect } from "next/navigation"

/** User management now lives in the Manage users tab on the account page. */
export default function AdminPage() {
  redirect("/account?tab=users")
}
