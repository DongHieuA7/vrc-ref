export default defineNuxtRouteMiddleware(async () => {
  const client = useSupabaseClient()
  const user = useSupabaseUser()

  if (!user.value) {
    return navigateTo('/sign-in')
  }

  // Check if user is admin
  const { data, error } = await client
    .from('admins')
    .select('id')
    .eq('id', user.value.id)
    .maybeSingle()

  // If user is admin, redirect to admin my-projects
  if (!error && data) {
    return navigateTo('/admin/projects/my-projects')
  }
})

