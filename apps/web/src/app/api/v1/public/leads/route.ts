// POST /api/v1/public/leads { listingSlug, name, phone, message } —
// anonymous, the only anonymous write in this API (Doc 08 §10). No
// captcha/rate-limit — see marketplace/src/service.ts's header, a
// documented known gap (no vendor configured), not a silent skip.
import type { NextRequest } from 'next/server';
import { submitPublicLead, NotFoundError } from '@abhyas/module-marketplace';
import { jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const listingSlug = typeof body?.listingSlug === 'string' ? body.listingSlug : '';
  const contactName = typeof body?.name === 'string' ? body.name.trim() : '';
  const contactPhone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const message = typeof body?.message === 'string' ? body.message : undefined;

  if (!listingSlug) return jsonError('invalid_request', 'listingSlug is required.', 400);
  if (!contactName) return jsonError('invalid_request', 'name is required.', 400);
  if (!contactPhone) return jsonError('invalid_request', 'phone is required.', 400);

  try {
    const lead = await submitPublicLead({ listingSlug, contactName, contactPhone, message });
    return jsonData(lead, 201);
  } catch (err) {
    if (err instanceof NotFoundError) return jsonError('not_found', 'No live listing with that URL.', 404);
    throw err;
  }
}
