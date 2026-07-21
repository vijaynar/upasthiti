// GET /api/v1/orgs/{id}/leave-requests?status=pending — list leave requests staff/admins can see
import type { NextRequest } from 'next/server';
import { listLeaveRequests, type LeaveStatus } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const LEAVE_STATUSES: LeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const statusParam = new URL(req.url).searchParams.get('status');
  const status = LEAVE_STATUSES.includes(statusParam as LeaveStatus) ? (statusParam as LeaveStatus) : undefined;
  return jsonData(await listLeaveRequests(session, id, status));
}
