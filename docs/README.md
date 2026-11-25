#  Swastya — Smart Clinical Blood Coordination Network

> **Swastya** is a next-generation clinical blood logistics and emergency donor coordination platform. Built to bridge the critical gap between patients, voluntary donors, hospitals, and blood banks, Swastya eliminates emergency delays through intelligent multi-criteria matching, real-time in-app cross-organization communication, AI-driven shortage forecasting.

---

##  Table of Contents
- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [The Four Dedicated Portals](#-the-four-dedicated-portals)
- [System Architecture](#-system-architecture)
- [Technology Stack](#-technology-stack)
- [Database Architecture (Neon & Prisma)](#-database-architecture-neon--prisma)
- [Project Structure](#-project-structure)
- [Environment Variables](#-environment-variables)
- [Getting Started & Local Setup](#-getting-started--local-setup)
- [Automated Testing & Quality Assurance](#-automated-testing--quality-assurance)

---

##  Project Overview

Emergency blood requisition in healthcare systems frequently suffers from fragmented communication, opaque inventory levels, and manual phone coordination. **Swastya** modernizes this entire pipeline into a coordinated clinical network:

1. **Requesters & Patients** can post verified blood requisitions with medical prescription uploads.
2. **Voluntary Donors** receive instantaneous SMS match alerts with secure, zero-friction 1-click action links.
3. **Hospitals** can coordinate surgeries, reserve compatible units in advance, import and maintain voluntary donor rosters, and communicate directly with peer facilities.
4. **Blood Banks** manage individual blood units via an audit-proof ledger, forecast shortages using predictive models, and plan community blood drives with AI recommendations.

---

##  Key Features

### 1. Automated Multi-Criteria Donor Matching
- Evaluates blood group compatibility matrices (ABO & Rh factor), geographical proximity, donor eligibility cooldowns (90 days for whole blood), and active requisition status.
- Automatically queues and dispatches SMS alerts to eligible donors without notifying non-matching donors.

### 2. Dual-Channel Notification Engine & Outbox Pattern
- **Twilio SMS Outbox**: Database-persisted queue (`smsoutbox`) processed by a reliable background worker with exponential backoff and mock simulation toggle (`TWILIO_MOCK_MODE`).
- **HMAC Action Tokens**: SMS messages embed tamper-proof, time-limited action links (`/r/action/:token`), allowing donors to accept or decline requests instantly without logging in.
- **MSG91 OTP Authentication**: Direct phone authentication and OTP verification for donor account activation.

### 3. In-App Cross-Organization Peer Chat
- Real-time in-app communication between registered, approved medical organizations:
  - **Hospital $\leftrightarrow$ Hospital**: Direct peer coordination for patient transfers and emergency unit sharing.
  - **Blood Bank $\leftrightarrow$ Blood Bank**: Inter-facility inventory balancing and bulk logistics coordination.
  - **Hospital $\leftrightarrow$ Blood Bank**: Clinical requisition verification, crossmatch queries, and dispatch notices.
- Distinct unread message indicators, delivery timestamps, read receipts, and directory search.

### 4. Hospital Voluntary Donor Registry & 1-Click Login
- Hospitals can bulk-upload donor registries (CSV/Excel) with mobile numbers, blood groups, and city locations.
- Automatic phone normalization and duplicate prevention.
- Imported donors can activate and access their **Donor Portal** using seamless MSG91 mobile OTP verification without repetitive onboarding.

### 5. AI & Predictive Intelligence
- **AI Shortage Predictor**: 7-day, 14-day, and 30-day inventory burn-rate models forecasting critical stock depletion by component type (Whole Blood, PRBC, Platelets, FFP).
- **Smart Camp Planner**: Recommends optimal dates and high-footfall locations for community blood collection drives based on historical demographic response.
- **Surgery Blood Planner**: Clinical crossmatch calculation that automatically reserves units for planned operations to eliminate intraoperative shortages.

---

##  The Four Dedicated Portals

```
                         Swastya Clinical Ecosystem
  ┌───────────────────┬───────────────────┬───────────────────┬───────────────────┐
  │   Donor Portal    │ Requester Portal  │  Hospital Portal  │ Blood Bank Portal │
  ├───────────────────┼───────────────────┼───────────────────┼───────────────────┤
  │ • Emergency Feed  │ • Request Intake  │ • Requisitions    │ • Unit Ledger     │
  │ • 1-Click Action  │ • Prescription OCR│ • Surgery Planner │ • AI Shortage Pred│
  │ • Donation History│ • Real-time Status│ • Donor Registry  │ • Smart Camp Plan │
  │ • Camp Discovery  │ • Direct Support  │ • Cross-Org Chat  │ • Donor Broadcast │
  └───────────────────┴───────────────────┴───────────────────┴───────────────────┘
```

### 1. Donor Portal (`/donor/*`)
- **Live Match Alerts**: View nearby requests matching the donor's blood type.
- **Digital Donor Profile**: Track lifetime donation count, last donation date, and next eligible donation date counter.
- **Donation Camps**: Browse, filter, and RSVP for blood donation camps organized in the donor's district.

### 2. Requester / Patient Portal (`/requester/*`)
- **Emergency Requisitions**: Simple, accessible wizard to create critical or scheduled blood requests.
- **Prescription Upload & OCR**: Upload hospital admission or prescription slips with automated parsing.
- **Status Timeline**: Track fulfillment milestones from donor acceptance to blood unit dispatch.

### 3. Hospital Portal (`/hospital/*`)
- **Requisition Management**: Request specific blood components and volumes with priority tags (`NORMAL`, `URGENT`, `EMERGENCY`).
- **Surgery Planner**: Schedule upcoming operations and pre-reserve required blood units.
- **Donor Registry**: Upload voluntary hospital donor rosters, normalize contact numbers, and link accounts.
- **Clinical Chat**: Coordinate directly with partner hospitals and blood banks via the top-bar **Chat** center.

### 4. Blood Bank Portal (`/bloodbank/*`)
- **Unit Inventory**: Register newly collected bags, log fractionation, and record lab screening outcomes.
- **Predictive Analytics**: Review shortage forecasts and launch targeted blood donation drives using AI recommendations.
- **Community Camps & Custom SMS**: Schedule blood donation drives and broadcast urgent appeal alerts to registered donors.

---

##  System Architecture

Swastya is engineered as a modern, decoupled clinical monorepo with dedicated presentation, service orchestration, background processing, and persistence layers:

### 1. Presentation Layer (`apps/web`)
- **Next.js 15.2 (App Router) & React 19**: Server-side rendered and client-hydrated interfaces providing tailored workflows for all four participant roles:
  - **Donor Portal (`/donor`)**: Real-time emergency feed, 1-click commitment action handlers, profile metrics, and camp discovery.
  - **Requester Portal (`/requester`)**: Requisition wizards, prescription image uploads with OCR parsing, and fulfillment milestone trackers.
  - **Hospital Portal (`/hospital`)**: Clinical requisition lifecycle, surgery blood reservation planner, voluntary donor registry management, and cross-facility peer messaging.
  - **Blood Bank Portal (`/bloodbank`)**: Blood component fractionation, AI shortage forecasting, and camp planning.
- **In-App Peer Chat (`PeerChatManager`)**: Reusable real-time communication widget connecting hospitals and blood banks with instant unread indicators and directory search.

### 2. API & Gateway Layer (`backend`)
- **Express 4.21 & TypeScript 5**: Structured into cohesive, feature-based application modules located under `backend/src/app/` (`auth`, `donors`, `requesters`, `blood-requests`, `matching`, `hospitals`, `blood-banks`, `communication`, `system`).
- **Security & Authorization Middleware**:
  - `auth.middleware.ts`: Validates cryptographically signed JWT bearer tokens for session establishment.
  - `role.middleware.ts`: Enforces strict Role-Based Access Control (`DONOR`, `REQUESTER`, `HOSPITAL`, `BLOOD_BANK`, `ADMIN`) across all API routes.
  - Security baseline headers (helmet-equivalent) and bounded sliding-window rate limiters preventing abuse on authentication and upload endpoints.

### 3. Core Clinical Engines & Services
- **Automated Donor Matching Engine**: Evaluates clinical compatibility matrices (ABO & Rh factor), geographical proximity, and 90-day donor cooldowns. Dispatches urgent SMS alerts exclusively to matching candidates.
- **Predictive AI & Operational Planners**:
  - **Blood Shortage Predictor**: Computes 7-day, 14-day, and 30-day component burn-rates to proactively flag potential deficits.
  - **Smart Camp Planner**: Scores historical collection metrics to recommend optimal community blood drive dates and locations.
  - **Surgery Planner**: Automates surgical crossmatch requirements and reserves matching inventory prior to scheduled procedures.

### 4. Background Workers & Event Processing
- **Twilio SMS Outbox Worker (`outboxWorker.service.ts`)**: Implements the transactional outbox pattern by polling database-persisted queue entries (`smsoutbox`) with exponential retry backoff and local mock support (`TWILIO_MOCK_MODE`).
- **Emergency Scheduler Worker (`scheduler.service.ts`)**: Background scheduler ensuring pending emergency requests are escalated or fulfilled within clinical SLAs.
- **Camp Notification Worker (`campNotification.service.ts`)**: Automatically dispatches reminders to registered donors in advance of community donation drives.

### 5. Data & Persistence Layer
- **Neon Cloud PostgreSQL**: Serverless, high-availability PostgreSQL database operating over connection-pooled endpoints with strict SSL verification (`verify-full`).
- **Prisma 7.10 ORM**: Type-safe database client mapping 49 normalized relational models across identity, clinical requisitions, inventory ledgers, surgeries, and peer messages.

### 6. External Telephony & Authentication Gateways
- **Twilio Programmable Messaging**: Delivers time-sensitive SMS alerts containing HMAC-SHA256 signed 1-click action links (`/r/action/[token]`) for instant donor response.
- **MSG91 OTP Platform**: Powers seamless mobile number verification, allowing donors imported through hospital registries to activate and access their portal with one-time passwords.

---

##  Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Next.js 15.2.0 | React Framework with App Router, SSR, and dynamic layout routing |
| **UI & Styling** | React 19, Tailwind CSS v4 | Responsive, modern clinical design with custom color schemes |
| **Icons** | Lucide React | High-clarity iconography across navigation and alerts |
| **Backend** | Express 4.21, TypeScript 5 | Type-safe RESTful API services and route controllers |
| **Runtime** | Node.js (v20+), `tsx` | Ultra-fast TypeScript execution in development and production |
| **Database** | Neon Cloud PostgreSQL | Serverless cloud PostgreSQL instance with connection pooling |
| **ORM** | Prisma 7.10 | Type-safe database queries, migrations, and relationship handling |
| **SMS Gateway** | Twilio Messaging API | Transactional dispatch of urgent match notifications & action links |
| **OTP Auth** | MSG91 OTP Widget & API | Mobile number verification for donor registry activation |
| **Security** | JWT, bcryptjs, HMAC-SHA256 | Role-based authorization, hashed passwords, and signed action tokens |

---

##  Database Architecture (Neon & Prisma)

The database schema is defined in [backend/prisma/schema.prisma](file:///c:/Users/BHAVYA/OneDrive/Desktop/Swastya/backend/prisma/schema.prisma) and deployed to **Neon Cloud PostgreSQL**. It encompasses **49 normalized models** organized across operational boundaries:

```
├── Identity & Access
│   ├── users, donors, requesters, hospitals, bloodbanks
├── Clinical Requisitions
│   ├── bloodrequests, requeststatushistory, prescription, prescriptionhistory
│   └── requestdocuments, documentverifications, documentreviewaudit
├── Cold-Chain Inventory & Traceability
│   ├── inventory, inventoryunits, inventoryledger, unitscreeningrecords
│   ├── bloodreservations, reservationitems, clinicalcrossmatches, unitdispositionhistory
├── Surgeries & Operational Planning
│   ├── surgeryplans, surgeryplanstatushistory, procedurebloodconfigs
├── Community Camps & Drives
│   ├── donationcamps, campregistrations, campstatushistory, campaudithistory
├── Voluntary Donor Registry
│   ├── hospitaldonors, donoractivationtokens
├── Messaging & SMS Outbox
│   ├── smsoutbox, actiontokens, donoreligibilityresponses, notification
│   └── emergencybroadcasts, broadcastdeliveries, donornotificationpreferences
└── Peer & Cross-Organization Chat
    ├── hospitalmessages, bloodbankmessages, hospitalbloodbankmessages
```

---

##  Project Structure

```
Swastya/
├── apps/
│   └── web/                           # Next.js 15.2.0 Web Application (All 4 Portals)
│       ├── src/
│       │   ├── app/
│       │   │   ├── donor/             # Donor Portal routes
│       │   │   ├── requester/         # Requester / Patient Portal routes
│       │   │   ├── hospital/          # Hospital Portal (Surgeries, Donors, Chat)
│       │   │   ├── bloodbank/         # Blood Bank Portal (Inventory, Traceability, AI)
│       │   │   ├── r/action/[token]/  # 1-click SMS action landing handler
│       │   │   ├── signin/            # Universal authenticated login (Email & OTP)
│       │   │   └── signup/            # Multi-role account onboarding
│       │   ├── components/            # Portal UI components, navbars, and chat
│       │   └── lib/                   # API clients, session auth, MSG91 client
│       ├── public/                    # Static portal icons and logos
│       ├── next.config.ts             # Next.js build configuration
│       └── package.json
│
├── backend/                           # Express + TypeScript REST API
│   ├── prisma/
│   │   ├── schema.prisma              # Comprehensive Prisma schema (49 models)
│   │   └── migrations/                # Database migrations
│   ├── src/
│   │   ├── app/                       # Feature-based modular architecture
│   │   │   ├── auth/                  # Authentication, user routes, MSG91, donor import
│   │   │   ├── donors/                # Donor profiles, eligibility, and stats
│   │   │   ├── requesters/            # Patient requisitions and prescription flows
│   │   │   ├── blood-requests/        # Blood request lifecycle, documents, OCR
│   │   │   ├── matching/              # Automated multi-criteria emergency matching
│   │   │   ├── hospitals/             # Hospital operations, surgery planner, coordination
│   │   │   ├── blood-banks/           # Blood bank inventory, camps, AI forecasts
│   │   │   ├── communication/         # Peer chat, custom SMS, notifications, Twilio outbox
│   │   │   ├── system/                # Health checks, diagnostic routes
│   │   │   └── index.ts               # Core Express application entrypoint
│   │   ├── config/                    # Neon PostgreSQL client with connection pooling
│   │   ├── middleware/                # JWT verification and strict RBAC middleware
│   │   ├── utils/                     # Blood compatibility, distance, HMAC tokens, JWT
│   │   ├── server.ts                  # HTTP listener & background worker coordinator
│   │   ├── routes/                    # Backward-compatible modular route shims
│   │   └── services/                  # Backward-compatible modular service shims
│   ├── tests/                         # Integration, audit, and security test suites
│   └── package.json
│
├── packages/
│   ├── contracts/                     # Shared API type definitions & request/response contracts
│   │   ├── src/index.ts
│   │   └── package.json
│   └── shared/                        # Shared clinical constants (ABO matrices, blood group codes)
│       ├── src/index.ts
│       └── package.json
│
├── brand/                             # High-resolution logos and SVG brand assets
├── docs/                              # Project diagrams and architectural documentation
├── e2e/                               # End-to-end integration and frontend test suites
├── scripts/                           # Maintenance, database alignment, and verification scripts
├── package.json                       # Monorepo orchestration & concurrent dev runner
└── README.md                          # Comprehensive project documentation
```

---

##  Environment Variables

### Backend (`backend/.env`)
Create `backend/.env` using the template below:

```ini
# Neon PostgreSQL Connection (Pooled connection string)
DATABASE_URL="postgresql://USER:PASSWORD@HOST.aws.neon.tech/neondb?sslmode=verify-full"
DIRECT_URL="postgresql://USER:PASSWORD@HOST.aws.neon.tech/neondb?sslmode=verify-full"

# Application Server
PORT=5000
NODE_ENV=development
JWT_SECRET="your_strong_jwt_secret_key_here"
FRONTEND_URL="http://localhost:3000"

# MSG91 OTP Integration
MSG91_AUTH_KEY="your_msg91_auth_key_here"

# Twilio Programmable SMS Integration
TWILIO_ACCOUNT_SID="AC00000000000000000000000000000000"
TWILIO_AUTH_TOKEN="your_twilio_auth_token_here"
TWILIO_MESSAGING_SERVICE_SID="MG00000000000000000000000000000000"

# Set to 'true' for local simulation without consuming credits; 'false' for real SMS
TWILIO_MOCK_MODE=true
```

### Frontend Web (`apps/web/.env.local`)
Create `apps/web/.env.local` using the template below:

```ini
# Swastya Backend API Base URL
NEXT_PUBLIC_API_URL="http://localhost:5000"

# MSG91 Client-Side OTP Widget Configuration
NEXT_PUBLIC_MSG91_WIDGET_ID="your_msg91_widget_id_here"
NEXT_PUBLIC_MSG91_TOKEN_AUTH="your_msg91_token_auth_here"

# Disable Next.js tracing to prevent file-locking conflicts in synced folders
NEXT_TELEMETRY_DISABLED=1
```

---

##  Getting Started & Local Setup

### Prerequisites
- **Node.js**: `v20.x` or higher installed
- **npm** or **pnpm** installed
- **Git** installed

### 1. Clone the Repository
```bash
git clone https://github.com/bhavyasanthoshi02/Swastya.git
cd Swastya
```

### 2. Configure Environment Files & Prisma Client
- **Backend Environment**: Copy `backend/.env.example` to `backend/.env` and supply your Neon DB connection string and secrets.
- **Frontend Environment**: Copy `apps/web/.env.example` to `apps/web/.env.local`.
- **Generate Prisma Client**:
  ```bash
  cd backend && npx prisma generate && cd ..
  ```

### 3. Quick Start (Run Both Frontend & Backend Concurrently)
From the root repository directory:

```bash
# Install root dependencies
npm install

# Start both backend and web servers simultaneously
npm run dev
```

- **Backend API**: Running at `http://localhost:5000` (with active background workers)
- **Frontend Web Application**: Running at `http://localhost:3000`

### 4. Root Repository Scripts
From the main project directory, you can also run:

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts both backend (port 5000) and frontend (port 3000) concurrently with labeled logs |
| `npm run dev:backend` | Starts only the Express backend development server with hot-reload (`tsx watch`) |
| `npm run dev:web` | Starts only the Next.js frontend development server (`next dev`) |
| `npm run build` | Builds both the backend and frontend for production |
| `npm run build:backend` | Compiles the backend TypeScript into `dist/` |
| `npm run build:web` | Generates the Next.js production build for `apps/web` |
| `npm run tsc` | Runs TypeScript compilation verification across both backend and frontend |

---

##  Automated Testing & Quality Assurance

The codebase includes comprehensive integration, build, and type checks:

```bash
# 1. Verify backend type integrity (TypeScript)
cd backend
npx tsc --noEmit

# 2. Verify Prisma schema and regenerate client
npx prisma validate
npx prisma generate

# 3. Verify frontend web type integrity (TypeScript)
cd ../apps/web
npx tsc --noEmit

# 4. Verify frontend web production build (All 57 routes)
npm run build

# 5. Verify shared packages compilation
cd ../packages/contracts && npx tsc
cd ../shared && npx tsc

# 6. Verify end-to-end integration test suite types
cd ../..
node backend/node_modules/typescript/bin/tsc -p e2e/tsconfig.json --noEmit
```

> [!NOTE]
> The regression test scripts (`npm run test:aud07`, `test:aud08`, etc.) contain safety assertions that require a local test database named `swastya_test` (`assert(currentDb === "swastya_test")`) to prevent accidental data modifications on the live Neon Cloud PostgreSQL database (`neondb`).


---

##  Security & Compliance

- **Role-Based Authorization (RBAC)**: All sensitive routes are guarded by strict role middleware (`DONOR`, `REQUESTER`, `HOSPITAL`, `BLOOD_BANK`).
- **Encrypted Clinical Passwords**: Stored using industry-standard `bcryptjs` salts.
- **HMAC Action Link Tamper-Resistance**: Action tokens sent in donor SMS alerts are signed with cryptographic HMAC-SHA256, strictly bound to a single action (`ACCEPT`/`DECLINE`), and expire automatically.
- **Zero Credentials in Version Control**: Sensitive secrets, connection strings, and API keys are strictly excluded via root and nested `.gitignore` policies.

---

<p align="center">
  <b>Built with care for clinical excellence and life-saving blood coordination.</b>
</p>
