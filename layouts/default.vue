<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()

const { t } = useI18n()

// User navigation items
const userNavItems = computed(() => [
  { label: t('nav.myProfile'), icon: 'i-lucide-user', to: '/profile' },
  { label: t('nav.projects'), icon: 'i-lucide-folder', to: '/projects' },
  { label: t('nav.myCommissions'), icon: 'i-lucide-badge-dollar-sign', to: '/commissions' },
])

// Admin navigation items
const adminNavItems = computed(() => [
  { label: t('nav.adminProjects'), icon: 'i-lucide-folder-cog', to: '/admin/projects' },
  { label: t('nav.adminUsers'), icon: 'i-lucide-user-cog', to: '/admin/users' },
  { label: t('nav.adminAdmins'), icon: 'i-lucide-shield', to: '/admin/admins' },
])

// Check if user is admin
const isAdmin = ref(false)

const checkAdminStatus = async () => {
  if (!user.value) {
    isAdmin.value = false
    return
  }

  const { data, error } = await supabase
    .from('admins')
    .select('id')
    .eq('id', user.value.id)
    .maybeSingle()

  isAdmin.value = !error && !!data
}

// Computed navItems based on role
// If admin, only show admin items; if user, only show user items
const navItems = computed(() => {
  if (isAdmin.value) {
    return [...adminNavItems.value]
  }
  return [...userNavItems.value]
})

// Watch user changes and check admin status
watch(user, () => {
  checkAdminStatus()
}, { immediate: true })

const signOut = async () => {
  try {
    await supabase.auth.signOut()
    return navigateTo('/sign-in')
  } catch {}
}
</script>
<template>
  <div>

    <CookieConsent></CookieConsent>

    <!-- ========== HEADER ========== -->
<!--    <header class="flex flex-wrap md:justify-start md:flex-nowrap z-50 w-full text-sm fixed top-0">-->
<!--      <nav class="mt-6 relative max-w-[85rem] w-full bg-white border border-gray-200 rounded-xl md:rounded-[36px] mx-2 py-3 px-4 flex items-center gap-2 md:flex md:items-center md:justify-between md:py-0 md:px-6 lg:px-8 xl:mx-auto dark:bg-gray-900 dark:border-gray-800" aria-label="Global">-->
<!--&lt;!&ndash;        <div class="md:flex items-center justify-between">&ndash;&gt;-->
<!--&lt;!&ndash;          <NuxtLink class="flex-none gap-3 font-semibold flex items-center dark:text-white" to="/" aria-label="Brand">&ndash;&gt;-->
<!--&lt;!&ndash;            <img src="/icon.svg" class="h-[50px]">&ndash;&gt;-->
<!--&lt;!&ndash;            <p class="text-sm leading-tight hidden md:block">Nuxt Supabase <br> Starter</p>&ndash;&gt;-->
<!--&lt;!&ndash;          </NuxtLink>&ndash;&gt;-->
<!--&lt;!&ndash;        </div>&ndash;&gt;-->
<!--        <div id="navbar-collapse-with-animation" class="hs-collapse overflow-hidden transition-all duration-300 basis-full grow md:block">-->
<!--          <div class="flex justify-end gap-y-4 gap-x-3 md:flex-row md:items-center md:gap-y-0 md:gap-x-7 md:mt-0 md:ps-7">-->
<!--          </div>-->
<!--        </div>-->
<!--      </nav>-->
<!--    </header>-->
    <!-- ========== END HEADER ========== -->

    <div class="mx-auto px-4 sm:px-6 lg:px-8 min-h-screen">
      <div class="grid grid-cols-12 gap-6 pt-6 pb-10">
        <aside v-if="user" class="hidden md:block md:col-span-3 lg:col-span-3">
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <img src="/favicon.png" alt="Logo" class="w-8 h-8" />
                <h3 class="font-semibold">Verichains Referral</h3>
              </div>
            </template>
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm truncate max-w-[70%]">{{ $t('common.welcome') }}, <strong>{{ user.email }}</strong></div>
              <UButton color="gray" size="xs" variant="soft" @click="signOut">{{ $t('common.logout') }}</UButton>
            </div>
            <div class="mb-3">
              <LanguageSwitcher />
            </div>
            <UVerticalNavigation :links="navItems" />
          </UCard>
        </aside>

        <main :class="col-span-12 md:col-span-9 lg:col-span-9">
          <slot></slot>
        </main>
      </div>
    </div>
  </div>
</template>