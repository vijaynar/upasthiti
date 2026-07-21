// GET /api/v1/me/progress/metrics — metric definitions visible to the caller
// for labelling their own / a ward's trends. Works with no active workspace:
// metric_definitions_select returns the platform library (organization_id
// null) to any authenticated user, plus the active org's custom metrics if
// one is selected. Used by /me/progress and the /family ward view so labels
// resolve even for a student/guardian who isn't a member of any org.
import type { NextRequest } from 'next/server';
import { listMetricDefinitions } from '@abhyas/module-progress';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const sport = new URL(req.url).searchParams.get('sport') ?? undefined;
  return jsonData(await listMetricDefinitions(session, sport));
}
