'use client';

// Shared active-workspace state for every consumer under (app)/layout.tsx —
// AppShell's sidebar and the /workspace picker page both read/write this one
// source of truth instead of each keeping its own local copy (which used to
// let them disagree about which org was active, and made switching require a
// full page reload just to force every consumer back in sync).

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface Membership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  orgType: string;
  orgStatus: string;
  branchId: string | null;
  status: string;
}

async function api<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data as T;
  } catch {
    return null;
  }
}

interface WorkspaceContextValue {
  loading: boolean;
  memberships: Membership[];
  activeOrg: Membership | null;
  switchWorkspace: (organizationId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeOrg, setActiveOrg] = useState<Membership | null>(null);

  useEffect(() => {
    (async () => {
      const [w, orgs] = await Promise.all([
        api<{ activeOrgId: string | null }>('/api/v1/me/workspace'),
        api<Membership[]>('/api/v1/orgs'),
      ]);
      // Auto-select the first membership when the user has no active workspace
      // (e.g. a coach who just signed in for the first time).
      let activeOrgId = w?.activeOrgId ?? null;
      if (!activeOrgId && orgs && orgs.length > 0) {
        const firstOrg = orgs[0];
        try {
          await fetch('/api/v1/me/workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgId: firstOrg.organizationId }),
          });
          activeOrgId = firstOrg.organizationId;
        } catch {
          // best-effort; if the switch fails, fall through to no-workspace state
        }
      }
      setMemberships(orgs ?? []);
      setActiveOrg(activeOrgId ? orgs?.find((o) => o.organizationId === activeOrgId) ?? null : null);
      setLoading(false);
    })();
  }, []);

  const switchWorkspace = useCallback(async (organizationId: string) => {
    const res = await fetch('/api/v1/me/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: organizationId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? 'Could not switch workspace.');
    }
    setActiveOrg((prev) => memberships.find((m) => m.organizationId === organizationId) ?? prev);
  }, [memberships]);

  return (
    <WorkspaceContext.Provider value={{ loading, memberships, activeOrg, switchWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
