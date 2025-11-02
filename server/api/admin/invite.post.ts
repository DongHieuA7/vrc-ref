import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  // Check authentication - get token from headers
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const token = authHeader.replace('Bearer ', '')
  const config = useRuntimeConfig(event)
  
  // Get Supabase config - try multiple sources
  const supabaseUrl = 
    (config as any).supabaseUrl || 
    (config as any).public?.supabaseUrl || 
    process.env.SUPABASE_URL ||
    process.env.NUXT_PUBLIC_SUPABASE_URL
  
  const anonKey = 
    (config as any).public?.supabaseAnonKey || 
    process.env.SUPABASE_ANON_KEY ||
    process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NUXT_PUBLIC_SUPABASE_KEY
  
  if (!supabaseUrl || !anonKey) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase config missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.' })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Check if user is admin
  const { data: adminData, error: adminError } = await userClient
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (adminError || !adminData) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Admin access required' })
  }

  const body = await readBody<{ email: string, name?: string, makeAdmin?: boolean }>(event)

  if (!body?.email) {
    throw createError({ statusCode: 400, statusMessage: 'Email is required' })
  }

  const serviceKey = 
    (config as any).supabaseServiceRoleKey || 
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase service config missing. Please set SUPABASE_SERVICE_ROLE_KEY environment variable.' })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  let userId: string | null = null

  // Check if user exists in user_profiles first (for existing users)
  const { data: existingUserProfile } = await adminClient
    .from('user_profiles')
    .select('id')
    .eq('email', body.email)
    .maybeSingle()

  if (existingUserProfile) {
    // User exists in user_profiles, use their ID
    userId = existingUserProfile.id
  } else {
    // Check if user exists in admins
    const { data: existingAdmin } = await adminClient
      .from('admins')
      .select('id')
      .eq('email', body.email)
      .maybeSingle()
    
    if (existingAdmin) {
      userId = existingAdmin.id
    } else {
      // User doesn't exist, try to invite them
      const inviteRes = await adminClient.auth.admin.inviteUserByEmail(body.email)
      if (inviteRes.error) {
        // If invite fails with "user already exists", try to get user by email from auth
        if (inviteRes.error.message?.toLowerCase().includes('already') || inviteRes.error.message?.toLowerCase().includes('exists')) {
          // Try to find user by listing users with pagination
          let foundUser = null
          let page = 0
          const perPage = 100
          
          while (!foundUser && page < 10) { // Limit to 10 pages (1000 users max)
            const { data: usersData } = await adminClient.auth.admin.listUsers({ page, perPage })
            foundUser = usersData?.users?.find(u => u.email === body.email)
            if (foundUser || !usersData?.users || usersData.users.length < perPage) break
            page++
          }
          
          if (foundUser) {
            userId = foundUser.id
          } else {
            throw createError({ statusCode: 400, statusMessage: inviteRes.error.message || 'User already exists but could not be found' })
          }
        } else {
          throw createError({ statusCode: inviteRes.error.status || 400, statusMessage: inviteRes.error.message })
        }
      } else {
        userId = inviteRes.data.user?.id || null
      }
    }
  }

  if (userId) {
    if (body.makeAdmin) {
      // Check if admin already exists to preserve their role
      const { data: existingAdminWithRole } = await adminClient
        .from('admins')
        .select('role')
        .eq('id', userId)
        .maybeSingle()
      
      // Role: preserve existing role if admin already exists, otherwise global_admin for all new admins
      let adminRole = 'global_admin'
      if (existingAdminWithRole?.role) {
        // Preserve existing role
        adminRole = existingAdminWithRole.role
      } else {
        // All new admins (both invited and added) get global_admin role
        adminRole = 'global_admin'
      }
      
      const { error: adminErr } = await adminClient
        .from('admins')
        .upsert({ id: userId, email: body.email, name: body.name || null, role: adminRole }, { onConflict: 'id' })
      if (adminErr) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to create admin' })
      }
      
      // Delete from user_profiles if exists
      const { error: deleteErr } = await adminClient
        .from('user_profiles')
        .delete()
        .eq('id', userId)
      
      // Non-fatal if delete fails (user might not be in user_profiles)
    } else {
      // If user is not admin, create user profile
      const { error: upsertErr } = await adminClient
        .from('user_profiles')
        .upsert({ id: userId, email: body.email, name: body.name || null }, { onConflict: 'id' })

      if (upsertErr) {
        // non-fatal
      }
      
      // Delete from admins if exists (downgrade from admin to user)
      const { error: deleteAdminErr } = await adminClient
        .from('admins')
        .delete()
        .eq('id', userId)
      
      // Non-fatal if delete fails
    }
  }

  return { ok: true }
})




