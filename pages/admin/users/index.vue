<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })

useSeoMeta({ title: `Admin - ${t('users.users')}` })

const isLoading = ref(false)
const users = ref<any[]>([])
const supabase = useSupabaseClient()
const { formatDate } = useCommissionFormatters()

const form = reactive({
  email: '',
  name: '',
  makeAdmin: false,
})

const isInviteOpen = ref(false)
const userToDelete = ref<string | null>(null)
const isDeleteConfirmOpen = ref(false)

const fetchUsers = async () => {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, name, ref_code, created_at')
    .order('created_at', { ascending: false })
  users.value = data || []
}

const openDeleteConfirm = (userId: string) => {
  userToDelete.value = userId
  isDeleteConfirmOpen.value = true
}

const deleteUser = async () => {
  if (!userToDelete.value) return
  
  try {
    isLoading.value = true
    
    // Get session token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('Not authenticated')
    }
    
    // Call API to delete user (including auth.users)
    await $fetch('/api/admin/delete-user', { 
      method: 'POST', 
      body: { userId: userToDelete.value },
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })
    
    await fetchUsers()
    isDeleteConfirmOpen.value = false
    userToDelete.value = null
    
    const toast = useToast()
    toast.add({
      color: 'green',
      title: t('users.userDeleted'),
      description: t('users.userDeletedSuccessfully'),
    })
  } catch (error: any) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('users.failedToDeleteUser'),
      description: error.data?.message || error.message || t('users.pleaseTryAgain'),
    })
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchUsers)

const invite = async () => {
  try {
    isLoading.value = true
    
    // Get session token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('Not authenticated')
    }
    
    await $fetch('/api/admin/invite', { 
      method: 'POST', 
      body: { email: form.email, name: form.name, makeAdmin: form.makeAdmin },
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })
    
    const invitedEmail = form.email
    await fetchUsers()
    form.email = ''
    form.name = ''
    form.makeAdmin = false
    isInviteOpen.value = false
    
    const toast = useToast()
    toast.add({
      color: 'green',
      title: t('users.userInvited'),
      description: t('users.invitationSent', { email: invitedEmail }),
    })
  } catch (error: any) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('users.failedToInviteUser'),
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
          <h2 class="font-semibold">{{ $t('users.users') }}</h2>
          <UButton color="primary" @click="isInviteOpen = true">{{ $t('users.inviteUser') }}</UButton>
        </div>
      </template>

      <div class="grid grid-cols-1 gap-6">
        <div>
          <h3 class="mb-2 font-medium">{{ $t('users.users') }}</h3>
          <UTable :rows="users" :columns="[
            { key: 'email', label: $t('common.email') },
            { key: 'name', label: $t('common.name') },
            { key: 'ref_code', label: $t('profile.referralCode') },
            { key: 'created_at', label: $t('projects.created') },
            { key: 'actions', label: $t('common.actions') },
          ]">
            <template #email-data="{ row }">
              <NuxtLink class="text-primary hover:underline" :to="`/admin/users/${row.id}`">{{ row.email }}</NuxtLink>
            </template>
            <template #created_at-data="{ row }">
              <span>{{ formatDate(row.created_at) }}</span>
            </template>
            <template #actions-data="{ row }">
              <div class="flex gap-2">
                <UButton size="xs" color="primary" variant="soft" @click="navigateTo(`/admin/users/${row.id}`)">{{ $t('common.view') }}</UButton>
                <UButton size="xs" color="red" variant="soft" @click="openDeleteConfirm(row.id)">{{ $t('common.delete') }}</UButton>
              </div>
            </template>
          </UTable>
        </div>
      </div>
    </UCard>

    <UModal v-model="isInviteOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">{{ $t('users.inviteUser') }}</h3>
        </template>
        <div class="space-y-4">
          <UFormGroup :label="$t('common.email')">
            <UInput v-model="form.email" type="email" @keyup.enter="invite" />
          </UFormGroup>
          <UFormGroup :label="$t('common.name')">
            <UInput v-model="form.name" @keyup.enter="invite" />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isInviteOpen = false">{{ $t('common.cancel') }}</UButton>
            <UButton color="primary" @click="invite" :loading="isLoading" :disabled="isLoading || !form.email">{{ $t('users.inviteUser') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <UModal v-model="isDeleteConfirmOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">{{ $t('users.deleteUser') }}</h3>
        </template>
        <div class="space-y-4">
          <p class="text-gray-600">{{ $t('users.deleteUserConfirm') }}</p>
          <p v-if="userToDelete" class="font-medium">
            {{ users.find(u => u.id === userToDelete)?.email || userToDelete }}
          </p>
          <p class="text-sm text-red-600">{{ $t('users.deleteUserWarning') }}</p>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isDeleteConfirmOpen = false">{{ $t('common.cancel') }}</UButton>
            <UButton color="red" @click="deleteUser" :loading="isLoading" :disabled="isLoading">{{ $t('common.delete') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<style scoped></style>

