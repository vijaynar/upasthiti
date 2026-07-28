// audit module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: audit_log; written by every privileged action across all modules, not a standalone feature (M15, Doc 07 §16)
// Target phase: Phase 4+ — cross-cutting (see the implementation roadmap).
//
// writeAuditLog() is a thin wrapper over migration 0007's write_audit_log()
// SQL function (SECURITY DEFINER) — actor_user_id is always current_user_id(),
// never a caller-supplied value, so this can't be used to forge who did what.
// Only Phase 5's own write paths (platform-admin) call this so far; retrofitting
// Phase 2-4 call sites (role grants, invitation accept, join-request decide) is
// a known gap — see IMPLEMENTATION_STATUS.md Phase 5 "Known gaps".

import { db } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';

export interface AuditEventInput {
  action: string; // permission-key style, e.g. 'platform_role.grant'
  targetType?: string | null;
  targetId?: string | null;
  organizationId?: string | null; // null = platform-scope action
  detail?: Record<string, unknown> | null;
  supportGrantId?: string | null;
}

export async function writeAuditLog(session: SessionContext, event: AuditEventInput): Promise<string> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ id: string }>(
      `select write_audit_log($1, $2, $3, $4, $5, $6) as id`,
      [
        event.action,
        event.targetType ?? null,
        event.targetId ?? null,
        event.organizationId ?? null,
        event.detail ?? null,
        event.supportGrantId ?? null,
      ]
    );
    return result.rows[0].id;
  });
}

export interface AuditLogEntry {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  orgName: string | null;
  supportGrantId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  occurredAt: string;
}

export interface ListAuditLogInput {
  organizationId?: string; // omit for the platform-wide view (requires platform.audit.read; RLS enforces)
  limit?: number;
}

// RLS (migration 0007's audit_log_select_visible) is the real gate: an
// org-scoped caller only ever sees rows where organization_id = current_org()
// and they hold audit.log.read; a platform caller with platform.audit.read
// sees everything, filtered here by organizationId when given.
export async function listAuditLog(session: SessionContext, input: ListAuditLogInput = {}): Promise<AuditLogEntry[]> {
  return db.withRequestContext(session, async (client) => {
    const limit = Math.min(input.limit ?? 200, 500);
    const result = await client.query<{
      id: string;
      organization_id: string | null;
      actor_user_id: string | null;
      actor_name: string | null;
      actor_email: string | null;
      org_name: string | null;
      support_grant_id: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      detail: Record<string, unknown> | null;
      occurred_at: string;
    }>(
      input.organizationId
        ? `select a.id, a.organization_id, a.actor_user_id, a.support_grant_id, a.action, a.target_type, a.target_id, a.detail, a.occurred_at,
                  u.display_name as actor_name,
                  (select am.verified_identifier from auth_methods am where am.user_id = a.actor_user_id and am.provider = 'email_otp' order by am.verified_at desc nulls last limit 1) as actor_email,
                  o.name as org_name
           from audit_log a
           left join users u on u.id = a.actor_user_id
           left join organizations o on o.id = a.organization_id
           where a.organization_id = $1 order by a.occurred_at desc limit $2`
        : `select a.id, a.organization_id, a.actor_user_id, a.support_grant_id, a.action, a.target_type, a.target_id, a.detail, a.occurred_at,
                  u.display_name as actor_name,
                  (select am.verified_identifier from auth_methods am where am.user_id = a.actor_user_id and am.provider = 'email_otp' order by am.verified_at desc nulls last limit 1) as actor_email,
                  o.name as org_name
           from audit_log a
           left join users u on u.id = a.actor_user_id
           left join organizations o on o.id = a.organization_id
           order by a.occurred_at desc limit $1`,
      input.organizationId ? [input.organizationId, limit] : [limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      actorUserId: row.actor_user_id,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      orgName: row.org_name,
      supportGrantId: row.support_grant_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      detail: row.detail,
      occurredAt: row.occurred_at,
    }));
  });
}
