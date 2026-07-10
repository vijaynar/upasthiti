# Implementation Plan: Unified Auth & Student Discovery Experience

We will overhaul the authentication system to implement a simplified, premium, glassmorphic login screen that consolidates sign-in and passwordless signup. We will also enhance the Student Portal (`/student/dashboard`) into an interactive single-page console where students can browse/register for batches, explore coaches, and apply to "Become a Coach."

---

## User Review Required

> [!IMPORTANT]
> **Key Design & Architectural Decisions:**
> 1. **Consolidated Auth UI:** We will replace the standard Email + Password login page with a high-fidelity mockup matching your design, streamlined per your feedback:
>    * Social logins: **Continue with Google** (OAuth code flow) only. (Removed Apple Sign-In and Phone OTP per your request).
>    * Email login/signup: Consolidates both using passwordless **Supabase Magic Links/OTP**. If an email doesn't exist, it signs them up; if it exists, it logs them in securely without requiring manual password fields.
>    * **"Try it first" option:** A bypass link that lets anonymous users browse the public batches/coaches directories in readonly mode.
> 2. **Auto-Role & Sync Trigger:** We deployed active BEFORE and AFTER insertion triggers on the remote `auth.users` schema. Any new user self-signing up via Google or Magic Link is immediately registered in `public.users` as a `student` and automatically joined to the default tenant (`VidyaSopan Sports school`).
> 3. **Integrated Student Console:** Instead of fragmented pages, the student dashboard will become a high-end tabbed dashboard:
>    * **Dashboard Tab:** circular SVG attendance tracker, penalties balance ledger, check-in history list, password updating console.
>    * **Register Classes Tab:** Displays all active batches in the academy (schedule, capacity, class info) with a one-click "Register" enroll button.
>    * **Meet Coaches Tab:** Features an elegant visual directory of active verified coaches with links to their public SEO-optimized profiles (`/coaches/[slug]`).
>    * **Become a Coach Tab:** A multi-step application form where students submit professional skills, experience, service types, bio, and upload verification files. It logs applications with `employment_status = 'Inactive'` and documents as `Pending` for Admin approval.

---

## Proposed Changes

We group the files to be created and modified under this workflow:

### 1. Unified Authentication Redesign

#### [NEW] [callback/route.ts](file:///C:/src/Abhyas/apps/web/src/app/auth/callback/route.ts)
*   Create a Next.js App Router Route Handler to exchange the Supabase authorization `code` parameter.
*   Once swapped for an active session, retrieve the database profile role and dynamically route:
    *   `student` or `parent` $\rightarrow$ `/student/dashboard`
    *   `admin` or `superadmin` $\rightarrow$ `/admin/dashboard`

#### [MODIFY] [login/page.tsx](file:///C:/src/Abhyas/apps/web/src/app/auth/login/page.tsx)
*   Rebuild the screen to exactly match the provided design:
    *   Sleek glassmorphic card container over the premium neon radial mesh background.
    *   **Continue with Google** button linking to Supabase OAuth:
        `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`
    *   **Email Address** input field + **Continue** button:
        Triggers `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` to send a magic link/OTP.
    *   **Try it first** link at the bottom to bypass auth.

---

### 2. Student Discovery & Dashboard Expansion

#### [MODIFY] [dashboard/page.tsx](file:///C:/src/Abhyas/apps/web/src/app/student/dashboard/page.tsx)
*   Reorganize the layout into an elegant tabbed panel:
    1.  `tabs = ['Dashboard', 'Available Batches', 'Meet Coaches', 'Become a Coach']`.
*   **"Available Batches" view:**
    *   Fetches active batches via Supabase (`batches` joined with `classes`).
    *   Displays schedules (times, days of week), capacities, and enrollment status.
    *   Provides a **Register** button which updates the student's `batch_id` in the database instantly.
*   **"Meet Coaches" view:**
    *   Fetches all verified active coaches (`employment_status = 'Active'`) from `public.coaches` joined with `users`.
    *   Renders card elements featuring skills, experience years, bio snippet, and a "View Public Profile" button linking to `/coaches/[slug]`.
*   **"Become a Coach" view:**
    *   Checks if the logged-in user already has an entry in the `coaches` table.
    *   If **Applied (employment_status = 'Inactive')**, displays a glass card alert: *"Application under review by academy admins. Verification documents are pending review."*
    *   If **No application exists**, displays a premium multi-step form:
        *   Fields: *Primary Skill* (select: Yoga, Badminton, Swimming, etc.), *Experience Years*, *Languages*, *Service Types* (Online, Offline, Hybrid), *Class Types* (One-to-One, Group), *Qualifications*, *Bio*.
        *   *Documents upload area:* Government ID, Resume, and Certifications, uploading files directly to Supabase storage and logging them in the `coach_documents` table for verification.

---

## Verification Plan

### Automated Checks
*   Run the Next.js compiler check: `npx tsc --noEmit` from the root to ensure zero TypeScript errors exist.

### Manual Verification
1.  **Google & Email Sign-in Flow:**
    *   Navigate to `/auth/login`. Verify visual quality matching the mockup.
    *   Test entering an email and clicking **Continue**. Ensure the magic link is sent.
    *   Verify click-through on magic link properly calls `/auth/callback` and auto-provisions a `student` record in `public.users` & `public.students` under tenant `022c1494-057e-4c80-80dd-88fa4b1287b5`.
2.  **Student Batch Enrollment:**
    *   Access the student dashboard, go to the "Available Batches" tab, and click **Register** on a batch.
    *   Verify the page refreshes and immediately displays the new batch schedule on the main dashboard tab.
3.  **Become a Coach application:**
    *   Go to "Become a Coach" tab.
    *   Fill out skills, experience, upload a simulated government ID, and submit.
    *   Verify that the view locks into the "Application Pending Review" state.
    *   Confirm the database contains new rows in both `public.coaches` and `public.coach_documents`.
