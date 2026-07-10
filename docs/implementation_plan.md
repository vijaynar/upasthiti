# Implementation Plan: Abhyas AI-Powered Attendance & Student Progress Platform

> **Historical MVP plan.** This document captures the original Phase 1 build (attendance + academy ops only). The platform has since grown into a combined academy-management + public coach/academy Discovery marketplace — see `docs/feature_plan.md` for the current, complete scope.

Abhyas is an AI-powered student management and attendance platform. This document outlines a phased execution plan designed to build a unified **Web + iOS & Android Mobile** platform that costs **almost $0 to start** but scales seamlessly.

As per user instructions, **Health Tracker, Payment Queue, Insights, and Notifications** are deferred for later phases to focus strictly on building a robust, high-performance attendance tracking foundation.

---

## User Review Required

> [!IMPORTANT]
> **MVP Feature Boundaries:**
> *   **Core Scope:** Relational database schemas, multi-tenant workspace setup, Next.js serverless signup & face-matching API routes, `pgvector` stored procedure matching inside Supabase, a Next.js admin dashboard (with class/batch management, student rosters, face enrollment, and fine ledger listings), and an Expo React Native mobile camera edge scanner.
> *   **Deferred Modules:**
>     1.  *Health Tracker:* Vitals, sports metrics, secure medical reports, growth charts.
>     2.  *Payment Queue:* Payment proof uploads (receipt screenshots, UPI transaction IDs) and Admin verification panels.
>     3.  *AI Insights Engine:* Gemini 1.5 Flash monthly diagnostics and sports progress summaries.
>     4.  *Notification gateways:* WhatsApp instant absence templates, monthly digests, Twilio integration, and native Expo push notifications.

---

## Open Questions

> [!NOTE]
> Please review and provide feedback on these structural questions during approval:
> 1. **Supabase Environment:** Should we proceed with standard Supabase CLI migrations targeting a local Dockerized Supabase instance for initial development, or will you connect directly to a hosted Supabase Cloud project? (We will configure the code to read credentials from environment variables).
> 2. **Mobile Camera & AI Inference:** For the on-device mobile face scanner, should we prioritize using the device's native camera loop paired with a client-side lightweight TensorFlow.js model (for pure zero-cost edge calculations), or can the device capture an optimized image frame and dispatch it to a serverless edge function for rapid, centralized parsing? (We recommend client-side embedding extraction for absolute $0 compute costs at scale).
> 3. **Branding & Design Palette:** We plan to build a sleek, premium **Deep Slate & Indigo Glow** dark-themed interface (glassmorphism details, smooth CSS transitions, curated typography) for both the Next.js web portal and the Expo mobile client. Let us know if you have specific brand guidelines or color preferences!

---

## Phased Roadmap & Work Breakdown

We divide the implementation into **five core phases** to ensure step-by-step correctness and high software quality.

```
┌─────────────────────────────────────────────────────────────┐
│            PHASE 1: Database Setup & Migrations             │
│  - Set up Supabase migrations and enable pgvector            │
│  - Define schemas for tenants, users, classes, and batches  │
│  - Create attendance_logs, tenant_settings, and fines tables │
│  - Write pgvector similarity function and create indices     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 PHASE 2: Monorepo Workspace                │
│  - Initialize Turborepo with shared packages/apps layout    │
│  - Set up Next.js app in apps/web, Expo app in apps/mobile  │
│  - Implement database package (packages/database)           │
│  - Implement shared validation and types (packages/common)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             PHASE 3: Core Serverless Backend APIs           │
│  - Create Next.js serverless Auth signup API route           │
│  - Implement face enrollment endpoint: /students/enroll-face│
│  - Implement vector face-similarity search matching endpoint │
│  - Write multitenancy boundary middleware gatekeeping        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 PHASE 4: Web Admin Portal                   │
│  - Design premium web dashboard using custom CSS & Tailwind │
│  - Add class/batch creation & student enrollment CRUDS      │
│  - Build face-api.js client-side face embedding capture     │
│  - Add fines list ledger panel with override actions        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 PHASE 5: Mobile Edge Attendance             │
│  - Integrate expo-camera native frame buffers               │
│  - Create edge face embedding calculations hook            │
│  - Build real-time gate scanner and matching sound HUDs     │
│  - Build basic Student/Parent calendars and attendance logs  │
└─────────────────────────────────────────────────────────────┘
```

---

## Proposed Changes

We group the proposed file structures by phase to facilitate a structured step-by-step development flow.

### Component 1: Supabase Database Schema (Phase 1)
We will deploy the core database tables and spatial indexing to Supabase. This establishes proper multi-tenant isolation from the very beginning.

#### [NEW] [0001_initial_schema.sql](file:///c:/src/Abhyas/supabase/migrations/0001_initial_schema.sql)
Includes definitions for:
*   `tenants` (Multi-tenant SaaS foundation)
*   `users` (Core logins mapped to Supabase auth with roles: `'superadmin', 'admin', 'student', 'parent'`)
*   `classes` (Academic classes)
*   `batches` (Class batch schedules with time bounds and weekly calendars)
*   `students` (Profiles pointing to users and batches)
*   `parents` (Profiles pointing to users)
*   `parent_student_map` (Siblings and multi-parent linkage mapping)
*   `student_face_samples` (Storing the photo URL and the 128-dimensional pgvector float array)
*   `attendance_logs` (Tracking date, check-in timestamps, status: `present, late, absent`, and verification modes)
*   `tenant_settings` (Absence fine rule values, grace periods, currency settings)
*   `fines` (Absence auto-penalties and manual fine entries, initially starting with `'unpaid', 'paid', 'waived'`)

#### [NEW] [0002_face_matching_rpc.sql](file:///c:/src/Abhyas/supabase/migrations/0002_face_matching_rpc.sql)
Implements the stored procedure `match_face_embedding` using cosine distance calculation:
```sql
CREATE OR REPLACE FUNCTION match_face_embedding (
  input_embedding vector(128),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  student_id uuid,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    student_face_samples.student_id,
    (1 - (student_face_samples.embedding <=> input_embedding)) AS similarity
  FROM student_face_samples
  WHERE (1 - (student_face_samples.embedding <=> input_embedding)) > match_threshold
  ORDER BY student_face_samples.embedding <=> input_embedding ASC
  LIMIT match_count;
END;
$$;
```

---

### Component 2: Monorepo Setup (Phase 2)
We will build a high-performance Turborepo structure to share code efficiently and maintain absolute type safety across the stack.

#### [NEW] [package.json](file:///c:/src/Abhyas/package.json) (Root Configuration)
Configures workspaces for `apps/*` and `packages/*` and installs build systems (Turbo, Prettier, TypeScript).

#### [NEW] [turbo.json](file:///c:/src/Abhyas/turbo.json)
Configures cache pipelines for building, linting, and starting developmental apps.

#### [NEW] [packages/database/package.json](file:///c:/src/Abhyas/packages/database/package.json) & [index.ts](file:///c:/src/Abhyas/packages/database/index.ts)
Creates the shared Supabase client module. Supports serverless-optimized connection pooling.

#### [NEW] [packages/common/package.json](file:///c:/src/Abhyas/packages/common/package.json) & [index.ts](file:///c:/src/Abhyas/packages/common/index.ts)
Declares TypeScript interfaces and schema validators (e.g., Zod schemas) for user profiles, attendance sheets, and fine tables.

#### [NEW] [apps/web/package.json](file:///c:/src/Abhyas/apps/web/package.json)
Sets up the Next.js frontend and serverless API engine.

#### [NEW] [apps/mobile/package.json](file:///c:/src/Abhyas/apps/mobile/package.json)
Initializes the React Native Expo app setup.

---

### Component 3: Next.js API Routes (Phase 3)
Serverless routes will act as our core API backend under `/apps/web/src/app/api/v1/`.

#### [NEW] [route.ts](file:///c:/src/Abhyas/apps/web/src/app/api/v1/auth/signup/route.ts)
Endpoint to securely onboard students or parents, hashing credentials and registering profiles within the administrative tenant's workspace.

#### [NEW] [route.ts](file:///c:/src/Abhyas/apps/web/src/app/api/v1/students/enroll-face/route.ts)
Accepts a student's ID, a profile photo URL, and a 128-float face embedding array, storing the vector in `student_face_samples`.

#### [NEW] [route.ts](file:///c:/src/Abhyas/apps/web/src/app/api/v1/attendance/match-face/route.ts)
Consumes an incoming 128-float facial vector, queries `match_face_embedding` via RPC, logs attendance as `present` or `late` (using class settings & timestamps), calculates any auto-fines if late/absent, and returns recognized student details.

---

### Component 4: Web Admin Portal & Ingestion (Phase 4)
Builds the beautiful Next.js web application utilizing curated dark aesthetics, glassmorphism, responsive grid structures, and interactive tables.

#### [NEW] [apps/web/src/app/layout.tsx](file:///c:/src/Abhyas/apps/web/src/app/layout.tsx) & [global.css](file:///c:/src/Abhyas/apps/web/src/app/global.css)
Declares global HTML layout, typography from Google Fonts, CSS tokens, and Tailwind customizations for high visual appeal.

#### [NEW] [apps/web/src/app/admin/dashboard/page.tsx](file:///c:/src/Abhyas/apps/web/src/app/admin/dashboard/page.tsx)
The primary administrative center with live attendance charts and a live feed of scanned students.

#### [NEW] [apps/web/src/app/admin/students/page.tsx](file:///c:/src/Abhyas/apps/web/src/app/admin/students/page.tsx)
Renders a roster of students, batches, face enrollment status, and direct buttons to trigger face scanning templates.

#### [NEW] [apps/web/src/app/admin/enroll-face/page.tsx](file:///c:/src/Abhyas/apps/web/src/app/admin/enroll-face/page.tsx)
Accesses the web camera via browser APIs, detects face coordinates, loads a localized face-api.js model, calculates the 128-dimensional embedding vector, and pushes it to the backend.

---

### Component 5: Mobile Attendance App (Phase 5)
A premium Expo-powered mobile app with native fluid design and edge camera loops.

#### [NEW] [apps/mobile/App.tsx](file:///c:/src/Abhyas/apps/mobile/App.tsx)
App entrypoint handling state navigation hubs.

#### [NEW] [apps/mobile/src/screens/ScannerScreen.tsx](file:///c:/src/Abhyas/apps/mobile/src/screens/ScannerScreen.tsx)
Implements the high-performance on-device live video face scanning gate. Binds `expo-camera` with a localized lightweight TensorFlow model to extract vectors and send matches.

---

## Verification Plan

### Automated Tests
1. **Schema Check:** We will execute `supabase db lint` or write SQL test scripts to confirm table constraints and index definitions are correctly loaded.
2. **Matching Accuracy Test:** A Node.js test script will fire fake 128-dimensional embeddings to `/api/v1/attendance/match-face` and verify:
   * Confidence scores and student mappings are correctly calculated.
   * Cross-tenant queries are blocked (verifying Row Level Security).
   * Correct fines are automatically populated in the `fines` table when simulated check-ins are late.

### Manual Verification
1. **Face Enrollment Loop:** Enroll a test student via the Next.js webcam scanner and verify that:
   * The camera feed launches smoothly.
   * Embeddings are calculated client-side in under 500ms.
   * The face vector resolves successfully into `student_face_samples` table.
2. **Scanner Verification:** Open the Expo React Native app, mount the camera scanner view, present the registered student face image, and verify the UI flashes green and registers the check-in instantly.
