# Marketplace / Discovery

The public-facing side of Abhyas — students and parents browse coaches by sport, location, and rating without an account.

---

## Workflow: Search for a coach

**Purpose:** Find a coach by sport/category, city, and minimum rating.

**Prerequisites:** None — fully public, no login required.

**Steps:**
1. Go to `/explore/coaches`.
   ![Default coach search results](screenshots/09-marketplace/01-explore-coaches-default.png)
2. Use the sidebar filters — **Category** (Sports/Fitness/Martial Arts/Yoga & Wellness/Dance/Music/…), **Age Group**, **Skill Level**, **Rating** — and the top search bar for free text and city/area.
3. Results update live.
   ![Filtered results: Sports category, Hyderabad, 4.0+ rating](screenshots/09-marketplace/02-explore-coaches-filtered-sports-hyderabad.png)

**Expected result:** A paginated grid of coach cards (avatar initials, primary specialty badge, rating, location, service mode) sorted by rating, descending.

**Common mistakes / gaps to know about:**
- **No experience-years or price filter** — both exist as coach data fields and are visible on coach cards/profiles, but `GET /api/v1/public/coaches` doesn't accept filter parameters for either, despite the UI collecting `experienceYears` during coach onboarding. If a customer expects to filter by "5+ years experience" or "under ₹2000/month", they can't.
- **Free-text search only matches `bio`** — not coach name, not specialty/tag names. Searching a coach's actual name will often return nothing.
- Only coaches with a completed profile (`public_profile_slug` set, meaning they've been approved and finished onboarding) appear at all — coaches still `Pending Verification` or `Onboarding` are invisible here, which is correct/intentional.

---

## Workflow: View a coach's public profile

**Purpose:** See a coach's full bio, achievements, reviews, and book a trial.

**Steps:** Click **View** on any coach card, or go directly to `/coaches/<slug>`.
![Public coach profile](screenshots/09-marketplace/03-public-coach-profile.png)

**Expected result:** Bio, notable achievements, a locked "Active Schedules & Batches" panel (prompts login/register to see real timings/fees), student reviews, and a trial-booking sidebar with the coach's email/phone.

**Missing feature:** The **"Book Trial Slot Now"** and **"Contact Coach"** buttons on this page have no attached click handler in the current build — they render as normal buttons but do nothing when clicked. The coach's email and phone are shown as plain text below them, so contact is technically possible, just not through the buttons that imply it.

---

## Workflow: Search for an academy

**Status: not implemented.** `/explore/academies` currently renders a static "coming soon" message and a link back to coach search — there's no academy search, filtering, or listing built yet, and no `academy` concept in the data model distinct from a `tenant`.
![Explore Academies — coming soon placeholder](screenshots/09-marketplace/04-explore-academies-placeholder.png)

If this is needed, it would most naturally be a search over `tenants` (name, city, subscription status) joined to their active coaches/classes — there's no existing API route for it (`/api/v1/public/coaches` is coach-only).
