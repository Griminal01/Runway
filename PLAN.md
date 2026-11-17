# Runway build plan

Goal: a budgeting app installed on the S24 Ultra home screen that opens offline and answers one question: **how much can I safely spend today?**

Each phase is one small PR. Tests pass before every commit (see CLAUDE.md).

---

## How it gets onto the phone

Runway is a PWA. The code is a static site; the phone downloads it once and installs it, then runs fully offline. Your figures live only in the phone's IndexedDB and never leave the device.

1. GitHub Actions builds the site on every merge to `main`.
2. The built files are served over HTTPS by a static host. This serves code only and receives no data.
3. On the phone: open the URL in Chrome, then **⋮ menu > Add to home screen > Install**.
4. Updates download in the background; the app shows "Update ready, tap to reload".

**Host:** GitHub Pages (repo made public; it holds code only, never figures). Served at `https://griminal01.github.io/Runway/`, so the build uses base path `/Runway/`.

---

## Phase 0: Scaffold

- Vite + React + TypeScript, strict mode.
- Vitest, oxlint (Vite's default linter), Prettier.
- `.gitignore` blocks `*.csv`, `*.ofx`, `*.qif`, `backup*.json`, `/data/`, so statements and backups cannot be committed by accident.
- Base styling: dark mode default, 384px-first layout, 48px minimum touch targets, system font.
- GitHub Actions: install, test, build on every PR.

**Done when:** an empty "Runway" screen builds, and CI runs green.

## Phase 1: Money core (`src/lib/money.ts`)

Pure functions only: no dates from the clock, no storage. "Today" is always passed in, so every rule is testable.

| Function                                            | Purpose                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `formatGBP(pence)`                                  | `123456` → `£1,234.56`, negatives as `-£12.30`                                         |
| `isWorkingDay(date, bankHolidays)`                  | Mon–Fri and not a bank holiday                                                         |
| `defaultPayday(year, month, bankHolidays)`          | Penultimate working day                                                                |
| `effectivePayday(year, month, holidays, overrides)` | Override wins over default                                                             |
| `nextPayday(today, ...)`                            | Rolls to next month on payday itself                                                   |
| `daysUntilPayday(today, payday)`                    | Counts today, not payday; minimum 1                                                    |
| `billsDueBeforePayday(bills, today, payday)`        | Unpaid bills due today up to the day before payday                                     |
| `foodFloorRemaining(...)`                           | Rest of current food week + full Food Floor for each later week starting before payday |
| `foodWeekStart(date)`                               | The Monday on or before the date                                                       |
| `safeToday(inputs)`                                 | The core formula, returns unfloored pence                                              |
| `colourState(safeToday, plannedDaily, foodBreach)`  | green / amber / red                                                                    |

Integer maths only. Division rounds **down** to the penny, so the app never overstates spendable money.

**Bank holidays:** bundled England & Wales list for 2026–2028 in `src/lib/bankHolidays.ts`, checked against gov.uk when added.

**Must-have tests:**

- Aug 2026: 31st is a bank holiday → payday Thu 27 Aug.
- Aug 2027: 30th is a bank holiday → payday Fri 27 Aug.
- Dec 2026: Christmas holidays fall early → payday Wed 30 Dec.
- Override replaces the default for that month only.
- Payday rolls over: the day before payday = 1 day; payday itself measures to next month.
- Food week straddling payday counts in full.
- Unspent food rolls into next week; overspend comes out of Safe today.
- Negative result displays as £0 and shows red.
- Rounding never rounds up.

**Done when:** all tests pass with no UI built yet.

## Phase 2: Data on the device (Dexie)

Tables:

- `settings`: buffer, weekly Food Floor, planned daily free spend.
- `balance`: manual balance entries (amount, timestamp). Latest one is used.
- `bills`: name, amount, day of month, active.
- `billPayments`: which bill was paid for which month.
- `pots`: name, top-up amount, due day of month.
- `foodSpends`: amount, date, optional note.
- `paydayOverrides`: month → date.
- `bankHolidayEdits`: dates added or removed by you.

Also:

- Call `navigator.storage.persist()` on first run, so Chrome doesn't clear data when storage is low.
- A schema version, so later changes migrate data instead of wiping it.

**Bill rule:** a bill counts as paid once its due date has passed or you tick it. This stops a bill being counted twice after it leaves your account.

## Phase 3: Today screen

The screen you open daily:

- **Safe today**, large, in its colour state.
- One plain line, e.g. "£18.40 a day until payday on Thu 27 Aug (9 days)".
- **Where your money is**, tap to expand: bills to come, food set aside, pots, buffer.
- Food this week: spent / floor, with any rollover.
- Two big buttons: **Update balance** and **Log food spend**.
- First-run setup (balance, Food Floor, buffer, usual daily spend), so the screen has data from day one.
- Logging a food spend also lowers the balance, so the spend isn't counted twice.

The copy is calm and factual. Red says "Nothing spare today, food and bills are covered", not a warning.

## Phase 4: Setup screens

Bottom navigation: **Today · Food · Bills & pots · Settings** (hash routes, so the back gesture works).

- Food: spends grouped by food week (last 6 weeks); log a spend for an earlier day; tap to delete.
- Bills & pots: add, edit, pause, delete; "Mark paid" / "Mark moved" for the next occurrence.
- Settings: edit Food Floor, buffer, usual daily spend; next 3 paydays with a per-month override; bank holidays for the next 12 months (later years tucked away), remove/restore/add.

## Phase 5: PWA and offline

- `vite-plugin-pwa`: manifest, icons (incl. maskable for Samsung), theme colour, standalone display.
- Precache everything; no runtime network requests at all.
- "Update ready" prompt instead of silent reloads.
- Test in Chrome DevTools offline mode, then on the phone in flight mode.

## Phase 6: Deploy and install

- `.github/workflows/deploy.yml`: on every merge to `main`, lint, test, build with `BASE_PATH=/Runway/`, and publish to GitHub Pages. A failing test stops the deploy.
- Live at **https://griminal01.github.io/Runway/**.
- Install on the S24 Ultra: open the link in Chrome, **⋮ > Add to home screen > Install**. Then turn on flight mode and open it from the home screen to confirm it works offline.
- Use it for a pay cycle and note anything that feels wrong.

## Phase 7: Backup

The phone is the only copy, so this matters.

- **Save a backup** (Settings): a `runway-backup-YYYY-MM-DD.json` file via the share sheet, so it can go to Google Drive, Files or email. Falls back to a download.
- **Restore** (Settings, and on the first-run screen for a new phone): strict checks on the file, a preview of what's in it, then replace everything in one go. A bad file changes nothing.
- **Reminder** on Today: a week after setup if there's never been a backup, then whenever the last one is 30+ days old.

---

## Phase 8: Extra income and bill end dates

- **Income** tab: log money in apart from pay (e.g. selling something) with an optional note. It's added to the balance straight away, so Safe today rises. Delete to take it back off.
- **Add income** button on Today.
- Bills and pots can have an **end date** (final payment). Counted up to and including it, then shown as ended.
- Database schema v2 (new income table); existing data upgrades in place. Backups include income; older backups still restore.

---

## Later, if wanted

- Import a bank CSV on the device, to log food spends faster. Parsed locally, never stored as a file.
- History: Safe today over the last pay cycles.
- Homescreen widget is not possible for a PWA; a quick-launch shortcut is.

## Not doing

- Bank connections (Open Banking): third-party calls, and against the no-backend rule.
- Push notifications: these need a server.
- Accounts, sync, analytics.
