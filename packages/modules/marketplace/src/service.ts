// marketplace module — public API (Doc 14 §2). Surfaces and other modules
// call only the functions exported here, never this module's tables
// directly; cross-module effects go through the queue (activateOrgListings
// consumes platform.org_verified, enqueued by platform-admin on approval)
// rather than a direct table write.
//
// Scope: listings, leads, reviews, taxonomy, geography, referrals (M9,
// Doc 07 §11/§15, migration 0013). See that migration's header for the
// scope decisions this file assumes: no literal Postgres `anon` role (public
// reads/writes go through getServiceClient() with explicit filtering, same
// as tenancy-rbac's resolveOrgBySlug); one listing per org; listing
// publish→live gated on the org's own verification status; referral reward
// approval is a manual platform action (subscriptions billing isn't wired);
// no captcha/rate-limit on public lead capture (no vendor configured).

import { randomBytes } from 'node:crypto';
import { db } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';
import { hasPlatformPerm } from '@abhyas/module-platform-admin';
import { writeAuditLog } from '@abhyas/module-audit';

export class NotAuthorizedError extends Error {
  constructor(action = 'perform this action') {
    super(`[marketplace] You do not have permission to ${action}.`);
  }
}

// historical_backdating feature flag (migration 0007_seed_historical_backdating.sql)
export class FeatureDisabledError extends Error {
  constructor(flagKey: string) {
    super(`[marketplace] The "${flagKey}" feature is not enabled for this organization.`);
  }
}

export class PlatformPermissionError extends Error {
  constructor(action = 'perform this platform action') {
    super(`[marketplace] You do not have permission to ${action}.`);
  }
}

export class NotFoundError extends Error {
  constructor(what = 'resource') {
    super(`[marketplace] ${what} not found.`);
  }
}

async function assertPlatformPerm(session: SessionContext, permission: string, action: string): Promise<void> {
  if (!(await hasPlatformPerm(session, permission))) {
    throw new PlatformPermissionError(action);
  }
}

// ── Taxonomy / geography (platform reference data) ──────────────────

export interface TaxonomySport {
  key: string;
  label: string;
  category: string | null;
}

export interface GeoCity {
  key: string;
  label: string;
  state: string | null;
}

export interface GeoArea {
  key: string;
  cityKey: string;
  label: string;
}

const LIST_SPORTS_SQL = `select key, label, category from taxonomy_sports order by label`;
const LIST_CITIES_SQL = `select key, label, state from geo_cities order by label`;
const LIST_AREAS_SQL = `select key, city_key, label from geo_areas order by label`;

export async function listTaxonomySports(session: SessionContext): Promise<TaxonomySport[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ key: string; label: string; category: string | null }>(LIST_SPORTS_SQL);
    return result.rows;
  });
}

export async function listGeography(session: SessionContext): Promise<{ cities: GeoCity[]; areas: GeoArea[] }> {
  return db.withRequestContext(session, async (client) => {
    const cities = await client.query<{ key: string; label: string; state: string | null }>(LIST_CITIES_SQL);
    const areas = await client.query<{ key: string; city_key: string; label: string }>(LIST_AREAS_SQL);
    return {
      cities: cities.rows,
      areas: areas.rows.map((r) => ({ key: r.key, cityKey: r.city_key, label: r.label })),
    };
  });
}

// ── Listing (one per org, Doc 08 §7 `GET/PATCH /org/listing`) ───────

export type ListingStatus = 'draft' | 'pending_verification' | 'live' | 'paused' | 'removed';

export interface Listing {
  id: string;
  organizationId: string;
  slug: string;
  status: ListingStatus;
  headline: string | null;
  description: string | null;
  contentLanguage: string;
  sportKeys: string[];
  cityKey: string;
  areaKeys: string[] | null;
  priceDisplay: unknown;
  mediaPaths: string[] | null;
  featuredUntil: string | null;
  publishedAt: string | null;
  categoryId: string | null;
  subcategoryIds: string[];
  primarySubcategoryId: string | null;
  tagIds: string[];
  ageGroups: string[];
  skillLevels: string[];
}

function mapListingRow(row: {
  id: string;
  organization_id: string;
  slug: string;
  status: ListingStatus;
  headline: string | null;
  description: string | null;
  content_language: string;
  sport_keys: string[];
  city_key: string;
  area_keys: string[] | null;
  price_display: unknown;
  media_paths: string[] | null;
  featured_until: string | null;
  published_at: string | null;
  category_id: string | null;
  subcategory_ids: string[];
  primary_subcategory_id: string | null;
  tag_ids: string[];
  age_groups: string[];
  skill_levels: string[];
}): Listing {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    status: row.status,
    headline: row.headline,
    description: row.description,
    contentLanguage: row.content_language,
    sportKeys: row.sport_keys,
    cityKey: row.city_key,
    areaKeys: row.area_keys,
    priceDisplay: row.price_display,
    mediaPaths: row.media_paths,
    featuredUntil: row.featured_until,
    publishedAt: row.published_at,
    categoryId: row.category_id,
    subcategoryIds: row.subcategory_ids,
    primarySubcategoryId: row.primary_subcategory_id,
    tagIds: row.tag_ids,
    ageGroups: row.age_groups,
    skillLevels: row.skill_levels,
  };
}

const LISTING_COLUMNS = `id, organization_id, slug, status, headline, description, content_language, sport_keys, city_key, area_keys, price_display, media_paths, featured_until, published_at, category_id, subcategory_ids, primary_subcategory_id, tag_ids, age_groups, skill_levels`;
const SELECT_MY_LISTING_SQL = `select ${LISTING_COLUMNS} from listings where organization_id = $1`;
const INSERT_LISTING_SQL = `insert into listings (organization_id, slug, headline, description, content_language, sport_keys, city_key, area_keys, price_display, media_paths, category_id, subcategory_ids, primary_subcategory_id, tag_ids, age_groups, skill_levels)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning ${LISTING_COLUMNS}`;
const UPDATE_LISTING_SQL = `update listings set
     headline = coalesce($1, headline),
     description = coalesce($2, description),
     sport_keys = coalesce($3, sport_keys),
     city_key = coalesce($4, city_key),
     area_keys = coalesce($5, area_keys),
     price_display = coalesce($6, price_display),
     media_paths = coalesce($7, media_paths),
     category_id = coalesce($8, category_id),
     subcategory_ids = coalesce($9, subcategory_ids),
     primary_subcategory_id = coalesce($10, primary_subcategory_id),
     tag_ids = coalesce($11, tag_ids),
     age_groups = coalesce($12, age_groups),
     skill_levels = coalesce($13, skill_levels),
     updated_at = now()
   where organization_id = $14
   returning ${LISTING_COLUMNS}`;
const UPDATE_LISTING_STATUS_SQL = `update listings set status = $1, updated_at = now() where organization_id = $2 returning ${LISTING_COLUMNS}`;
const PUBLISH_LISTING_SQL = `update listings set status = $1, published_at = coalesce(published_at, now()), updated_at = now() where organization_id = $2 returning ${LISTING_COLUMNS}`;
const SELECT_ORG_STATUS_SQL = `select status from organizations where id = $1`;

export interface UpsertListingInput {
  organizationId: string;
  slug?: string;
  headline?: string;
  description?: string;
  sportKeys?: string[];
  cityKey?: string;
  areaKeys?: string[];
  priceDisplay?: unknown;
  mediaPaths?: string[];
  categoryId?: string | null;
  subcategoryIds?: string[];
  primarySubcategoryId?: string | null;
  tagIds?: string[];
  ageGroups?: string[];
  skillLevels?: string[];
}

// market.listing.manage — create-if-none / update the org's single listing.
// A fresh listing always starts 'draft' regardless of the org's own
// verification status; publishListing() is the explicit step that moves it
// toward visibility. Same partial-update convention as the existing fields:
// an omitted category/subcategory/tag/age-group/skill-level selection
// leaves the stored value unchanged (coalesce), it can't be cleared to
// empty via this call.
export async function upsertMyListing(session: SessionContext, input: UpsertListingInput): Promise<Listing> {
  return db.withRequestContext(session, async (client) => {
    const existing = await client.query<Parameters<typeof mapListingRow>[0]>(SELECT_MY_LISTING_SQL, [input.organizationId]);
    if (existing.rows[0]) {
      const result = await client.query<Parameters<typeof mapListingRow>[0]>(UPDATE_LISTING_SQL, [
        input.headline ?? null,
        input.description ?? null,
        input.sportKeys ?? null,
        input.cityKey ?? null,
        input.areaKeys ?? null,
        input.priceDisplay ?? null,
        input.mediaPaths ?? null,
        input.categoryId ?? null,
        input.subcategoryIds ?? null,
        input.primarySubcategoryId ?? null,
        input.tagIds ?? null,
        input.ageGroups ?? null,
        input.skillLevels ?? null,
        input.organizationId,
      ]);
      if (result.rowCount === 0) throw new NotAuthorizedError('update this listing');
      return mapListingRow(result.rows[0]);
    }

    if (!input.slug || !input.cityKey) throw new Error('[marketplace] slug and cityKey are required to create a listing.');
    const result = await client.query<Parameters<typeof mapListingRow>[0]>(INSERT_LISTING_SQL, [
      input.organizationId,
      input.slug,
      input.headline ?? null,
      input.description ?? null,
      'en',
      input.sportKeys ?? [],
      input.cityKey,
      input.areaKeys ?? null,
      input.priceDisplay ?? null,
      input.mediaPaths ?? null,
      input.categoryId ?? null,
      input.subcategoryIds ?? [],
      input.primarySubcategoryId ?? null,
      input.tagIds ?? [],
      input.ageGroups ?? [],
      input.skillLevels ?? [],
    ]);
    return mapListingRow(result.rows[0]);
  });
}

export async function getMyListing(session: SessionContext, organizationId: string): Promise<Listing | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapListingRow>[0]>(SELECT_MY_LISTING_SQL, [organizationId]);
    return result.rows[0] ? mapListingRow(result.rows[0]) : null;
  });
}

// Doc 02 §9 / PRD US-1 AC5: goes live immediately only if the org itself is
// already verified (active); otherwise sits pending_verification until
// activateOrgListings() (below) promotes it once platform staff approve the
// org — see migration 0013's header point 5.
export async function publishListing(session: SessionContext, organizationId: string): Promise<Listing> {
  return db.withRequestContext(session, async (client) => {
    const orgResult = await client.query<{ status: string }>(SELECT_ORG_STATUS_SQL, [organizationId]);
    const nextStatus: ListingStatus = orgResult.rows[0]?.status === 'active' ? 'live' : 'pending_verification';
    const result = await client.query<Parameters<typeof mapListingRow>[0]>(PUBLISH_LISTING_SQL, [nextStatus, organizationId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('publish this listing');
    return mapListingRow(result.rows[0]);
  });
}

export async function pauseListing(session: SessionContext, organizationId: string): Promise<Listing> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapListingRow>[0]>(UPDATE_LISTING_STATUS_SQL, ['paused', organizationId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('pause this listing');
    return mapListingRow(result.rows[0]);
  });
}

export async function removeListing(session: SessionContext, organizationId: string): Promise<Listing> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapListingRow>[0]>(UPDATE_LISTING_STATUS_SQL, ['removed', organizationId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('remove this listing');
    return mapListingRow(result.rows[0]);
  });
}

// Queue consumer for platform.org_verified (apps/worker) — service-role, no
// caller session (see migration 0013 header point 5 + SERVICE_ROLE_MANIFEST).
export async function activateOrgListings(organizationId: string): Promise<void> {
  const client = await db.getServiceClient();
  try {
    await client.query('select activate_org_listings($1)', [organizationId]);
  } finally {
    client.release();
  }
}

export const ORG_VERIFIED_JOB_KIND = 'platform.org_verified';

// ── Leads ────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'contacted' | 'trial_scheduled' | 'converted' | 'lost';

export interface Lead {
  id: string;
  listingId: string;
  organizationId: string;
  contactName: string;
  contactPhone: string;
  message: string | null;
  source: string | null;
  status: LeadStatus;
  assignedTo: string | null;
  createdAt: string;
}

function mapLeadRow(row: {
  id: string;
  listing_id: string;
  organization_id: string;
  contact_name: string;
  contact_phone: string;
  message: string | null;
  source: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  created_at: string;
}): Lead {
  return {
    id: row.id,
    listingId: row.listing_id,
    organizationId: row.organization_id,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    message: row.message,
    source: row.source,
    status: row.status,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
  };
}

const LEAD_COLUMNS = `id, listing_id, organization_id, contact_name, contact_phone, message, source, status, assigned_to, created_at`;
const LIST_LEADS_SQL = `select ${LEAD_COLUMNS} from leads where organization_id = $1 and ($2::text is null or status = $2) order by created_at desc`;
const UPDATE_LEAD_SQL = `update leads set status = coalesce($1, status), assigned_to = coalesce($2, assigned_to), updated_at = now() where id = $3 returning ${LEAD_COLUMNS}`;
const INSERT_LEAD_SQL = `insert into leads (listing_id, organization_id, contact_name, contact_phone, message, source)
   values ($1, $2, $3, $4, $5, $6) returning ${LEAD_COLUMNS}`;
const SELECT_LIVE_LISTING_FOR_LEAD_SQL = `select id, organization_id from listings where slug = $1 and status = 'live'`;

export interface ListLeadsInput {
  organizationId: string;
  status?: LeadStatus;
}

export async function listLeads(session: SessionContext, input: ListLeadsInput): Promise<Lead[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapLeadRow>[0]>(LIST_LEADS_SQL, [input.organizationId, input.status ?? null]);
    return result.rows.map(mapLeadRow);
  });
}

export interface UpdateLeadInput {
  status?: LeadStatus;
  assignedTo?: string;
}

export async function updateLead(session: SessionContext, leadId: string, patch: UpdateLeadInput): Promise<Lead> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapLeadRow>[0]>(UPDATE_LEAD_SQL, [patch.status ?? null, patch.assignedTo ?? null, leadId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('update this lead');
    return mapLeadRow(result.rows[0]);
  });
}

// Anonymous public lead capture — service-role (no session exists), the
// listing_slug + status='live' lookup IS the authorization check (migration
// 0013 header points 1 + 8: no captcha/rate-limit configured in this
// codebase, a documented known gap, not a silent skip).
export interface SubmitPublicLeadInput {
  listingSlug: string;
  contactName: string;
  contactPhone: string;
  message?: string;
}

export async function submitPublicLead(input: SubmitPublicLeadInput): Promise<{ id: string }> {
  const client = await db.getServiceClient();
  try {
    const listingResult = await client.query<{ id: string; organization_id: string }>(SELECT_LIVE_LISTING_FOR_LEAD_SQL, [input.listingSlug]);
    const listing = listingResult.rows[0];
    if (!listing) throw new NotFoundError('listing');

    const result = await client.query<{ id: string }>(INSERT_LEAD_SQL, [
      listing.id,
      listing.organization_id,
      input.contactName,
      input.contactPhone,
      input.message ?? null,
      'explore',
    ]);
    return { id: result.rows[0].id };
  } finally {
    client.release();
  }
}

// ── Reviews ──────────────────────────────────────────────────────

export type ReviewStatus = 'published' | 'flagged' | 'removed';

export interface Review {
  id: string;
  listingId: string;
  organizationId: string;
  authorUserId: string;
  enrollmentId: string;
  rating: number;
  body: string | null;
  orgResponse: string | null;
  status: ReviewStatus;
  createdAt: string;
}

function mapReviewRow(row: {
  id: string;
  listing_id: string;
  organization_id: string;
  author_user_id: string;
  enrollment_id: string;
  rating: number;
  body: string | null;
  org_response: string | null;
  status: ReviewStatus;
  created_at: string;
}): Review {
  return {
    id: row.id,
    listingId: row.listing_id,
    organizationId: row.organization_id,
    authorUserId: row.author_user_id,
    enrollmentId: row.enrollment_id,
    rating: row.rating,
    body: row.body,
    orgResponse: row.org_response,
    status: row.status,
    createdAt: row.created_at,
  };
}

const REVIEW_COLUMNS = `id, listing_id, organization_id, author_user_id, enrollment_id, rating, body, org_response, status, created_at`;
const INSERT_REVIEW_SQL = `insert into reviews (listing_id, organization_id, author_user_id, enrollment_id, rating, body, created_at)
   values ($1, $2, $3, $4, $5, $6, coalesce($7, now())) returning ${REVIEW_COLUMNS}`;
const LIST_ORG_REVIEWS_SQL = `select ${REVIEW_COLUMNS} from reviews where organization_id = $1 order by created_at desc`;
const RESPOND_TO_REVIEW_SQL = `update reviews set org_response = $1, updated_at = now() where id = $2 returning ${REVIEW_COLUMNS}`;

export interface CreateReviewInput {
  organizationId: string;
  listingId: string;
  enrollmentId: string;
  rating: number;
  body?: string;
  createdAt?: string; // historical_backdating feature flag only
}

export async function createReview(session: SessionContext, input: CreateReviewInput): Promise<Review> {
  return db.withRequestContext(session, async (client) => {
    if (input.createdAt && !(await db.isOrgFeatureEnabled(input.organizationId, 'historical_backdating'))) {
      throw new FeatureDisabledError('historical_backdating');
    }

    const result = await client.query<Parameters<typeof mapReviewRow>[0]>(INSERT_REVIEW_SQL, [
      input.listingId,
      input.organizationId,
      session.userId,
      input.enrollmentId,
      input.rating,
      input.body ?? null,
      input.createdAt ?? null,
    ]);
    return mapReviewRow(result.rows[0]);
  });
}

export async function listOrgReviews(session: SessionContext, organizationId: string): Promise<Review[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapReviewRow>[0]>(LIST_ORG_REVIEWS_SQL, [organizationId]);
    return result.rows.map(mapReviewRow);
  });
}

export async function respondToReview(session: SessionContext, reviewId: string, orgResponse: string): Promise<Review> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapReviewRow>[0]>(RESPOND_TO_REVIEW_SQL, [orgResponse, reviewId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('respond to this review');
    return mapReviewRow(result.rows[0]);
  });
}

// ── Public (anonymous) reads ────────────────────────────────────────
// service-role + explicit filtering — no literal Postgres `anon` role in
// this app (migration 0013 header point 1).

// The "Wireframes - Marketplace.dc.html" reference doc shows a filter rail
// well beyond this phase's schema (radius search, availability, fee-model
// ranges, batch type, coach gender/language/experience) — it says so itself
// ("Filter set expanded well beyond the product... all backed by [a richer]
// existing data model"), none of which Doc 07 §11's literal marketplace
// schema (or this migration) has columns for. Search here supports exactly
// what `listings` stores: city, sport, area, free-text, featured-first
// ordering — same "built narrower than the full wireframe" precedent Phase
// 5's platform console already set. avgRating/reviewCount are a real
// aggregate over `reviews` (not stored denormalized on `listings`), computed
// per-query since search result sets are small (PAGE_SIZE = 20).

export interface PublicListingCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

export interface PublicListingSummary {
  slug: string;
  headline: string | null;
  cityKey: string;
  sportKeys: string[];
  priceDisplay: unknown;
  mediaPaths: string[] | null;
  featured: boolean;
  avgRating: number | null;
  reviewCount: number;
  category: PublicListingCategory | null;
  primarySubcategoryName: string | null;
  specialtyNames: string[];
  ageGroups: string[];
  skillLevels: string[];
}

// city/sport/area/q filter listings' own columns (unchanged); categoryId/
// subcategoryIds/ageGroups/skillLevels are the same category taxonomy
// coach search filters on (migration 0023) — same param shapes as
// GET /api/v1/public/coaches so /explore/academies can share
// /explore/search's filter-rail UI, not a lookalike with different values.
export interface SearchPublicListingsInput {
  city?: string;
  sport?: string;
  area?: string;
  q?: string;
  categoryId?: string;
  subcategoryIds?: string[];
  ageGroups?: string[];
  skillLevels?: string[];
  cursor?: string; // ISO published_at of the last row seen
}

const PAGE_SIZE = 20;

function nonEmpty<T>(arr: T[] | undefined): T[] | null {
  return arr && arr.length > 0 ? arr : null;
}

export async function searchPublicListings(input: SearchPublicListingsInput): Promise<{ listings: PublicListingSummary[]; nextCursor: string | null; categoryCounts: Record<string, number> }> {
  const client = await db.getServiceClient();
  try {
    // Counts per category under the currently active city/sport/area/q/
    // ageGroups/skillLevels filters, but NOT categoryId/subcategoryIds — so
    // the Academies filter rail can show "how many match everything else
    // I've picked" per category instead of a static global count that goes
    // stale (and contradicts a "0 found") the moment a city/age/skill filter
    // narrows the result set.
    const countsResult = await client.query<{ category_id: string; count: string }>(
      `select l.category_id, count(*) as count
       from listings l
       where l.status = 'live'
         and l.category_id is not null
         and ($1::text is null or l.city_key = $1)
         and ($2::text is null or $2 = any(l.sport_keys))
         and ($3::text is null or $3 = any(l.area_keys))
         and ($4::text is null or to_tsvector('english', coalesce(l.headline, '') || ' ' || coalesce(l.description, '')) @@ plainto_tsquery('english', $4))
         and ($5::text[] is null or l.age_groups && $5)
         and ($6::text[] is null or l.skill_levels && $6)
       group by l.category_id`,
      [
        input.city ?? null,
        input.sport ?? null,
        input.area ?? null,
        input.q ?? null,
        nonEmpty(input.ageGroups),
        nonEmpty(input.skillLevels),
      ]
    );
    const categoryCounts: Record<string, number> = {};
    for (const row of countsResult.rows) {
      categoryCounts[row.category_id] = Number(row.count);
    }

    const result = await client.query<{
      slug: string;
      headline: string | null;
      city_key: string;
      sport_keys: string[];
      price_display: unknown;
      media_paths: string[] | null;
      featured_until: string | null;
      published_at: string | null;
      age_groups: string[];
      skill_levels: string[];
      category_id: string | null;
      category_name: string | null;
      category_slug: string | null;
      category_icon: string | null;
      primary_subcategory_name: string | null;
      specialty_names: string[];
      avg_rating: string | null;
      review_count: string;
    }>(
      `select l.slug, l.headline, l.city_key, l.sport_keys, l.price_display, l.media_paths, l.featured_until, l.published_at,
              l.age_groups, l.skill_levels,
              cat.id as category_id, cat.name as category_name, cat.slug as category_slug, cat.icon as category_icon,
              primary_sub.name as primary_subcategory_name,
              coalesce(
                (select array_agg(s.name order by s.display_order) from subcategories s where s.id = any(l.subcategory_ids)),
                '{}'
              ) as specialty_names,
              avg(r.rating) as avg_rating, count(r.id) as review_count
       from listings l
       left join reviews r on r.listing_id = l.id and r.status = 'published'
       left join categories cat on cat.id = l.category_id
       left join subcategories primary_sub on primary_sub.id = l.primary_subcategory_id
       where l.status = 'live'
         and ($1::text is null or l.city_key = $1)
         and ($2::text is null or $2 = any(l.sport_keys))
         and ($3::text is null or $3 = any(l.area_keys))
         and ($4::text is null or to_tsvector('english', coalesce(l.headline, '') || ' ' || coalesce(l.description, '')) @@ plainto_tsquery('english', $4))
         and ($5::timestamptz is null or l.published_at < $5)
         and ($7::uuid is null or l.category_id = $7)
         and ($8::uuid[] is null or l.subcategory_ids && $8)
         and ($9::text[] is null or l.age_groups && $9)
         and ($10::text[] is null or l.skill_levels && $10)
       group by l.id, cat.id, primary_sub.id
       order by (l.featured_until is not null and l.featured_until > now()) desc, l.published_at desc nulls last
       limit $6`,
      [
        input.city ?? null,
        input.sport ?? null,
        input.area ?? null,
        input.q ?? null,
        input.cursor ?? null,
        PAGE_SIZE + 1,
        input.categoryId ?? null,
        nonEmpty(input.subcategoryIds),
        nonEmpty(input.ageGroups),
        nonEmpty(input.skillLevels),
      ]
    );
    const hasMore = result.rows.length > PAGE_SIZE;
    const rows = result.rows.slice(0, PAGE_SIZE);
    return {
      listings: rows.map((r) => ({
        slug: r.slug,
        headline: r.headline,
        cityKey: r.city_key,
        sportKeys: r.sport_keys,
        priceDisplay: r.price_display,
        mediaPaths: r.media_paths,
        featured: !!(r.featured_until && new Date(r.featured_until) > new Date()),
        avgRating: r.avg_rating === null ? null : Number(r.avg_rating),
        reviewCount: Number(r.review_count),
        category: r.category_id
          ? { id: r.category_id, name: r.category_name ?? '', slug: r.category_slug ?? '', icon: r.category_icon }
          : null,
        primarySubcategoryName: r.primary_subcategory_name,
        specialtyNames: r.specialty_names ?? [],
        ageGroups: r.age_groups ?? [],
        skillLevels: r.skill_levels ?? [],
      })),
      nextCursor: hasMore ? rows[rows.length - 1]?.published_at ?? null : null,
      categoryCounts,
    };
  } finally {
    client.release();
  }
}

export interface PublicListingDetail extends PublicListingSummary {
  description: string | null;
  areaKeys: string[] | null;
  organizationName: string;
}

export async function getPublicListing(slug: string): Promise<PublicListingDetail | null> {
  const client = await db.getServiceClient();
  try {
    const result = await client.query<{
      slug: string;
      headline: string | null;
      description: string | null;
      city_key: string;
      sport_keys: string[];
      area_keys: string[] | null;
      price_display: unknown;
      media_paths: string[] | null;
      featured_until: string | null;
      org_name: string;
      age_groups: string[];
      skill_levels: string[];
      category_id: string | null;
      category_name: string | null;
      category_slug: string | null;
      category_icon: string | null;
      primary_subcategory_name: string | null;
      specialty_names: string[];
      avg_rating: string | null;
      review_count: string;
    }>(
      `select l.slug, l.headline, l.description, l.city_key, l.sport_keys, l.area_keys, l.price_display, l.media_paths, l.featured_until, o.name as org_name,
              l.age_groups, l.skill_levels,
              cat.id as category_id, cat.name as category_name, cat.slug as category_slug, cat.icon as category_icon,
              primary_sub.name as primary_subcategory_name,
              coalesce(
                (select array_agg(s.name order by s.display_order) from subcategories s where s.id = any(l.subcategory_ids)),
                '{}'
              ) as specialty_names,
              avg(r.rating) as avg_rating, count(r.id) as review_count
       from listings l
       join organizations o on o.id = l.organization_id
       left join reviews r on r.listing_id = l.id and r.status = 'published'
       left join categories cat on cat.id = l.category_id
       left join subcategories primary_sub on primary_sub.id = l.primary_subcategory_id
       where l.slug = $1 and l.status = 'live'
       group by l.id, o.name, cat.id, primary_sub.id`,
      [slug]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      slug: row.slug,
      headline: row.headline,
      description: row.description,
      cityKey: row.city_key,
      sportKeys: row.sport_keys,
      areaKeys: row.area_keys,
      priceDisplay: row.price_display,
      mediaPaths: row.media_paths,
      featured: !!(row.featured_until && new Date(row.featured_until) > new Date()),
      avgRating: row.avg_rating === null ? null : Number(row.avg_rating),
      reviewCount: Number(row.review_count),
      organizationName: row.org_name,
      category: row.category_id
        ? { id: row.category_id, name: row.category_name ?? '', slug: row.category_slug ?? '', icon: row.category_icon }
        : null,
      primarySubcategoryName: row.primary_subcategory_name,
      specialtyNames: row.specialty_names ?? [],
      ageGroups: row.age_groups ?? [],
      skillLevels: row.skill_levels ?? [],
    };
  } finally {
    client.release();
  }
}

export interface PublicReview {
  authorLabel: string;
  rating: number;
  body: string | null;
  orgResponse: string | null;
  createdAt: string;
}

export async function getPublicListingReviews(slug: string): Promise<PublicReview[]> {
  const client = await db.getServiceClient();
  try {
    const result = await client.query<{ rating: number; body: string | null; org_response: string | null; created_at: string }>(
      `select r.rating, r.body, r.org_response, r.created_at
       from reviews r
       join listings l on l.id = r.listing_id
       where l.slug = $1 and l.status = 'live' and r.status = 'published'
       order by r.created_at desc`,
      [slug]
    );
    return result.rows.map((r) => ({
      authorLabel: 'Verified student',
      rating: r.rating,
      body: r.body,
      orgResponse: r.org_response,
      createdAt: r.created_at,
    }));
  } finally {
    client.release();
  }
}

export async function getPublicTaxonomy(): Promise<{ sports: TaxonomySport[]; cities: GeoCity[]; areas: GeoArea[] }> {
  const client = await db.getServiceClient();
  try {
    const sports = await client.query<{ key: string; label: string; category: string | null }>(LIST_SPORTS_SQL);
    const cities = await client.query<{ key: string; label: string; state: string | null }>(LIST_CITIES_SQL);
    const areas = await client.query<{ key: string; city_key: string; label: string }>(LIST_AREAS_SQL);
    return {
      sports: sports.rows,
      cities: cities.rows,
      areas: areas.rows.map((r) => ({ key: r.key, cityKey: r.city_key, label: r.label })),
    };
  } finally {
    client.release();
  }
}

// ── Referrals (BR4, US-8, Doc 07 §15) ────────────────────────────

export type ReferralStatus = 'created' | 'attributed' | 'rewarding' | 'completed' | 'rejected';

export interface Referral {
  id: string;
  referrerUserId: string;
  code: string;
  referredOrgId: string | null;
  rewardAmountMinor: number | null;
  status: ReferralStatus;
  createdAt: string;
}

function mapReferralRow(row: {
  id: string;
  referrer_user_id: string;
  code: string;
  referred_org_id: string | null;
  reward_amount_minor: string | number | null;
  status: ReferralStatus;
  created_at: string;
}): Referral {
  return {
    id: row.id,
    referrerUserId: row.referrer_user_id,
    code: row.code,
    referredOrgId: row.referred_org_id,
    rewardAmountMinor: row.reward_amount_minor === null ? null : Number(row.reward_amount_minor),
    status: row.status,
    createdAt: row.created_at,
  };
}

const REFERRAL_COLUMNS = `id, referrer_user_id, code, referred_org_id, reward_amount_minor, status, created_at`;
const INSERT_REFERRAL_SQL = `insert into referrals (referrer_user_id, code) values ($1, $2) returning ${REFERRAL_COLUMNS}`;
const LIST_MY_REFERRALS_SQL = `select ${REFERRAL_COLUMNS} from referrals where referrer_user_id = current_user_id() order by created_at desc`;
const ATTRIBUTE_REFERRAL_SQL = `update referrals set referred_org_id = $1 where code = $2 and referred_org_id is null returning ${REFERRAL_COLUMNS}`;

function generateReferralCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

// Any signed-in user may refer (Doc 04 §4 "any user", no permission gate,
// same identity-level-right shape as notification preferences).
export async function createReferral(session: SessionContext): Promise<Referral> {
  return db.withRequestContext(session, async (client) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await client.query<Parameters<typeof mapReferralRow>[0]>(INSERT_REFERRAL_SQL, [session.userId, generateReferralCode()]);
        return mapReferralRow(result.rows[0]);
      } catch (err) {
        if (attempt === 4 || !(err instanceof Error) || !err.message.includes('referrals_code_key')) throw err;
      }
    }
    throw new Error('[marketplace] Could not generate a unique referral code.');
  });
}

export async function listMyReferrals(session: SessionContext): Promise<Referral[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapReferralRow>[0]>(LIST_MY_REFERRALS_SQL);
    return result.rows.map(mapReferralRow);
  });
}

// RLS (referrals_update_attribution, migration 0013) requires the caller to
// be currently working in organizationId and hold org.settings.update;
// enforce_referral_attribution (same migration) independently rejects
// self/circular referrals (US-8 AC2) regardless of who's authorized to try.
export async function attributeReferral(session: SessionContext, code: string, organizationId: string): Promise<Referral> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapReferralRow>[0]>(ATTRIBUTE_REFERRAL_SQL, [organizationId, code]);
    if (result.rowCount === 0) throw new NotAuthorizedError('attribute this referral code');
    return mapReferralRow(result.rows[0]);
  });
}

const LIST_PLATFORM_REFERRALS_SQL = `select ${REFERRAL_COLUMNS} from referrals where status in ('attributed', 'rewarding') order by created_at`;
const SELECT_REFERRAL_SQL = `select ${REFERRAL_COLUMNS} from referrals where id = $1`;
const COMPLETE_REFERRAL_SQL = `update referrals set status = 'completed', reward_amount_minor = $1, completed_at = now(), updated_at = now() where id = $2 and status = 'attributed' returning ${REFERRAL_COLUMNS}`;

export async function listPlatformReferrals(session: SessionContext): Promise<Referral[]> {
  await assertPlatformPerm(session, 'platform.referral.manage', 'list referrals');
  const client = await db.getServiceClient();
  try {
    const result = await client.query<Parameters<typeof mapReferralRow>[0]>(LIST_PLATFORM_REFERRALS_SQL);
    return result.rows.map(mapReferralRow);
  } finally {
    client.release();
  }
}

// platform.referral.manage — manual reward approval (migration 0013 header
// point 6: no real subscription-billing event exists yet to derive the
// amount from, so staff enters it). Posts a balanced ledger group:
// platform_revenue debited, the referrer's user_referral account credited.
export async function approveReferralReward(session: SessionContext, referralId: string, amountMinor: number): Promise<Referral> {
  await assertPlatformPerm(session, 'platform.referral.manage', 'approve a referral reward');
  const client = await db.getServiceClient();
  let completed: Referral;
  try {
    const before = await client.query<Parameters<typeof mapReferralRow>[0]>(SELECT_REFERRAL_SQL, [referralId]);
    const referral = before.rows[0] ? mapReferralRow(before.rows[0]) : null;
    if (!referral || referral.status !== 'attributed') throw new NotAuthorizedError('approve a reward for this referral');

    const result = await client.query<Parameters<typeof mapReferralRow>[0]>(COMPLETE_REFERRAL_SQL, [amountMinor, referralId]);
    completed = mapReferralRow(result.rows[0]);

    const platformAccount = await client.query<{ get_or_create_platform_ledger_account: string }>('select get_or_create_platform_ledger_account($1)', ['platform_revenue']);
    const userAccount = await client.query<{ get_or_create_user_ledger_account: string }>('select get_or_create_user_ledger_account($1, $2)', [referral.referrerUserId, 'user_referral']);
    await client.query('select post_ledger_entries($1)', [
      JSON.stringify([
        { accountId: platformAccount.rows[0].get_or_create_platform_ledger_account, amountMinor: -amountMinor, currency: 'INR', refType: 'referral', refId: referralId },
        { accountId: userAccount.rows[0].get_or_create_user_ledger_account, amountMinor, currency: 'INR', refType: 'referral', refId: referralId },
      ]),
    ]);
  } finally {
    client.release();
  }

  // Audit logging (Doc 07 §16) — retrofitted here, unlike the rest of this
  // file's writes (every other module's documented not-yet-retrofitted
  // precedent), because it's a platform-staff financial action — the same
  // category platform-admin already audits (org verify/reject etc.).
  await writeAuditLog(session, {
    action: 'platform.referral.approve_reward',
    targetType: 'referral',
    targetId: referralId,
    detail: { amountMinor },
  });
  return completed;
}
