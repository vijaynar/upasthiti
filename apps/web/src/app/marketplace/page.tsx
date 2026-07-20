'use client';

// Marketplace console (Doc 07 §11, Doc 04 §5 "Marketplace listing & leads"
// row) — staff view for the active workspace: the org's single listing
// (edit + publish/pause/remove), the leads inbox (triage), and reviews
// (respond only — no flag/remove, out of scope per the RBAC matrix).
// Mirrors /finance/notifications's plain-fetch client component style.

import { useEffect, useState } from 'react';
import { Store, Users2, MessageSquareText, ExternalLink } from 'lucide-react';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

type ListingStatus = 'draft' | 'pending_verification' | 'live' | 'paused' | 'removed';
type LeadStatus = 'new' | 'contacted' | 'trial_scheduled' | 'converted' | 'lost';

interface Listing {
  id: string;
  slug: string;
  status: ListingStatus;
  headline: string | null;
  description: string | null;
  sportKeys: string[];
  cityKey: string;
  areaKeys: string[] | null;
}

interface Lead {
  id: string;
  contactName: string;
  contactPhone: string;
  message: string | null;
  source: string | null;
  status: LeadStatus;
  assignedTo: string | null;
  createdAt: string;
}

interface Review {
  id: string;
  authorUserId: string;
  rating: number;
  body: string | null;
  orgResponse: string | null;
  status: string;
  createdAt: string;
}

interface Sport {
  key: string;
  label: string;
}

interface City {
  key: string;
  label: string;
}

const LISTING_STATUS_COLORS: Record<ListingStatus, string> = {
  draft: 'bg-neutral-200 text-neutral-700',
  pending_verification: 'bg-amber-100 text-amber-700',
  live: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-blue-100 text-blue-700',
  removed: 'bg-red-100 text-red-700',
};

const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'trial_scheduled', 'converted', 'lost'];

export default function MarketplacePage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [listing, setListing] = useState<Listing | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
    api<{ sports: Sport[]; cities: City[] }>('/api/v1/public/taxonomy').then((t) => {
      setSports(t.sports);
      setCities(t.cities);
    }).catch(() => {});
  }, []);

  function reloadAll() {
    if (!orgId) return;
    api<Listing | null>(`/api/v1/orgs/${orgId}/listing`).then(setListing).catch((err) => setError(err.message));
    api<Lead[]>(`/api/v1/orgs/${orgId}/leads`).then(setLeads).catch(() => {});
    api<Review[]>(`/api/v1/orgs/${orgId}/reviews`).then(setReviews).catch(() => {});
  }

  useEffect(reloadAll, [orgId]);

  async function run(action: () => Promise<unknown>, successMsg?: string) {
    setError(null);
    try {
      await action();
      if (successMsg) setNotice(successMsg);
      reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  if (orgId === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (orgId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-sm space-y-2 rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <Store className="mx-auto h-8 w-8 text-neutral-300" />
          <h1 className="text-lg font-semibold text-neutral-900">Marketplace</h1>
          <p className="text-sm text-neutral-500">Pick an active workspace first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-neutral-900">
            <Store className="h-5 w-5 text-neutral-500" /> Marketplace
          </h1>
          <p className="text-sm text-neutral-500">Your public listing, incoming leads, and reviews.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

        <ListingSection orgId={orgId} listing={listing} sports={sports} cities={cities} run={run} />
        <LeadsSection orgId={orgId} leads={leads} run={run} />
        <ReviewsSection orgId={orgId} reviews={reviews} run={run} />
      </div>
    </div>
  );
}

function ListingSection({
  orgId,
  listing,
  sports,
  cities,
  run,
}: {
  orgId: string;
  listing: Listing | null;
  sports: Sport[];
  cities: City[];
  run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void>;
}) {
  const [slug, setSlug] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [cityKey, setCityKey] = useState('');
  const [sportKeys, setSportKeys] = useState<string[]>([]);

  useEffect(() => {
    if (listing) {
      setSlug(listing.slug);
      setHeadline(listing.headline ?? '');
      setDescription(listing.description ?? '');
      setCityKey(listing.cityKey);
      setSportKeys(listing.sportKeys);
    }
  }, [listing]);

  function toggleSport(key: string) {
    setSportKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function save() {
    await run(
      () =>
        api(`/api/v1/orgs/${orgId}/listing`, {
          method: 'PATCH',
          body: JSON.stringify({
            slug: listing ? undefined : slug.trim().toLowerCase(),
            headline,
            description,
            cityKey,
            sportKeys,
          }),
        }),
      'Listing saved.'
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Listing</h2>
        {listing && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LISTING_STATUS_COLORS[listing.status]}`}>{listing.status.replace('_', ' ')}</span>
        )}
      </div>

      <div className="space-y-2">
        {!listing && (
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="URL slug (e.g. my-academy)" className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none" />
        )}
        <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline" className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none" />

        <select value={cityKey} onChange={(e) => setCityKey(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none">
          <option value="">City…</option>
          {cities.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

        <div className="flex flex-wrap gap-1.5">
          {sports.map((s) => (
            <button
              key={s.key}
              onClick={() => toggleSport(s.key)}
              className={`rounded-full border px-2.5 py-1 text-xs ${sportKeys.includes(s.key) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={save} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800">
            Save
          </button>
          {listing && listing.status !== 'live' && (
            <button onClick={() => run(() => api(`/api/v1/orgs/${orgId}/listing/publish`, { method: 'POST' }), 'Listing published.')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
              Publish
            </button>
          )}
          {listing && listing.status === 'live' && (
            <button onClick={() => run(() => api(`/api/v1/orgs/${orgId}/listing/pause`, { method: 'POST' }), 'Listing paused.')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
              Pause
            </button>
          )}
          {listing && listing.status === 'live' && (
            <a href={`/explore/${listing.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-neutral-500 hover:underline">
              View public page <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function LeadsSection({ orgId, leads, run }: { orgId: string; leads: Lead[]; run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void> }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <Users2 className="h-4 w-4 text-neutral-500" /> Leads
      </h2>
      <div className="space-y-2">
        {leads.length === 0 && <p className="text-sm text-neutral-400">No leads yet.</p>}
        {leads.map((lead) => (
          <div key={lead.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 p-2.5 text-sm">
            <div>
              <p className="font-medium text-neutral-900">{lead.contactName}</p>
              <p className="text-xs text-neutral-500">{lead.contactPhone}{lead.message ? ` · ${lead.message}` : ''}</p>
            </div>
            <select
              value={lead.status}
              onChange={(e) => run(() => api(`/api/v1/orgs/${orgId}/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }))}
              className="rounded-lg border border-neutral-300 px-2 py-1 text-xs outline-none"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewsSection({ orgId, reviews, run }: { orgId: string; reviews: Review[]; run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <MessageSquareText className="h-4 w-4 text-neutral-500" /> Reviews
      </h2>
      <div className="space-y-3">
        {reviews.length === 0 && <p className="text-sm text-neutral-400">No reviews yet.</p>}
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border border-neutral-100 p-2.5 text-sm">
            <p className="font-medium text-neutral-900">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
            {review.body && <p className="mt-1 text-neutral-700">{review.body}</p>}
            {review.orgResponse ? (
              <p className="mt-2 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600"><strong>Your response:</strong> {review.orgResponse}</p>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  value={drafts[review.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [review.id]: e.target.value }))}
                  placeholder="Respond…"
                  className="flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs outline-none"
                />
                <button
                  onClick={() =>
                    run(() => api(`/api/v1/orgs/${orgId}/reviews/${review.id}/respond`, { method: 'POST', body: JSON.stringify({ orgResponse: drafts[review.id] ?? '' }) }), 'Response posted.')
                  }
                  className="rounded-lg bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
                >
                  Post
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
