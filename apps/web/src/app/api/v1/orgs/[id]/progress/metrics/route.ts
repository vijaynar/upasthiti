// GET/POST /api/v1/orgs/{id}/progress/metrics — list metric definitions (platform library + org-custom) / create an org-custom metric
import type { NextRequest } from 'next/server';
import { listMetricDefinitions, createMetricDefinition, type MetricDirection } from '@abhyas/module-progress';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const DIRECTIONS: MetricDirection[] = ['higher_better', 'lower_better'];

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const sport = new URL(req.url).searchParams.get('sport') ?? undefined;
  return jsonData(await listMetricDefinitions(session, sport));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  if (!key || !label) return jsonError('invalid_request', 'key and label are required.', 400);
  const direction = DIRECTIONS.includes(body?.direction) ? (body.direction as MetricDirection) : null;

  try {
    const metric = await createMetricDefinition(session, {
      organizationId: id,
      sportKey: typeof body?.sportKey === 'string' ? body.sportKey : undefined,
      key,
      label,
      unit: typeof body?.unit === 'string' ? body.unit : undefined,
      direction,
    });
    return jsonData(metric, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to define metrics here.', 403);
    throw err;
  }
}
