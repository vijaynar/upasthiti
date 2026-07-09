// apps/web/src/app/api/v1/auth/register/route.ts
// POST /api/v1/auth/register
// Public endpoint for self-serve Academy/Institute onboarding.
// Creates a fresh tenant + registers the first Admin user.

import { NextResponse } from 'next/server';
import { adminDb, ok, err, created } from '@/lib/api';

// Replace a coach's category/tag tagging in one shot. Mirrors the helper in
// apps/web/src/app/api/v1/coaches/route.ts (kept local to avoid a cross-route
// import between two independent onboarding entry points).
async function syncCoachCategories(
  db: ReturnType<typeof adminDb>,
  coachId: string,
  subcategoryIds: string[],
  primarySubcategoryId: string,
  tagIds: string[]
) {
  if (subcategoryIds.length > 0) {
    const { error } = await db.from('coach_categories').insert(
      subcategoryIds.map(subcategoryId => ({
        coach_id: coachId,
        subcategory_id: subcategoryId,
        is_primary: subcategoryId === primarySubcategoryId,
      }))
    );
    if (error) throw error;
  }

  if (tagIds.length > 0) {
    const { error } = await db.from('coach_tags').insert(
      tagIds.map(tagId => ({ coach_id: coachId, tag_id: tagId }))
    );
    if (error) throw error;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      email, password, firstName, lastName, phone, role, tenantId, avatarUrl,
      // Coach fields
      primarySubcategoryId, subcategoryIds, tagIds, ageGroups, skillLevels,
      experienceYears, serviceTypes, classTypes, languagesKnown,
      qualification, certificationsSummary, joiningDate, bio,
      country, state, city, area, address, specialization,
      gender, dateOfBirth,
      // Financials
      bankAccountNumber, bankIfscCode, bankName, upiId, panNumber,
      // Academy fields
      tenantName, tenantSlug
    } = body;

    const db = adminDb();

    if (role === 'coach') {
      // ── Coach registration ─────────────────────────────────
      if (!email || !password || !firstName || !lastName || !tenantId || !primarySubcategoryId || experienceYears === undefined || !joiningDate) {
        return err('Missing required coach onboarding fields.', 422);
      }

      const resolvedSubcategoryIds: string[] = Array.isArray(subcategoryIds) && subcategoryIds.length > 0
        ? [...subcategoryIds]
        : [primarySubcategoryId];
      if (!resolvedSubcategoryIds.includes(primarySubcategoryId)) {
        resolvedSubcategoryIds.push(primarySubcategoryId);
      }

      // Fetch the global Coach role ID
      const { data: coachRole } = await db
        .from('roles')
        .select('id')
        .eq('name', 'Coach')
        .is('tenant_id', null)
        .maybeSingle();

      // Create Supabase Auth user
      const { data: authData, error: authError } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm for onboarding
        app_metadata: {
          tenant_id: tenantId,
          role: 'coach',
        },
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
        },
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          return err('A user with this email is already registered.', 409);
        }
        throw authError;
      }

      const userId = authData.user.id;

      // Insert profile row in public.users (Inactive pending verification)
      const { error: userErr } = await db.from('users').upsert({
        id: userId,
        tenant_id: tenantId,
        email,
        role: 'coach',
        role_id: coachRole?.id || null,
        available_roles: ['coach'],
        first_name: firstName,
        last_name: lastName,
        phone: phone ?? null,
        avatar_url: avatarUrl ?? null,
        is_active: false, // Inactive by default until documents verified
      });

      if (userErr) {
        await db.auth.admin.deleteUser(userId);
        throw userErr;
      }

      // Generate a slug
      const slug = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

      // Insert coaches extended profile
      const { error: coachErr } = await db.from('coaches').insert({
        id: userId,
        tenant_id: tenantId,
        experience_years: Number(experienceYears),
        service_types: serviceTypes || ['Offline'],
        class_types: classTypes || ['Group Classes'],
        languages_known: languagesKnown || ['English'],
        qualification: qualification || null,
        certifications_summary: certificationsSummary || null,
        joining_date: joiningDate ? new Date(joiningDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        bio: bio || null,
        country: country || 'India',
        state: state || null,
        city: city || null,
        area: area || null,
        address: address || null,
        specialization: specialization || null,
        age_groups: ageGroups || [],
        skill_levels: skillLevels || [],
        gender: gender || null,
        date_of_birth: dateOfBirth ? new Date(dateOfBirth).toISOString().split('T')[0] : null,
        account_status: 'Onboarding',
        public_profile_slug: slug,
        achievements: [],
        gallery_urls: [],
        avg_rating: 0.00,
        retention_rate: 0.00,
        conversion_rate: 0.00,
        satisfaction_score: 0.00,
      });

      if (coachErr) {
        await db.from('users').delete().eq('id', userId);
        await db.auth.admin.deleteUser(userId);
        throw coachErr;
      }

      // Tag the coach with its category/subcategory/tag selections
      try {
        await syncCoachCategories(db, userId, resolvedSubcategoryIds, primarySubcategoryId, tagIds ?? []);
      } catch (tagErr) {
        await db.from('coaches').delete().eq('id', userId);
        await db.from('users').delete().eq('id', userId);
        await db.auth.admin.deleteUser(userId);
        throw tagErr;
      }

      // Insert financial settings for coach
      const { error: finErr } = await db.from('coach_financial_settings').insert({
        coach_id: userId,
        tenant_id: tenantId,
        salary_type: 'Fixed Monthly',
        fixed_salary: 0.00,
        per_class_rate: 0.00,
        revenue_share_pct: 0.00,
        bank_account_holder_name: `${firstName} ${lastName}`,
        bank_account_number: bankAccountNumber || null,
        bank_ifsc_code: bankIfscCode || null,
        bank_name: bankName || null,
        upi_id: upiId || null,
        pan_number: panNumber || null,
      });

      if (finErr) {
        await db.from('coaches').delete().eq('id', userId);
        await db.from('users').delete().eq('id', userId);
        await db.auth.admin.deleteUser(userId);
        throw finErr;
      }

      return created({
        userId,
        email,
        role: 'coach',
        tenantId,
      });
    }

    // ── Academy registration (original flow) ────────────────
    if (!email || !password || !firstName || !lastName || !tenantName || !tenantSlug) {
      return err('Missing required onboarding fields.', 422);
    }

    // 1. Create the tenant first
    const { data: tenant, error: tenantError } = await db
      .from('tenants')
      .insert({
        name: tenantName,
        slug: tenantSlug.toLowerCase().trim(),
        subscription_status: 'trial',
        country: country || 'India',
        state: state || 'Telangana',
        city: city || 'Hyderabad',
        address: address || null
      })
      .select()
      .single();

    if (tenantError) {
      if (tenantError.message.includes('slug')) {
        return err('This institute URL slug is already taken.', 409);
      }
      throw tenantError;
    }

    // 2. Create the Admin user in Supabase Auth
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm for onboarding admins
      app_metadata: {
        tenant_id: tenant.id,
        role: 'admin',
      },
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (authError) {
      // Rollback tenant creation if auth fails
      await db.from('tenants').delete().eq('id', tenant.id);
      if (authError.message.includes('already registered')) {
        return err('A user with this email is already registered.', 409);
      }
      throw authError;
    }

    const userId = authData.user.id;

    // 3. Insert the Admin user profile in public.users
    const { data: profile, error: profileError } = await db
      .from('users')
      .insert({
        id: userId,
        tenant_id: tenant.id,
        email,
        role: 'admin',
        first_name: firstName,
        last_name: lastName,
        phone: phone ?? null,
      })
      .select()
      .single();

    if (profileError) {
      // Rollback auth user & tenant if profile insertion fails
      await db.auth.admin.deleteUser(userId);
      await db.from('tenants').delete().eq('id', tenant.id);
      throw profileError;
    }

    return created({
      userId,
      email,
      role: 'admin',
      tenant,
      profile,
    });
  } catch (e: unknown) {
    console.error('REGISTRATION ERROR:', e);
    const message = e instanceof Error ? e.message : 'Internal server error';
    return err(message, 500);
  }
}
