<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: `Admin - ${t('users.admins')}` })

const isLoading = ref(false)
const admins = ref<any[]>([])
const supabase = useSupabaseClient()
const { isGlobalAdmin } = useAdminRole()
const isGlobalAdminValue = ref(false)
const { formatDate } = useCommissionFormatters()

const form = reactive({
  email: '',
  name: '',
})

const isInviteOpen = ref(false)

const fetchAdmins = async () => {
  const { data } = await supabase
    .from('admins')
    .select('id, email, name, created_at, role')
    .order('created_at', { ascending: false })
  admins.value = data || []
}

onMounted(async () => {
  isGlobalAdminValue.value = await isGlobalAdmin()
  await fetchAdmins()
})

const inviteAdmin = async () => {
  try {
    isLoading.value = true
    
    // Get session token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('Not authenticated')
    }
    
    await $fetch('/api/admin/invite', { 
      method: 'POST', 
      body: { email: form.email, name: form.name, makeAdmin: true },
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })
    
    const invitedEmail = form.email
    await fetchAdmins()
    form.email = ''
    form.name = ''
    isInviteOpen.value = false
    
    const toast = useToast()
    toast.add({
      color: 'green',
      title: t('users.adminInvited'),
      description: t('users.invitationSent', { email: invitedEmail }),
    })
  } catch (error: any) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('users.failedToInviteAdmin'),
      description: error.message || t('users.pleaseTryAgain'),
    })
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="container mx-auto">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{{ $t('users.admins') }}</h2>
          <UButton color="primary" @click="isInviteOpen = true">{{ $t('users.inviteAdmin') }}</UButton>
        </div>
      </template>

      <UTable :rows="admins" :columns="[
        { key: 'email', label: $t('common.email') },
        { key: 'name', label: $t('common.name') },
        { key: 'created_at', label: $t('projects.created') },
      ]">
        <template #name-data="{ row }">
          <div class="flex items-center gap-2">
            <span>{{ row.name || row.email }}</span>
            <UBadge 
              v-if="row.role === 'global_admin'" 
              color="blue" 
              variant="soft"
              size="xs"
            >
              {{ $t('admin.globalAdmin') || 'Global Admin' }}
            </UBadge>
            <UBadge 
              v-else-if="row.role === 'project_owner'" 
              color="gray" 
              variant="soft"
              size="xs"
            >
              {{ $t('admin.projectOwner') || 'Project Owner' }}
            </UBadge>
          </div>
        </template>
        <template #created_at-data="{ row }">
          <span>{{ formatDate(row.created_at) }}</span>
        </template>
      </UTable>
    </UCard>

    <UModal v-model="isInviteOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">{{ $t('users.inviteAdmin') }}</h3>
        </template>
        <div class="space-y-4">
          <UFormGroup :label="$t('common.email')">
            <UInput v-model="form.email" type="email" @keyup.enter="inviteAdmin" />
          </UFormGroup>
          <UFormGroup :label="$t('common.name')">
            <UInput v-model="form.name" @keyup.enter="inviteAdmin" />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isInviteOpen = false">{{ $t('common.cancel') }}</UButton>
            <UButton color="primary" @click="inviteAdmin" :loading="isLoading" :disabled="isLoading || !form.email">{{ $t('users.inviteAdmin') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<style scoped></style>

