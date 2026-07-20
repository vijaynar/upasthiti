// POST /api/v1/orgs/{id}/join-requests/{reqId}/decide (Doc 02 §9)
import type { NextRequest } from 'next/server';
import { decideJoinRequest, listBranches, JoinRequestInvalidError } from '@abhyas/module-tenancy-rbac';
import { enrollStudent } from '@abhyas/module-people';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; reqId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { reqId } = await params;
  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  const note = typeof body?.note === 'string' ? body.note : undefined;

  if (decision !== 'approved' && decision !== 'rejected') {
    return jsonError('invalid_request', 'decision must be approved or rejected.', 400);
  }

  try {
    const result = await decideJoinRequest(session, reqId, decision, note);

    // Doc 02 §9: an approved student join request should result in an
    // actual enrollment, not just a bare membership — this module wiring
    // (not tenancy-rbac, which stays People-agnostic, Doc 14 §2 rule 2) is
    // the People module's own stated scope ("join-request approval
    // workflows", packages/modules/people/README.md). Org-wide requests
    // (branchId null) enroll into the org's Main branch since
    // enrollments.branch_id is NOT NULL (Doc 07 §6).
    if (result.approved && result.requestedRole === 'student') {
      let branchId = result.branchId;
      if (!branchId) {
        const branches = await listBranches(session, result.organizationId);
        branchId = (branches.find((b) => b.name === 'Main') ?? branches[0])?.id ?? null;
      }
      if (branchId) {
        await enrollStudent(session, {
          organizationId: result.organizationId,
          branchId,
          studentUserId: result.subjectUserId,
          startedOn: new Date().toISOString().slice(0, 10),
        });
      }
    }

    return jsonData({ decided: true });
  } catch (err) {
    if (err instanceof JoinRequestInvalidError) return jsonError('join_request_invalid', err.message, 409);
    throw err;
  }
}
