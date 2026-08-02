// Shared types for the Students page (page.tsx, AddStudentModal, StudentDrawer).

export interface Branch {
  id: string;
  name: string;
  status: string;
}

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface BatchRef {
  batchId: string;
  batchName: string;
}

export interface DetailedEnrollment {
  id: string;
  organizationId: string;
  branchId: string;
  studentUserId: string;
  status: EnrollmentStatus;
  rollNumber: string | null;
  profile: Record<string, unknown>;
  startedOn: string;
  endedOn: string | null;
  studentDisplayName: string;
  studentAvatarPath: string | null;
  studentDob: string | null;
  studentGender: string | null;
  studentPhone: string | null;
  batches: BatchRef[];
}

export type FeeStatus = 'no_dues' | 'paid' | 'pending' | 'overdue';

export interface FeeStatusEntry {
  enrollmentId: string;
  feeStatus: FeeStatus;
  nextDueOn: string | null;
  amountDueMinor: number;
}

export interface FaceBioStatusEntry {
  enrollmentId: string;
  enrolled: boolean;
}

export interface JoinRequest {
  id: string;
  branchId: string | null;
  requesterUserId: string;
  subjectUserId: string;
  subjectDisplayName: string | null;
  subjectAvatarPath: string | null;
  requestedRole: string;
  status: string;
  createdAt: string;
}

export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function formatMinor(amountMinor: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : currency + ' ';
  return `${symbol}${(amountMinor / 100).toLocaleString('en-IN')}`;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  // A route that throws an error the handler didn't anticipate (e.g. a raw
  // Postgres/trigger error, not one of the specific cases the route checks
  // for) reaches the browser as a 500 with no JSON body — res.json() itself
  // throws "Unexpected end of JSON input" in that case, which is a real
  // failure but a useless message. Fall back to the HTTP status instead of
  // letting that parse error surface as-is.
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Something went wrong (HTTP ${res.status}).`);
  return body.data as T;
}
