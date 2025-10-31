export default defineNuxtRouteMiddleware(async () => {
  const client = useSupabaseClient()
  const user = useSupabaseUser()

  if (!user.value) {
    return navigateTo('/sign-in')
  }

  const { data, error } = await client
    .from('admins')
    .select('id')
    .eq('id', user.value!.id)
    .maybeSingle()

  if (error || !data) {
    return navigateTo('/dashboard')
  }
})




