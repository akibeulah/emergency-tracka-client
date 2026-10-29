# Emergency Tracka — facility client

Web console for a verified facility's administrators (React + Vite + TypeScript, port **5176**):
facility profile, bed configuration, staff and permissions, duty roster, care packages and blood
inventory, plus the "Claim your facility" onboarding flow for accounts that do not have a code yet.
Mockups: `../Mockups/web/facility-admin/`. Requirements: `../docs/emergency-tracka-prd.md`.

Each page is unlocked by a permission (`facility.manage`, `beds.configure`, `staff.manage`,
`roster.manage`, `pricing.manage`, `blood.manage`). The server enforces the same rules.

## Run

```bash
npm install
npm run dev        # http://localhost:5176 (strict port: the server's CORS list names it)
npm run typecheck
npm run build
```

## Live or mock

Build flags are read from `.env.local` (gitignored; see `.env.example`). Restart `npm run dev`
after changing them.

| Variable | |
|---|---|
| `VITE_API_MODE` | `live` talks to `server/`. `mock` (default) runs in the browser on example data, with a "Mock mode" pill and example sign-ins on the login page |
| `VITE_API_URL` | API root, default `http://localhost:3000/api` |
| `VITE_MOCK_MODULES` | Live only: modules to answer from the mock instead, e.g. `pricing`. Those pages carry an "Example data" banner |
| `VITE_FEATURE_BLOOD` | `true` shows Blood Inventory. Keep `false` while the server's `FEATURE_BLOOD` is off |

### Live mode against the local server

1. Start `server/` (see its README) with `OTP_DEV_ECHO=true` and `http://localhost:5176` in
   `CORS_ORIGINS`. The server reads `CORS_ORIGINS` at start-up, so restart it after editing `.env`.
2. `.env.local`: `VITE_API_MODE=live`, `VITE_API_URL=http://localhost:3000/api`, `VITE_FEATURE_BLOOD=false`.
3. Sign in with facility code `0001` (to `0004`) and `admin.0001@demo.emergencytracka.test`.
   No SMS is sent locally: with `OTP_DEV_ECHO` the code is in the server log, and the browser
   console prints it (`[dev] sign-in code …`).

All seeded facilities, people and numbers are fictional demo data.

## Server routes used (live)

`src/api/live.ts` maps each method onto these and converts the server's documents to `src/api/types.ts`.

| Console | Route |
|---|---|
| Sign in | `POST /auth/otp/request`, `POST /auth/otp/verify`, then `GET /auth/accounts` and `GET /facilities/me` to fill the account header |
| Token refresh / sign out | `POST /auth/refresh`, `POST /auth/logout` |
| Claim: search | `GET /facilities/registry?q=` (3+ characters; unclaimed rows only) |
| Claim: submit | `POST /facilities/:id/claim` `{ legalName, licenceNumber, contactEmail, contactPhone, location? }` |
| Facility Profile | `GET /facilities/me`, `PATCH /facilities/me/profile` `{ departments, specialists, oxygenSource?, dutyPhone?, location? }` |
| Bed Configuration | `GET /capacity/beds`, `PUT /capacity/beds/:name` `{ maxSpaces, limitedThreshold }` (only changed rows) |
| Staff & Permissions | `GET /staff`, `POST /staff`, `PATCH /staff/:id/permissions`, `PATCH /staff/:id/status` |
| Duty Roster | `GET /staff` (people), `GET /rosters/current`, `PUT /rosters/current` `{ entries }` |
| Blood Inventory | `GET /blood/stock`, `PUT /blood/stock` (404 while the server flag is off) |

Phone numbers are sent in E.164 (`+234…`); a local `080…` number is converted.

## Not available live yet

The console says so on the page rather than showing example data:

- **Care packages**: the server has the schema but no routes. The page says it is not on the server yet.
- **Blood inventory**: turned off for v1 (`VITE_FEATURE_BLOOD=false`, server `FEATURE_BLOOD=false`).
- **Account switching**: the server has no switch; each account needs its own code. Choosing another
  account signs out and opens the sign-in page with its facility code and email filled in.
- **Claim documents**: the server does not take uploads yet. The form sends the details and says the
  onboarding team will ask for the licence and staff ID. Claimant name and role are not stored.
- **"Your claims"**: no route lists a person's claims, so the list does not appear.
- **Profile**: address, oxygen reserve hours and blood-bank designation are read-only (not saved by
  `PATCH /facilities/me/profile`). The duty phone cannot be cleared.
- **Beds**: a configured category cannot be turned off (the server needs at least 1 space). Categories
  the server has not configured show as "not offered" (0).
- **Roster**: only the current week (the server stores `rosters/current` only). The roster page lists
  staff from `GET /staff`, which needs `staff.manage`; a Matron with only `roster.manage` gets a 403.
