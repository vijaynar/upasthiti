import AppShell from '@/components/AppShell';
import { WorkspaceProvider } from '@/lib/workspace';

// Shared across every authenticated route segment in this group (dashboard,
// people, scheduling, attendance, progress, finance, staff, marketplace,
// notifications, me, family, workspace, platform) so AppShell mounts once
// and persists across navigation instead of remounting per segment — each
// used to have its own layout.tsx wrapping AppShell independently, which
// made React tear down and rebuild the whole sidebar (and refetch /me,
// /orgs, roles, permissions) on every nav click, flickering as sections
// toggled visibility while that data reloaded.
//
// WorkspaceProvider sits above AppShell so the sidebar and the /workspace
// picker page (both descendants) share one active-org state instead of each
// fetching and holding their own copy.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
