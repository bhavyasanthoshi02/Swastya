# Swastya — Blood Coordination Platform

Swastya is a centralized blood coordination platform that connects blood donors, requesters, hospitals, and blood banks. It helps users find relevant blood-related contacts, submit blood requests, receive notifications, and coordinate with other organizations.

The goal of Swastya is to make blood request coordination more organized by reducing the effort involved in finding the right donor or blood bank.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Problem Statement](#problem-statement)
- [Proposed Solution](#proposed-solution)
- [Key Features](#key-features)
- [User Portals](#user-portals)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Database Architecture](#database-architecture)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Available Commands](#available-commands)
- [Testing and Verification](#testing-and-verification)
- [Future Scope](#future-scope)

---

## Project Overview

Blood requirements can arise unexpectedly, and finding the right donor or blood bank may involve contacting several people or organizations.

In many cases, blood-related information is shared through phone calls, WhatsApp groups, and separate organizational records. This can make it difficult to identify the right contact, confirm availability, and coordinate urgent requirements.

Swastya brings these activities together through a single platform.

It provides dedicated portals for donors, requesters, hospitals, and blood banks, allowing each user to access features relevant to their role.

---

## Problem Statement

During urgent blood requirements, patients and hospitals may struggle to find and contact the right blood donors or blood banks.

Information about donors, blood availability, and contact details is often scattered across different communication channels and organizational records.

As a result, users may face difficulties such as:

- Finding donors with the required blood group.
- Identifying the appropriate blood bank to contact.
- Confirming blood availability.
- Sharing urgent blood requirements with relevant people.
- Coordinating between hospitals and blood banks.
- Receiving timely updates about blood requests.

The main problem is not only the availability of blood, but also the difficulty of finding the right contact and coordinating the requirement efficiently.

---

## Proposed Solution

Swastya is designed to provide a centralized platform for blood-related coordination.

The platform helps users:

- Submit and manage blood requests.
- Find potential matching donors.
- Notify eligible donors about relevant requests.
- Manage donor information and blood-related records.
- Coordinate between hospitals and blood banks.
- Communicate with other registered organizations.
- Track request progress through the platform.

By bringing these activities together, Swastya aims to reduce manual communication and make blood coordination more organized.

---

## Key Features

### 1. Donor Matching

- Matches blood requests with potential donors based on blood group compatibility.
- Considers donor information and eligibility conditions.
- Helps identify relevant donors for a blood requirement.
- Sends notifications to matching donors through the configured notification system.

### 2. SMS Notifications

- Uses Twilio for SMS notifications.
- Maintains SMS messages in a database-backed outbox.
- Processes pending messages through a background worker.
- Supports mock mode for testing SMS workflows without sending real messages.
- Provides donor action links for responding to eligible requests.

### 3. OTP Authentication

- Uses MSG91 for mobile OTP authentication.
- Supports donor account activation through mobile verification.
- Allows registered donors to access their accounts using OTP-based authentication.

### 4. Cross-Organization Communication

Supports communication between registered organizations:

- Hospital to Hospital
- Blood Bank to Blood Bank
- Hospital to Blood Bank

This helps organizations communicate about blood requirements and coordination through the website.

### 5. Hospital Donor Registry

- Allows hospitals to manage voluntary donor information.
- Supports importing donor records through CSV or Excel files.
- Helps organize donor details such as mobile number and blood group.
- Supports donor account activation through OTP verification.

### 6. Blood Request Management

- Allows requesters and hospitals to submit blood requirements.
- Supports request information such as blood group, component, quantity, and priority.
- Provides request status information.
- Helps organize blood request communication.

### 7. Hospital Surgery Planner

- Allows hospitals to manage planned surgical blood requirements.
- Helps estimate blood component requirements for planned procedures.
- Supports coordination of blood requirements before scheduled operations.

### 8. Blood Bank Inventory Management

- Provides blood banks with inventory management functionality.
- Supports recording and managing blood-related stock information.
- Helps blood banks organize inventory and related operational records.

### 9. Blood Shortage Forecasting

- Provides a forecasting feature for blood bank inventory.
- Supports projections for different future periods.
- Helps identify potential stock shortage risks based on available data.

Forecast accuracy depends on the quality and quantity of historical data available.

### 10. Blood Donation Camp Management

- Supports blood donation camp management.
- Allows blood banks to organize camp-related information.
- Provides camp discovery and registration functionality for donors.
- Supports camp-related notifications.

---

## User Portals

Swastya provides four dedicated portals.

### 1. Donor Portal

The Donor Portal helps registered donors:

- View relevant blood requests.
- Receive notifications about matching requirements.
- Manage donor profile information.
- View donation-related information.
- Discover blood donation camps.
- Respond to eligible blood requests.

### 2. Requester Portal

The Requester Portal helps patients or requesters:

- Submit blood requests.
- Provide blood group and component requirements.
- Upload prescription or supporting documents.
- View request status.
- Receive updates about the request.

### 3. Hospital Portal

The Hospital Portal provides hospital-related functionality:

- Manage blood requisitions.
- Coordinate blood requirements.
- Manage voluntary donor registries.
- Use the surgery blood planner.
- Communicate with other hospitals.
- Communicate with blood banks.

### 4. Blood Bank Portal

The Blood Bank Portal provides blood bank-related functionality:

- Manage blood inventory records.
- Handle blood-related requests.
- Manage donation camps.
- View shortage forecasting information.
- Plan blood donation activities.
- Communicate with other blood banks and hospitals.

---

## System Architecture

Swastya follows a monorepo architecture with separate frontend, backend, and shared packages.

### 1. Frontend

**Location:** `apps/web`

The frontend is built using Next.js and React.

It contains the user interfaces for the Donor, Requester, Hospital, and Blood Bank portals.

Responsibilities include:

- User interface and navigation.
- Portal-specific workflows.
- Authentication interfaces.
- API communication.
- Request and notification displays.

### 2. Backend

**Location:** `backend`

The backend is built using Node.js, Express, and TypeScript.

It provides REST APIs for the frontend and handles application logic.

Responsibilities include:

- Authentication and authorization.
- Blood request management.
- Donor matching.
- Hospital and blood bank operations.
- Communication services.
- SMS notification processing.
- Database operations.

### 3. Shared Packages

**Location:** `packages`

The monorepo contains shared packages for:

- API contracts and type definitions.
- Shared blood group constants and compatibility-related information.

These packages help maintain consistency between different parts of the application.

### 4. Database Layer

Swastya uses Neon Cloud PostgreSQL as its database and Prisma as its ORM.

The backend communicates with the Neon database to store and retrieve application information.

### 5. Background Processing

The backend includes background services for processing tasks such as:

- SMS outbox processing.
- Scheduled request-related operations.
- Camp-related notifications.

---

## Technology Stack

| Category | Technology | Purpose |
|---|---|---|
| Frontend Framework | Next.js 15.2.0 | Web application and routing |
| UI Library | React 19 | User interface development |
| Programming Language | TypeScript | Type-safe application development |
| Backend Framework | Express.js 5.2.1 | REST API development |
| Runtime | Node.js | Backend execution |
| Database | Neon Cloud PostgreSQL | Cloud database storage |
| ORM | Prisma 7.10 | Database access and schema management |
| Authentication | JWT | Session authentication |
| Password Hashing | bcrypt | Password hashing |
| OTP Service | MSG91 | Mobile OTP verification |
| SMS Service | Twilio | SMS notifications |
| Icons | Lucide React | User interface icons |
| Version Control | Git and GitHub | Source code management |

---

## Database Architecture

Swastya uses **Neon Cloud PostgreSQL** for persistent data storage.

The Prisma schema is maintained at:

[backend/prisma/schema.prisma](backend/prisma/schema.prisma)

Prisma provides a structured way to define database models, relationships, and database operations.

The database contains models related to the following areas:

### Identity and Access Management

- Users
- Donors
- Requesters
- Hospitals
- Blood banks

### Blood Requests

- Blood requests
- Request status history
- Prescription records
- Request documents
- Document verification records

### Inventory Management

- Inventory records
- Individual inventory units
- Inventory ledger
- Blood reservations
- Screening-related records

### Hospital Operations

- Surgery plans
- Surgery plan status history
- Procedure blood configurations

### Donation Camps

- Donation camps
- Camp registrations
- Camp status history

### Donor Registry

- Hospital donor records
- Donor activation records

### Notifications and Messaging

- SMS outbox
- Action tokens
- Donor notification preferences
- Emergency broadcasts
- Notification records

### Organization Communication

- Hospital messages
- Blood bank messages
- Hospital-to-blood-bank messages

Database schema changes are managed through Prisma schema updates and migrations.

The application connects to Neon using the configured database connection strings.

---

## Project Structure

```text
Swastya/
│
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── donor/
│       │   │   ├── requester/
│       │   │   ├── hospital/
│       │   │   ├── bloodbank/
│       │   │   ├── signin/
│       │   │   └── signup/
│       │   ├── components/
│       │   └── lib/
│       ├── public/
│       ├── next.config.ts
│       └── package.json
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── app/
│   │   │   ├── auth/
│   │   │   ├── donors/
│   │   │   ├── requesters/
│   │   │   ├── blood-requests/
│   │   │   ├── matching/
│   │   │   ├── hospitals/
│   │   │   ├── blood-banks/
│   │   │   ├── communication/
│   │   │   └── system/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── utils/
│   │   ├── server.ts
│   │   └── index.ts
│   ├── tests/
│   └── package.json
│
├── packages/
│   ├── contracts/
│   │   └── src/
│   └── shared/
│       └── src/
│
├── brand/
├── docs/
├── e2e/
├── scripts/
├── package.json
└── README.md
```

---

## Environment Variables

Before running the application, configure the required environment variables.

### Backend

Create a `backend/.env.development` file using `backend/.env.example` as a reference.

```env
# Neon Cloud PostgreSQL
DATABASE_URL="your_neon_pooled_connection_string"
DIRECT_URL="your_neon_direct_connection_string"

# Backend
NODE_ENV=development
JWT_SECRET="your_secure_jwt_secret"
FRONTEND_URL="http://localhost:3000"

# MSG91 OTP
MSG91_AUTH_KEY="your_msg91_auth_key"

# Twilio SMS
TWILIO_ACCOUNT_SID="your_twilio_account_sid"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_MESSAGING_SERVICE_SID="your_twilio_messaging_service_sid"

# SMS testing mode
TWILIO_MOCK_MODE=true
```

Use the connection strings provided by your Neon project.

The backend server currently listens on port `5000`.

### Frontend

Create an `apps/web/.env.local` file using `apps/web/.env.example` as a reference.

```env
# Backend API
NEXT_PUBLIC_API_URL="http://localhost:5000"

# MSG91 OTP Widget
NEXT_PUBLIC_MSG91_WIDGET_ID="your_msg91_widget_id"
NEXT_PUBLIC_MSG91_TOKEN_AUTH="your_msg91_token_auth"
```

Do not commit actual API keys, passwords, database URLs, or authentication secrets to GitHub.

### SMS Testing

When `TWILIO_MOCK_MODE=true`, SMS processing runs in mock mode for development and testing.

To send actual SMS messages:

1. Configure valid Twilio credentials.
2. Configure the required Twilio messaging service.
3. Set `TWILIO_MOCK_MODE=false`.
4. Ensure the destination number and account are permitted to receive SMS.

Actual SMS delivery depends on Twilio configuration, account status, destination restrictions, and available credits.

---

## Getting Started

### Prerequisites

Install the following before running Swastya:

- Node.js 20 or later
- npm
- Git
- A Neon Cloud PostgreSQL database
- Required MSG91 and Twilio credentials for real OTP and SMS functionality

### 1. Clone the Repository

```bash
git clone https://github.com/bhavyasanthoshi02/Swastya.git
cd Swastya
```

### 2. Install Dependencies

From the root directory:

```bash
npm install
```

### 3. Configure Environment Variables

Create the following files:

```text
backend/.env.development
apps/web/.env.local
```

Copy the corresponding example environment files and configure the required values.

### 4. Generate Prisma Client

From the root directory:

```bash
cd backend
npx prisma generate
cd ..
```

### 5. Apply Database Migrations

Ensure the backend is configured to use the intended Neon database.

Apply the migrations using the project's configured Prisma migration workflow.

Do not run database reset commands against your production or primary Neon database.

### 6. Start the Application

From the root directory:

```bash
npm run dev
```

The application is expected to run at:

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |

---

## Available Commands

Run these commands from the root directory.

| Command | Description |
|---|---|
| `npm run dev` | Starts the frontend and backend in development |
| `npm run dev:backend` | Starts the backend development server |
| `npm run dev:web` | Starts the frontend development server |
| `npm run build` | Builds the backend and frontend |
| `npm run build:backend` | Builds the backend |
| `npm run build:web` | Builds the frontend |
| `npm run tsc` | Builds the backend and runs the frontend TypeScript check |

---

## Testing and Verification

The project includes TypeScript, Prisma, build, and regression-test workflows.

### Backend Build

```bash
cd backend
npm run build
```

### Prisma Validation

```bash
cd backend
npx prisma validate
npx prisma generate
```

### Frontend TypeScript Check

```bash
cd apps/web
npx tsc --noEmit
```

### Frontend Production Build

```bash
cd apps/web
npm run build
```

### Backend Regression Tests

The backend contains regression test scripts for selected security and application workflows.

Run an individual test from the backend directory, for example:

```bash
npm run test:aud07
```

Other available test scripts include:

- `test:aud08`
- `test:aud09`
- `test:aud10`
- `test:aud11`
- `test:aud12`
- `test:aud14`

### Test Database Safety

Some regression tests require a dedicated test database.

Before running database-related tests:

- Confirm which database the test configuration uses.
- Use a separate test database or Neon branch.
- Do not run destructive test operations against the main application database.
- Verify that test scripts target the intended database before execution.

---

## Future Scope

The following areas can be explored further as the platform develops:

- Improved inventory availability synchronization between blood banks.
- More reliable stock and expiry information.
- Expanded blood unit traceability.
- Improved forecasting using larger and more reliable historical datasets.
- Enhanced donor and blood bank discovery.
- Additional notification and communication channels.
- Improved reporting and analytics for hospitals and blood banks.

These improvements can help Swastya evolve into a more comprehensive blood coordination platform.

---

## Conclusion

Swastya aims to make blood coordination more organized by connecting donors, requesters, hospitals, and blood banks through a centralized platform.

By supporting blood requests, donor matching, notifications, inventory management, and organization-to-organization communication, Swastya addresses the difficulty of finding the right contact and coordinating blood requirements.

The project focuses on improving communication and coordination so that users can manage blood-related requirements more efficiently.

---

<p align="center">
  <b>Swastya — Connecting people and organizations for better blood coordination.</b>
</p>