# EmployeePortalIQ (TeamFlow)

Full-stack workforce operations, attendance tracking, recruitment pipeline, project/task management, daily reporting, and internal collaboration platform for **ElevateIQ**.

---

## 1. Project Overview

EmployeePortalIQ centralizes day-to-day company operations across engineering, operations, coordination, and HR teams in a unified Next.js + NestJS web application backed by PostgreSQL (Neon).

### Key Capabilities
- **Attendance & Time Tracking**: Daily check-in/out (timezone-aware `APP_TZ`), structured break tracking (`LUNCH`, `TEA`, `PERSONAL`, `OTHER`), live working/break timers, stale open-shift auto-close, organization/team attendance boards with **Role / Team / Intern Batch** combined filters, and **Daily / Monthly / Individual** exports in **Excel (`.xlsx`)** and **CSV (`.csv`)**.
- **Recruitment Pipeline**: Requirement intake with JD uploads, HR Manager assignment, HR Support candidate sourcing/CSV validation, interview feedback & status tracking, leave visibility, and login activity monitoring.
- **Tasks, Projects, Tickets & Goals**: Kanban and list views, task review workflows, project tracking, issue/escalation ticketing, and weekly/monthly/custom goals.
- **Daily Reports & Shift Compliance**: End-of-day submission editor, submission streak tracking, automated reminders before shift end/deadline, and soft logout gating until today's report is submitted (when active on a working day).
- **Workplace Collaboration**: Real-time messaging (`Socket.IO`) across company, team, batch, group, and DM channels, announcements, meetings with recurrence/notes, leave workflows, and calendar views.
- **Security & Account Self-Service**: Argon2id password hashing, short-lived JWT access tokens (`15m`) + rotating refresh tokens (`30d`) stored in `HttpOnly` `SameSite=Lax` cookies, active session management, global **Change Password** across every role's Settings page, and enforced first-login password rotation (`/change-password`).

### Supported User Roles
Defined in Prisma enum `Role` (`api/prisma/schema.prisma`):
- `ADMIN`
- `HR_MANAGER`
- `HR_SUPPORT`
- `TEAM_LEAD`
- `COORDINATOR`
- `EMPLOYEE`

---

## 2. Technology Stack

### Frontend (Root `/`)
| Technology | Version / Package | Purpose |
|---|---|---|
| **Next.js** | `14.2.35` (`next`) | App Router frontend, standalone output, API & WebSocket dev proxy |
| **React / React DOM** | `18.3.1` (`react`, `react-dom`) | Component UI |
| **TypeScript** | `^5.4.0` (`typescript`) | Static typing (`strict` check via `npm run lint`) |
| **Tailwind CSS** | `^3.4.7` (`tailwindcss`, `postcss`, `autoprefixer`) | Styling & responsive layout |
| **Socket.IO Client** | `^4.8.4` (`socket.io-client`) | Realtime chat & live notification updates |

### Backend (`/api`)
| Technology | Version / Package | Purpose |
|---|---|---|
| **NestJS** | `^11.0.0` (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`) | Modular REST API (`api/` global prefix) |
| **NestJS JWT & Throttler** | `@nestjs/jwt ^11.0.0`, `@nestjs/throttler ^6.2.0` | Authentication guards & per-user rate limiting |
| **WebSockets** | `@nestjs/websockets ^11.2.7`, `@nestjs/platform-socket.io ^11.2.7`, `socket.io ^4.8.4` | Realtime gateway (`/socket.io`) |
| **Prisma ORM** | `6.4.1` (`prisma`, `@prisma/client`) | PostgreSQL schema, client & SQL migrations |
| **PostgreSQL** | Neon PostgreSQL (PostgreSQL 16 compatible) | Primary relational data store |
| **Argon2** | `^0.41.1` (`argon2`) | Password hashing & verification |
| **Validation & Security** | `class-validator`, `class-transformer`, `helmet ^8.0.0`, `cookie-parser ^1.4.6` | Strict DTO whitelist validation, security headers, cookies |
| **Documents & Email** | `pdfkit ^0.15.0`, `nodemailer ^10.4.0` | PDF generation, optional SMTP notifications |
| **Testing** | `jest ^29.7.0`, `ts-jest ^29.1.2`, `supertest ^7.0.0` | Unit & HTTP spec suite |

---

## 3. Project Structure

```text
EmployeePortalIQ/
├── app/                         # Next.js App Router pages
│   ├── attendance/              # Attendance page (Check-in, Live board, History, Reports export)
│   ├── change-password/         # Enforced temporary-password change flow
│   ├── dashboard/               # Core dashboard (Admin, Team Lead, Coordinator, Employee)
│   ├── hr-manager/              # HR Manager routes (dashboard, attendance, requirements, candidates, reports, leaves, login-activity, settings)
│   ├── hr-support/              # HR Support routes (dashboard, requirements, submissions, history, settings)
│   ├── login/                   # Sign-in & forgot-password request flow
│   ├── settings/                # Workspace, Notifications, Company Policy (Admin), Sessions & Change Password
│   ├── projects/, tasks/, tickets/, goals/, leaves/, calendar/, reports/
│   ├── channels/, announcements/, teams/, users/, audit/, profile/
│   └── layout.tsx, globals.css, page.tsx
├── components/                  # Shared client components
│   ├── ChangePasswordCard.tsx   # Reusable Change Password card (used in all role settings pages)
│   ├── Shell.tsx                # Role-aware sidebar, header, command palette & attendance chip
│   ├── AttendanceChip.tsx, AttendanceGlance.tsx, AttendanceProvider.tsx, BreakPicker.tsx
│   ├── CommandPalette.tsx, NotifBell.tsx, ReportShiftReminder.tsx, Workplace.tsx, ui.tsx
├── lib/                         # API client, auth context, realtime & formatting helpers
│   ├── api.ts, auth-context.tsx, attendance.ts, files.ts, realtime.ts
├── public/                      # Static assets (branding logos, manifest, service worker)
├── middleware.ts                # Edge cookie check for UX redirects (API enforces real RBAC)
├── next.config.js               # Proxies /backend/* -> ${BACKEND_URL}/api/* & /socket.io
├── .env.example                 # Frontend environment variable template
├── package.json                 # Root frontend scripts & dependencies
└── api/                         # NestJS backend workspace
    ├── prisma/
    │   ├── schema.prisma        # Database models & Role enum
    │   ├── migrations/          # 15 versioned PostgreSQL SQL migrations
    │   └── verify-stage2.mjs    # Schema verification script
    ├── src/
    │   ├── main.ts              # Bootstraps NestJS (:4001), Helmet, CORS, Origin CSRF check, /api prefix
    │   ├── app.module.ts        # Registers global JWT, Throttler & Roles guards + 19 modules
    │   ├── common/              # Guards, decorators, filters, timezone helpers, XLSX writer, mail service
    │   ├── prisma/              # PrismaService lifecycle wrapper
    │   ├── modules/             # admin, attendance, audit, auth, batches, comms, files, goals, health,
    │   │                        # insights, jobs, projects, recruitment, reports, tasks, teams, tickets, users, workplace
    │   └── seed.ts              # Optional seed script for initial bootstrap environments
    ├── jest.config.js           # Jest / ts-jest configuration
    └── package.json             # Backend scripts & dependencies
```

---

## 4. Prerequisites

- **Node.js**: `v20+` required by toolchain types (verified locally on **Node.js `v24.21.0`**)
- **npm**: `v10+` (verified locally on **npm `11.19.0`**)
- **Git**: Any recent version
- **PostgreSQL Database**: Authorized **Neon PostgreSQL** connection string (recommended/active team setup) or PostgreSQL 16+ instance
- **VS Code** *(optional)* with TypeScript & Prisma extensions

---

## 5. Clone Repository

```powershell
git clone https://github.com/Sindhoori14/EmployeePortalIQ.git
cd EmployeePortalIQ
```

After cloning, confirm you are on the target working branch (for example `git status` / `git branch`) before installing packages or starting servers.

---

## 6. Environment Configuration

Each developer must obtain authorized environment credentials from the project maintainer. **Never commit `.env`, `.env.local`, or `api/.env` files.**

### Frontend Environment (`.env.local` in repository root)

Copy `.env.example` to `.env.local` (or create `.env.local`):

```powershell
Copy-Item .env.example .env.local
```

Placeholder example:

```dotenv
# Server-side proxy target used by next.config.js (do NOT prefix with NEXT_PUBLIC_)
BACKEND_URL=http://localhost:4001
```

**How frontend–backend connectivity works:**
- Next.js rewrites `/backend/:path*` to `${BACKEND_URL}/api/:path*` and `/socket.io/*` to `${BACKEND_URL}/socket.io/*`.
- Keeping API traffic same-origin through `/backend/*` keeps `HttpOnly` auth cookies first-party and avoids browser CORS issues in development.

### Backend Environment (`api/.env` inside `api/`)

Note: `api/.env.example` is not currently tracked in the repository; create `api/.env` with values provided by your team lead.

Safe placeholder template:

```dotenv
# Required: Authorized Neon PostgreSQL or PostgreSQL 16 connection string
DATABASE_URL="postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME?sslmode=require"

# Required: Minimum 32 random characters; startup fails fast if shorter or contains "CHANGE_ME"
JWT_ACCESS_SECRET="replace-with-a-cryptographically-random-string-at-least-32-chars"

# Required in dev so backend port matches frontend BACKEND_URL (code falls back to 4000 if unset)
API_PORT=4001

# Allowed frontend origins (comma-separated, used for CORS + Origin CSRF check)
CORS_ORIGIN=http://localhost:3000

# Application timezone & daily report deadline defaults
APP_TZ=Asia/Kolkata
REPORT_DEADLINE=18:30

# Optional environment overrides
NODE_ENV=development
# UPLOAD_DIR=./uploads
# MAX_UPLOAD_MB=10
# JOBS_ENABLED=true
# AUDIT_RETENTION_DAYS=365

# Optional SMTP delivery (disabled automatically unless SMTP_HOST is configured)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=mailer@example.com
# SMTP_PASS=your-smtp-password
# SMTP_FROM=portal@example.com
# APP_URL=http://localhost:3000
```

> **Important:**
> - `JWT_ACCESS_SECRET` is strictly checked in `api/src/main.ts` on startup (must be >= 32 characters and must not contain `CHANGE_ME`).
> - If `API_PORT` is changed, update `BACKEND_URL` in `.env.local` and `CORS_ORIGIN` accordingly.

---

## 7. Dependency Installation

Install dependencies separately for the frontend root and the `api/` backend.

### Frontend Dependencies
From repository root (`EmployeePortalIQ/`):

```powershell
npm install
```

### Backend Dependencies
From `api/`:

```powershell
cd api
npm install
```

> Note: Keep existing `package-lock.json` and `api/package-lock.json` intact when installing so dependency versions remain aligned across teammates.

---

## 8. Prisma and Database Setup

- **Schema file:** `api/prisma/schema.prisma`
- **Migrations folder:** `api/prisma/migrations/` (currently 15 SQL migrations)

Inside the `api/` directory of the repository:

1. **Generate the Prisma Client** (required after cloning, pulling schema changes, or switching branches):
   ```powershell
   npx prisma generate
   ```
2. **Validate the schema** *(optional check)*:
   ```powershell
   npm run db:validate
   ```
3. **Inspect migration status** against the configured `DATABASE_URL` without changing data:
   ```powershell
   npx prisma migrate status
   ```
4. **Apply approved pending migrations** *(only after verifying you are pointing at an authorized database)*:
   ```powershell
   npx prisma migrate deploy
   ```
   *(For a brand-new isolated development database only, `npm run db:migrate` runs `prisma migrate dev` and `npm run seed` seeds initial admin data if configured via `ADMIN_EMAIL` / `ADMIN_PASSWORD`.)*

### Database Safety Rules (Read Before Running Prisma Commands)
- **NEVER run `npx prisma migrate reset`** against shared Neon or production databases — it drops and recreates the entire database.
- **NEVER run `npx prisma db push`** against the shared Neon database without explicit team approval — it bypasses migration history.
- **Confirm the target database** (`api/.env` `DATABASE_URL`) before running any schema, seed, or SQL command.
- **Never modify or delete production attendance, user, or recruitment records** casually during local testing.

---

## 9. Running the Application

Run the backend and frontend in two separate PowerShell terminals.

### Terminal 1 – Backend (`:4001`)

```powershell
cd path\to\EmployeePortalIQ\api
npm install
npx prisma generate
npm run start:dev
```

- `npm install`: Ensures all NestJS, Prisma, and runtime packages are installed.
- `npx prisma generate`: Generates the TypeScript Prisma Client matching `api/prisma/schema.prisma` (Windows & native targets).
- `npm run start:dev`: Starts NestJS in watch mode (`nest start --watch`) on `API_PORT` (configured to `4001`), mounting all endpoints under `/api`.

### Terminal 2 – Frontend (`:3000`)

```powershell
cd path\to\EmployeePortalIQ
npm install
npm run dev
```

- `npm install`: Ensures Next.js, React, Tailwind CSS, and Socket.IO client packages are installed.
- `npm run dev`: Starts Next.js development server (`next dev -p 3000`) and enables `/backend/*` + `/socket.io` proxying to `BACKEND_URL`.

---

## 10. Application URLs

Once both terminals are running:

| Endpoint | URL | Description |
|---|---|---|
| **Frontend App** | `http://localhost:3000` | Redirects to `/dashboard` or `/login` based on session state |
| **Backend API Base** | `http://localhost:4001` | Direct NestJS listener (`API_PORT=4001`) |
| **Backend Health Check** | `http://localhost:4001/api/healthz` | Verifies API uptime & PostgreSQL `SELECT 1` (`{"status":"ok","db":"up",...}`) |
| **Proxied Health Check** | `http://localhost:3000/backend/healthz` | Verifies Next.js rewrite proxy -> NestJS -> PostgreSQL end-to-end |

---

## 11. Modules and Role Dashboards

Post-login landing routes (`lib/auth-context.tsx`):
- `HR_MANAGER` -> `/hr-manager/dashboard`
- `HR_SUPPORT` -> `/hr-support/dashboard`
- `ADMIN`, `TEAM_LEAD`, `COORDINATOR`, `EMPLOYEE` -> `/dashboard`
- Any role with `mustChangePassword = true` -> `/change-password`

### Role Capabilities Matrix

| Role | Primary Workspace Routes | Key Modules & Permissions |
|---|---|---|
| **Admin** (`ADMIN`) | `/dashboard`, `/attendance`, `/users`, `/teams`, `/projects`, `/tasks`, `/tickets`, `/goals`, `/reports`, `/leaves`, `/calendar`, `/channels`, `/announcements`, `/audit`, `/settings` | Full org access: manage people & roles (all 6 roles + CSV bulk import), company settings & shifts, live Attendance board & Daily/Monthly/Person exports with **Role + Team + Intern Batch** filters, Attendance adjustment audit, full task/project/ticket/report visibility, audit logs (`/admin/audit`), Change Password & active sessions in `/settings`. |
| **HR Manager** (`HR_MANAGER`) | `/hr-manager/dashboard`, `/hr-manager/attendance`, `/attendance`, `/hr-manager/requirements`, `/hr-manager/candidates`, `/hr-manager/reports`, `/hr-manager/leaves`, `/hr-manager/login-activity`, `/channels`, `/profile`, `/hr-manager/settings` | Own check-in/out & breaks (`/attendance`, sidebar chip, dashboard check-in prompt), org-wide attendance visibility & filters (Role, Team, Batch, Date) + Daily/Monthly `.xlsx`/`.csv` exports + full **Download reports** (`/attendance?tab=export`), recruitment requirements & candidate pipeline management, leave decisions, login activity, Change Password & active sessions in `/hr-manager/settings`. |
| **HR Support** (`HR_SUPPORT`) | `/hr-support/dashboard`, `/hr-support/requirements`, `/hr-support/submissions`, `/hr-support/history`, `/attendance`, `/channels`, `/reports`, `/profile`, `/hr-support/settings` | Assigned recruitment requirements, candidate CSV validation & submissions, submission history, personal check-in/out/breaks (`/attendance`, dashboard check-in prompt & sidebar chip), individual Excel/CSV attendance export, daily reports, Change Password & active sessions in `/hr-support/settings`. |
| **Team Lead** (`TEAM_LEAD`) | `/dashboard`, `/attendance`, `/teams`, `/users`, `/projects`, `/tasks`, `/tickets`, `/goals`, `/reports`, `/leaves`, `/calendar`, `/channels`, `/announcements`, `/settings` | Team-scoped management: live Attendance board & Daily/Monthly/Individual exports locked to their own team (supports Role & Batch filters within team) + manual attendance adjustments, team task/review/project/report/leave oversight, Change Password & active sessions in `/settings`. |
| **Coordinator** (`COORDINATOR`) | `/dashboard`, `/attendance`, `/teams`, `/projects`, `/tasks`, `/tickets`, `/goals`, `/reports`, `/leaves`, `/calendar`, `/channels`, `/announcements`, `/settings` | Team-scoped attendance board & Daily/Monthly/Individual exports (read-only on team records; supports Role & Batch filters within team), batches/assessments coordination, tasks/projects/tickets/reports, Change Password & active sessions in `/settings`. |
| **Employee** (`EMPLOYEE`) | `/dashboard`, `/attendance`, `/tasks`, `/projects`, `/tickets`, `/goals`, `/reports`, `/leaves`, `/calendar`, `/channels`, `/announcements`, `/settings` | Self check-in/out, breaks & live shift timers (`/attendance` + sidebar chip), individual date-range attendance history & Excel/CSV export, assigned tasks, projects, tickets, daily reports, leave requests, channels, Change Password & active sessions in `/settings`. |

---

## 12. Testing and Build

All commands below match the actual scripts defined in `package.json` and `api/package.json`.

### Frontend Checks (from repository root)
```powershell
# TypeScript typecheck (script runs: tsc --noEmit)
npm run lint

# Production build (stop the dev server on :3000 first so .next is not locked on Windows)
npm run build
```

### Backend Checks (from `api/`)
```powershell
# TypeScript typecheck (script runs: tsc --noEmit)
npm run lint

# NestJS production build (script runs: nest build -> dist/)
npm run build

# Run Jest unit & HTTP integration spec suite (7 suites in api/src/**/*.spec.ts)
npm test

# Validate Prisma schema syntax
npm run db:validate
```

> **Note on `npm run test:e2e`:** `api/package.json` defines `"test:e2e": "jest --config test/jest-e2e.json --runInBand"`, however `api/test/` is not present in the current repository. Use `npm test` to run all Jest unit and HTTP module specs (`src/**/*.spec.ts`).

---

## 13. Troubleshooting

- **Port `3000` or `4001` already in use (Windows):**
  ```powershell
  Get-NetTCPConnection -LocalPort 3000,4001 -State Listen | Select-Object LocalPort,OwningProcess
  # Stop only the conflicting PID if safe:
  Stop-Process -Id <PID> -Force
  ```
- **Next.js `.next` cache conflicts or stale UI after pulling changes:**
  Stop the running frontend dev server (`Ctrl+C`) before deleting `.next` or running `npm run build`:
  ```powershell
  Remove-Item -Recurse -Force .next
  npm run build
  ```
- **Backend fails immediately on boot with `JWT_ACCESS_SECRET` error:**
  Check `api/.env` and ensure `JWT_ACCESS_SECRET` is present, at least 32 characters long, and does not contain `CHANGE_ME`.
- **Prisma Client missing / `EPERM` file lock during `npx prisma generate` on Windows:**
  Stop any running NestJS backend (`:4001`) holding `.prisma\client\query_engine-windows.dll.node`, then re-run:
  ```powershell
  cd api
  npx prisma generate
  ```
- **Neon PostgreSQL connection or timeout errors:**
  Verify `DATABASE_URL` in `api/.env` includes `?sslmode=require`, verify internet/VPN access, and allow a few seconds for Neon serverless compute wake-up on the first query (`/api/healthz`).
- **Frontend shows network errors or `401` across all routes:**
  Confirm the backend is healthy at `http://localhost:4001/api/healthz` AND `.env.local` has `BACKEND_URL=http://localhost:4001`. Always access the app consistently via `http://localhost:3000` (not mixing `127.0.0.1` and `localhost` cookies).
- **Missing dependencies or `npm install` issues:**
  Run `npm install` inside both the repository root and `api/` after pulling updates.
- **Git merge conflicts:**
  Inspect affected files (`git status`), resolve conflicts cleanly, then run `npx prisma generate`, `npm run lint`, `npm test` (in `api/`), and `npm run lint` (in root).

---

## 14. Security Guidelines

1. **Protect Environment Files & Secrets:** Never commit `.env`, `.env.local`, or `api/.env`, and never paste Neon connection strings, passwords, or JWT secrets into code, logs, issues, or documentation.
2. **Password Security:** Passwords require at least **8 characters with at least one letter and one number**, are hashed with **Argon2**, cannot be reused on Change Password, and require verification of the current password before rotation.
3. **Token & Session Hygiene:** Changing a password updates the user's password hash, clears `mustChangePassword`, revokes all prior refresh tokens in the database, and logs a `PASSWORD_CHANGE` audit event.
4. **Origin CSRF & Cookie Auth:** Access (`15m`) and Refresh (`30d`) tokens are stored in `HttpOnly`, `SameSite=Lax` cookies (`Secure` when `NODE_ENV=production`), and all state-mutating requests verify the `Origin` header against `CORS_ORIGIN`.
5. **Strict RBAC & Team Scoping:** Every protected route validates JWT authentication and role/team authorization on the server; client UI restrictions never substitute for backend guards.
6. **Database Discipline:** Always verify the database target before any Prisma command and never run destructive resets/pushes against shared or production databases.
