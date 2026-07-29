'use client';

// Marketplace console (Doc 07 §11, Doc 04 §5 "Marketplace listing & leads"
// row) — staff view for the active workspace: the org's single listing
// (edit + publish/pause/remove), the leads inbox (triage), and reviews
// (respond only — no flag/remove, out of scope per the RBAC matrix).
// Mirrors /finance/notifications's plain-fetch client component style.

import { useEffect, useState } from 'react';
import { Store, Users2, MessageSquareText, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

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
  draft: 'bg-white/10 text-slate-300 border border-white/10',
  pending_verification: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  live: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  paused: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  removed: 'bg-red-500/20 text-red-300 border border-red-500/30',
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
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (orgId === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="glass-panel max-w-sm space-y-2 rounded-xl p-8 text-center">
          <Store className="mx-auto h-8 w-8 text-indigo-400" />
          <h1 className="text-lg font-semibold text-white">Marketplace</h1>
          <p className="text-sm text-slate-400">Pick an active workspace first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader badge="Marketplace" badgeIcon={Store} title="Marketplace" description="Your public listing, incoming leads, and reviews." />

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">{notice}</div>}

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
    <section className="glass-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Listing</h2>
        {listing && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LISTING_STATUS_COLORS[listing.status]}`}>{listing.status.replace('_', ' ')}</span>
        )}
      </div>

      <div className="space-y-2">
        {!listing && (
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="URL slug (e.g. my-academy)" className="glass-input w-full rounded-lg px-3 py-1.5 text-sm" />
        )}
        <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline" className="glass-input w-full rounded-lg px-3 py-1.5 text-sm" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="glass-input w-full rounded-lg px-3 py-1.5 text-sm" />

        <select value={cityKey} onChange={(e) => setCityKey(e.target.value)} className="glass-input rounded-lg px-3 py-1.5 text-sm">
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
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${sportKeys.includes(s.key) ? 'bg-indigo-600 text-white border-indigo-500' : 'border-white/10 bg-white/5 text-slate-400'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={save} className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold">
            Save
          </button>
          {listing && listing.status !== 'live' && (
            <button onClick={() => run(() => api(`/api/v1/orgs/${orgId}/listing/publish`, { method: 'POST' }), 'Listing published.')} className="btn-secondary rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10">
              Publish
            </button>
          )}
          {listing && listing.status === 'live' && (
            <button onClick={() => run(() => api(`/api/v1/orgs/${orgId}/listing/pause`, { method: 'POST' }), 'Listing paused.')} className="btn-secondary rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10">
              Pause
            </button>
          )}
          {listing && listing.status === 'live' && (
            <a href={`/explore/${listing.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-slate-400 hover:text-white hover:underline">
              View public page <ExternalLink className="h-3 w-3 text-indigo-400" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function LeadsSection({ orgId, leads, run }: { orgId: string; leads: Lead[]; run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void> }) {
  return (
    <section className="glass-panel rounded-xl p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Users2 className="h-4 w-4 text-indigo-400" /> Leads
      </h2>
      <div className="space-y-2">
        {leads.length === 0 && <p className="text-sm text-slate-400">No leads yet.</p>}
        {leads.map((lead) => (
          <div key={lead.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm">
            <div>
              <p className="font-medium text-slate-100">{lead.contactName}</p>
              <p className="text-xs text-slate-400">{lead.contactPhone}{lead.message ? ` · ${lead.message}` : ''}</p>
            </div>
            <select
              value={lead.status}
              onChange={(e) => run(() => api(`/api/v1/orgs/${orgId}/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }))}
              className="glass-input rounded-lg px-2 py-1 text-xs"
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
    <section className="glass-panel rounded-xl p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <MessageSquareText className="h-4 w-4 text-indigo-400" /> Reviews
      </h2>
      <div className="space-y-3">
        {reviews.length === 0 && <p className="text-sm text-slate-400">No reviews yet.</p>}
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm">
            <p className="font-medium text-amber-400">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
            {review.body && <p className="mt-1 text-slate-200">{review.body}</p>}
            {review.orgResponse ? (
              <p className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-slate-300"><strong>Your response:</strong> {review.orgResponse}</p>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  value={drafts[review.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [review.id]: e.target.value }))}
                  placeholder="Respond…"
                  className="glass-input flex-1 rounded-lg px-2 py-1 text-xs"
                />
                <button
                  onClick={() =>
                    run(() => api(`/api/v1/orgs/${orgId}/reviews/${review.id}/respond`, { method: 'POST', body: JSON.stringify({ orgResponse: drafts[review.id] ?? '' }) }), 'Response posted.')
                  }
                  className="btn-premium rounded-lg px-2.5 py-1 text-xs font-semibold"
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
