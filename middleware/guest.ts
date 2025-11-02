export default defineNuxtRouteMiddleware(async () => {
	const user = useSupabaseUser()

	if (user.value) {
		const supabase = useSupabaseClient()
		const { data } = await supabase
			.from('admins')
			.select('id')
			.eq('id', user.value.id)
			.maybeSingle()
		
		if (data) {
			// User is admin, redirect to admin my-projects
			return navigateTo('/admin/projects/my-projects')
		} else {
			// User is regular user, redirect to commissions
			return navigateTo('/commissions')
		}
	}
})
