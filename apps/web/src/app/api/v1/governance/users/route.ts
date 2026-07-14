// GET    /api/v1/governance/users  — List academy users
// POST   /api/v1/governance/users  — Create/invite a user
// PUT    /api/v1/governance/users  — Update user role or profile
// DELETE /api/v1/governance/users  — Deactivate/remove a user

import { getAuthContext, adminDb, ok, err, created, logAuditEvent, hasPermission } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!await hasPermission(ctx, 'users', 'view')) return err('Forbidden', 403);

    const db = adminDb();
    let query = db
      .from('users')
      .select('id, email, first_name, last_name, role, role_id, phone, is_active, avatar_url, created_at, roles(name), tenants(name)')
      .order('created_at', { ascending: false });

    if (ctx.role !== 'superadmin') {
      query = query.eq('tenant_id', ctx.tenantId);
    } else {
      query = query.in('role', ['admin', 'superadmin']);
    }

    const { data: users, error: usersErr } = await query;

    if (usersErr) throw usersErr;

    return ok({ users: users ?? [] });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!await hasPermission(ctx, 'users', 'create')) return err('Forbidden', 403);

    const { email, password, firstName, lastName, phone, role, roleId } = await req.json();
    if (!email || !password || !firstName || !lastName || !role) {
      return err('email, password, firstName, lastName, and role are required.', 422);
    }
    if (role === 'coach') {
      return err('Coach accounts must be created via POST /api/v1/coaches ("Onboard New Coach") — that flow creates the required coaches profile row atomically with the user.', 422);
    }

    const db = adminDb();

    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { tenant_id: ctx.tenantId, role },
      user_metadata: { first_name: firstName, last_name: lastName },
    });
    if (authErr) {
      if (authErr.message.includes('already registered')) return err('A user with this email already exists.', 409);
      throw authErr;
    }

    const { error: profileErr } = await db.from('users').insert({
      id: authData.user.id,
      tenant_id: ctx.tenantId,
      email,
      role,
      role_id: roleId ?? null,
      first_name: firstName,
      last_name: lastName,
      phone: phone ?? null,
    });
    if (profileErr) {
      await db.auth.admin.deleteUser(authData.user.id);
      throw profileErr;
    }

    await logAuditEvent(
      ctx.tenantId, ctx.userId, 'users.create',
      `Created user ${firstName} ${lastName} (${email}) with role ${role}`
    );

    return created({ userId: authData.user.id, email, role });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!await hasPermission(ctx, 'users', 'edit')) return err('Forbidden', 403);

    const { userId, role, roleId, firstName, lastName, phone, isActive } = await req.json();
    if (!userId) return err('userId is required.', 422);
    if (role === 'coach') {
      return err('Changing a user to the coach role requires a coaches profile row and must go through POST /api/v1/coaches.', 422);
    }

    const db = adminDb();

    // Verify user belongs to tenant (unless superadmin)
    const userQuery = db.from('users').select('id, tenant_id').eq('id', userId);
    if (ctx.role !== 'superadmin') {
      userQuery.eq('tenant_id', ctx.tenantId);
    }
    const { data: userRecord, error: userRecordErr } = await userQuery.maybeSingle();
    if (userRecordErr || !userRecord) {
      return err('User not found or access denied.', 404);
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (role !== undefined) updates.role = role;
    if (roleId !== undefined) updates.role_id = roleId;
    if (firstName !== undefined) updates.first_name = firstName;
    if (lastName !== undefined) updates.last_name = lastName;
    if (phone !== undefined) updates.phone = phone;
    if (isActive !== undefined) updates.is_active = isActive;

    const { error: updateErr } = await db.from('users').update(updates).eq('id', userId);
    if (updateErr) throw updateErr;

    if (role) {
      await db.auth.admin.updateUserById(userId, { app_metadata: { role } });
    }

    await logAuditEvent(
      ctx.tenantId, ctx.userId, 'users.edit',
      `Updated user ${userId}: ${JSON.stringify({ role, isActive })}`
    );

    return ok({ userId, updated: updates });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!await hasPermission(ctx, 'users', 'delete')) return err('Forbidden', 403);

    const { userId } = await req.json();
    if (!userId) return err('userId is required.', 422);
    if (userId === ctx.userId) return err('You cannot deactivate your own account.', 400);

    const db = adminDb();

    // Verify user belongs to tenant (unless superadmin)
    const userQuery = db.from('users').select('id, tenant_id, first_name, last_name, email, role').eq('id', userId);
    if (ctx.role !== 'superadmin') {
      userQuery.eq('tenant_id', ctx.tenantId);
    }
    const { data: targetUser, error: userRecordErr } = await userQuery.maybeSingle();
    if (userRecordErr || !targetUser) {
      return err('User not found or access denied.', 404);
    }

    // Soft-delete: deactivate rather than hard delete
    await db.from('users').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', userId);
    await db.auth.admin.updateUserById(userId, { ban_duration: '876600h' });

    await logAuditEvent(
      ctx.tenantId, ctx.userId, 'users.delete',
      `Deactivated user ${targetUser?.first_name} ${targetUser?.last_name} (${targetUser?.email})`
    );

    return ok({ userId, deactivated: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
