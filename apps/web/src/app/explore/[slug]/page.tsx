'use client';

// Listing detail page (Doc 08 §10 `GET /public/listings/{slug}` + `/reviews`)
// — styled after wireframe frames 4b (detail), 4c (lead capture modal), 4d
// (confirmation + soft account nudge). Reviews come only from students with
// a real enrollment (reviews_insert_self RLS, migration 0013) — the ops↔
// marketplace flywheel the wireframe's note calls out, so ratings can't be
// gamed. The wireframe also shows "Send a message"/"Show phone" CTAs and a
// live batches/timings section; neither has backing data in this phase
// (listings has no public phone field, and pulling live Scheduling batch
// data into a public anonymous page is out of scope here) — only "Request a
// trial" (the real lead-capture flow) is wired up.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Star, ArrowLeft, X, CheckCircle2 } from 'lucide-react';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface ListingDetail {
  slug: string;
  headline: string | null;
  description: string | null;
  cityKey: string;
  sportKeys: string[];
  priceDisplay: unknown;
  featured: boolean;
  avgRating: number | null;
  reviewCount: number;
  organizationName: string;
}

interface Review {
  authorLabel: string;
  rating: number;
  body: string | null;
  orgResponse: string | null;
  createdAt: string;
}

function priceLabel(priceDisplay: unknown): string | null {
  if (priceDisplay && typeof priceDisplay === 'object' && 'amountMinor' in (priceDisplay as Record<string, unknown>)) {
    const amountMinor = (priceDisplay as { amountMinor?: number }).amountMinor;
    const per = (priceDisplay as { per?: string }).per ?? 'mo';
    if (typeof amountMinor === 'number') return `₹${(amountMinor / 100).toLocaleString('en-IN')}/${per}`;
  }
  return null;
}

export default function ListingDetailPage() {
  const params = useParams<{ slug: string }>();
  const [listing, setListing] = useState<ListingDetail | null | undefined>(undefined);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    api<ListingDetail | null>(`/api/v1/public/listings/${params.slug}`).then(setListing).catch(() => setListing(null));
    api<Review[]>(`/api/v1/public/listings/${params.slug}/reviews`).then(setReviews).catch(() => {});
  }, [params.slug]);

  if (listing === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0eee9]">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (listing === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f0eee9] px-4 text-center">
        <p className="text-sm font-medium text-neutral-700">This listing isn&apos;t available.</p>
        <a href="/explore" className="text-sm text-blue-600 hover:underline">← Back to search</a>
      </div>
    );
  }

  const price = priceLabel(listing.priceDisplay);

  return (
    <div className="min-h-screen bg-[#f0eee9] pb-16">
      <div className="border-b border-neutral-900/10 bg-white px-4 py-3">
        <a href="/explore" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> Back to search
        </a>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="h-32 rounded-t-xl bg-gradient-to-br from-neutral-200 to-neutral-100" />
        <div className="rounded-b-xl border border-t-0 border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-neutral-900">{listing.headline ?? listing.slug}</h1>
                {listing.featured && (
                  <span className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">★ Featured</span>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-500">{listing.organizationName}</p>
              <p className="mt-1 flex items-center gap-3 text-sm text-neutral-600">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {listing.cityKey}</span>
                {listing.avgRating !== null && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {listing.avgRating.toFixed(1)} · {listing.reviewCount} reviews
                  </span>
                )}
              </p>
            </div>
            {price && <div className="text-lg font-semibold text-neutral-900">{price}</div>}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {listing.sportKeys.map((key) => (
              <span key={key} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{key}</span>
            ))}
          </div>

          {listing.description && (
            <div className="mt-4 border-t border-neutral-100 pt-4">
              <h2 className="mb-1 text-sm font-semibold text-neutral-900">About</h2>
              <p className="text-sm text-neutral-700">{listing.description}</p>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2 rounded-lg bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-neutral-900">Interested?</p>
            <button onClick={() => setModalOpen(true)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
              Request a trial class
            </button>
            <p className="text-xs text-neutral-500">No account needed — leave your number and they&apos;ll call you back.</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">Reviews ({reviews.length})</h2>
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">only enrolled students can review</span>
          </div>
          <div className="mt-3 space-y-3">
            {reviews.length === 0 && <p className="text-sm text-neutral-400">No reviews yet.</p>}
            {reviews.map((review, i) => (
              <div key={i} className="border-t border-neutral-100 pt-3 first:border-0 first:pt-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-neutral-800">{review.authorLabel}</span>
                  <span className="flex text-amber-400">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                </div>
                {review.body && <p className="mt-1 text-sm text-neutral-600">{review.body}</p>}
                {review.orgResponse && (
                  <p className="mt-2 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600"><strong>Response:</strong> {review.orgResponse}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalOpen && <LeadModal slug={listing.slug} headline={listing.headline ?? listing.slug} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function LeadModal({ slug, headline, onClose }: { slug: string; headline: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!name.trim() || !phone.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api('/api/v1/public/leads', {
        method: 'POST',
        body: JSON.stringify({ listingSlug: slug, name: name.trim(), phone: phone.trim(), message: message.trim() || undefined }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        {!sent ? (
          <>
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <p className="text-sm font-semibold text-neutral-900">Request a trial</p>
              <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-xs text-neutral-500">{headline}</p>
              {error && <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>}
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Phone (WhatsApp)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Anything to add?</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none" />
              </div>
              <button
                onClick={submit}
                disabled={sending || !name.trim() || !phone.trim()}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send request'}
              </button>
              <p className="text-[11px] text-neutral-400">Your number is shared only with this listing&apos;s org.</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-base font-semibold text-neutral-900">Request sent</p>
            <p className="text-sm text-neutral-500">They usually reply within a day. We&apos;ll text you when they respond.</p>
            <div className="mt-2 w-full rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-neutral-600">
              Want to track your enquiries?
              <a href="/auth/login" className="mt-2 block rounded-lg border border-neutral-300 py-1.5 text-center text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                Create free account
              </a>
            </div>
            <button onClick={onClose} className="text-sm text-neutral-500 hover:underline">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
