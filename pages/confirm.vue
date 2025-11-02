<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()

definePageMeta({
  layout: false // No layout during redirect
})

const checkAndRedirect = async () => {
  if (!user.value) return
  
  try {
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
  } catch (error) {
    // Default to commissions if error
    return navigateTo('/commissions')
  }
}

watch(user, checkAndRedirect, { immediate: true })

onMounted(() => {
  checkAndRedirect()
})
</script>

<template>
  <div class="w-full flex items-center justify-center min-h-screen">
    <div class="text-center">
      <p class="text-gray-500">Redirecting...</p>
    </div>
  </div>
</template>