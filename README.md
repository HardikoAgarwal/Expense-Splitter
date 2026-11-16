# Hissa

A mobile-first expense ledger for roommates. Add a bill, split it equally or by exact amounts, and see who pays whom. Settlements stay pending until the person receiving the money approves them.

Money is stored as integer paise (₹1 = 100). Equal splits give leftover paise to the first member ids, in sorted order, so rounding is stable.

## Demo mode

If Supabase env vars are missing, the app runs against a local JSON ledger in `.data/`. Two roommates are already in **Flat 4B**:

| Name | Email | Password |
| --- | --- | --- |
| Aarav Mehta | aarav@hissa.app | demo1234 |
| Meera Shah | meera@hissa.app | demo1234 |

Aarav is the admin. There is no public sign-up: he creates every other account from People. Sign out and sign in as Meera to approve a payment. Group invite codes `FLAT4B7K` and `TRIP9K2M` work only after someone already has an account.

```bash
npm install
npm run dev
```

Open http://localhost:3847.

## Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Turn off public sign-up. In the dashboard open Authentication → Sign In / Providers → Email and disable “Allow new users to sign up”. The same switch is `enable_signup = false` in `supabase/config.toml` for a local Supabase stack. `supabase db push` does not change this Auth setting.
3. You can leave email confirmation off so an invited person can sign in with the temporary password immediately. The seed script confirms its own users either way.
4. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link the project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

`supabase db push` applies `supabase/migrations`. That migration creates profiles, groups, invites, expenses, shares, and settlements, with row level security so members only read their own groups. Writes go through security-definer functions: joining an invite, saving an expense (shares must sum to the total), and approving a settlement. Approved settlements lock expenses dated on or before `up_to_date`.

Balances and the simplified “who pays whom” list are SQL functions (`group_balances`, `simplified_debts`). Net for a person is:

`paid − owed shares + approved settlements they paid − approved settlements they received`

Positive means the group owes them.

## Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAIL=you@example.com
```

Placeholder URL and anon key keep demo mode on. The service role key is read only on the server: the seed script and the admin actions that create, disable, or remove accounts. Do not expose it as a `NEXT_PUBLIC_` variable.

`ADMIN_EMAIL` is the first admin. After `npm run seed`, or by hand:

```sql
update public.profiles
set is_admin = true, invited = true
where lower(email) = lower('you@example.com');
```

People who are not invited, or whose account is disabled, cannot sign in. Anyone with an account can create a group and becomes that group's admin. Group invite links only add someone who already has an account.

`NEXT_PUBLIC_APP_URL` is the address put into the messages an admin copies or shares. Use your Vercel URL in production.

## Seed two demo users

With the env vars set and the migration applied:

```bash
npm run seed
```

This creates Aarav and Meera, Flat 4B with the sample bills, one approved October settlement, one pending payment, and an empty Monsoon trip group. It marks `ADMIN_EMAIL` as admin (Aarav, if you leave the variable unset) and invites both demo accounts. If `ADMIN_EMAIL` is someone else, the script creates that account and prints a temporary password once. Re-running deletes groups those users created and writes the sample again.

## Scripts

```bash
npm run dev     # http://localhost:3847
npm run test    # split and debt-simplification tests
npm run lint
npm run build
```

## Deploy on Vercel

1. Push the repository and import it on [Vercel](https://vercel.com). The free tier is enough.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the project settings. Do not add the service role key unless you run the seed from your own machine.
3. In Supabase → Authentication → URL configuration, add your Vercel URL to Site URL and Redirect URLs (include `/reset-password` for password recovery).
4. Deploy. `npm run build` is the production build.

The app is a PWA: `app/manifest.ts`, icons in `public/icons`, and a network-only service worker registered in production so the ledger is never cached on a shared phone.
