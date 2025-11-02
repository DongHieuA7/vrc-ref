<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: `Admin - ${t('users.admins')}` })

const isLoading = ref(false)
const admins = ref<any[]>([])
const allUsers = ref<any[]>([])
const supabase = useSupabaseClient()
const { isGlobalAdmin } = useAdminRole()
const isGlobalAdminValue = ref(false)
const { formatDate } = useCommissionFormatters()
const { getErrorMessage } = useErrorMessage()

const form = reactive({
  email: '',
  name: '',
  selectedUserId: '', // For selecting existing user
})

const isInviteOpen = ref(false)
const useExistingUser = ref(false)

const fetchAdmins = async () => {
  const { data } = await supabase
    .from('admins')
    .select('id, email, name, created_at, role')
    .order('created_at', { ascending: false })
  admins.value = data || []
}

const fetchUsers = async () => {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, name')
    .order('email')
  allUsers.value = data || []
}

onMounted(async () => {
  await getCurrentAdminId()
  isGlobalAdminValue.value = await isGlobalAdmin()
  await Promise.all([
    fetchAdmins(),
    fetchUsers()
  ])
})

const inviteAdmin = async () => {
  try {
    isLoading.value = true
    
    // Get session token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('Not authenticated')
    }
    
    // If using existing user, get email from selected user
    let email = form.email
    let name = form.name
    
    if (useExistingUser.value && form.selectedUserId) {
      const selectedUser = allUsers.value.find(u => u.id === form.selectedUserId)
      if (selectedUser) {
        email = selectedUser.email
        name = selectedUser.name || name
      }
    }
    
    if (!email) {
      throw new Error('Email is required')
    }
    
    await $fetch('/api/admin/invite', { 
      method: 'POST', 
      body: { email, name, makeAdmin: true },
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })
    
    const invitedEmail = email
    await Promise.all([
      fetchAdmins(),
      fetchUsers() // Refresh users list as one might have been converted to admin
    ])
    form.email = ''
    form.name = ''
    form.selectedUserId = ''
    useExistingUser.value = false
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
      description: getErrorMessage(error),
    })
  } finally {
    isLoading.value = false
  }
}

const userOptions = computed(() => {
  return allUsers.value
    .filter(u => !admins.value.find(a => a.id === u.id)) // Exclude users who are already admins
    .map(u => ({ label: `${u.name || u.email} (${u.email})`, value: u.id }))
})

const currentAdminId = ref<string | null>(null)

const getCurrentAdminId = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  currentAdminId.value = user?.id || null
}

const removeProjectOwner = async (adminId: string) => {
  // Only Global Admin can remove project owners
  if (!isGlobalAdminValue.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyGlobalAdminsCanRemoveProjectOwners'),
    })
    return
  }

  // Cannot remove yourself
  if (adminId === currentAdminId.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.cannotRemoveYourself'),
      description: t('admin.cannotRemoveYourselfMessage'),
    })
    return
  }

  // Check if it's a global admin (cannot remove)
  const admin = admins.value.find(a => a.id === adminId)
  if (admin?.role === 'global_admin') {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.cannotRemoveGlobalAdmin'),
      description: t('admin.cannotRemoveGlobalAdminMessage'),
    })
    return
  }

  try {
    isLoading.value = true

    // Get all projects where this admin is a project owner
    // Query all projects and filter on client side (Supabase array filter is complex)
    const { data: allProjects, error: fetchError } = await supabase
      .from('projects')
      .select('id, admins')

    if (fetchError) {
      throw fetchError
    }

    // Filter projects where admin is in admins array
    const projects = (allProjects || []).filter((p: any) => 
      p.admins && Array.isArray(p.admins) && p.admins.includes(adminId)
    )

    if (!projects || projects.length === 0) {
      const toast = useToast()
      toast.add({
        color: 'yellow',
        title: t('admin.noProjectsFound'),
        description: t('admin.adminNotInAnyProject'),
      })
      return
    }

    // Remove admin from all projects
    for (const project of projects) {
      const nextAdmins = (project.admins || []).filter((id: string) => id !== adminId)
      const { error: updateError } = await supabase
        .from('projects')
        .update({ admins: nextAdmins })
        .eq('id', project.id)

      if (updateError) {
        throw updateError
      }
    }

    // Refresh admins list after removal
    await fetchAdmins()
    
    const toast = useToast()
    toast.add({
      color: 'green',
      title: t('admin.projectOwnerRemoved'),
      description: t('admin.projectOwnerRemovedFromProjects', { count: projects.length }),
    })
  } catch (error: any) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.failedToRemoveProjectOwner'),
      description: getErrorMessage(error),
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
        { key: 'name', label: $t('common.name') },
        { key: 'email', label: $t('common.email') },
        { key: 'created_at', label: $t('projects.created') },
        { key: 'actions', label: $t('common.actions') },
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
        <template #actions-data="{ row }">
          <UButton 
            v-if="isGlobalAdminValue && row.role === 'project_owner' && row.id !== currentAdminId"
            size="xs" 
            color="red" 
            variant="soft" 
            :loading="isLoading"
            :disabled="isLoading"
            :title="$t('admin.removeProjectOwnerFromAllProjects')"
            @click="removeProjectOwner(row.id)"
          >
            {{ $t('common.remove') }}
          </UButton>
          <span v-else-if="row.role === 'global_admin' || row.id === currentAdminId" class="text-gray-400 text-sm">
            -
          </span>
        </template>
      </UTable>
    </UCard>

    <UModal v-model="isInviteOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">{{ $t('users.inviteAdmin') }}</h3>
        </template>
        <div class="space-y-4">
          <UFormGroup>
            <UCheckbox v-model="useExistingUser" :label="$t('users.useExistingUser') || 'Use existing user'" />
          </UFormGroup>
          
          <UFormGroup v-if="useExistingUser" :label="$t('common.user')">
            <USelect 
              v-model="form.selectedUserId" 
              :options="userOptions" 
              :placeholder="$t('users.selectUser') || 'Select user'"
              searchable
            />
          </UFormGroup>
          
          <template v-else>
            <UFormGroup :label="$t('common.email')">
              <UInput v-model="form.email" type="email" @keyup.enter="inviteAdmin" />
            </UFormGroup>
            <UFormGroup :label="$t('common.name')">
              <UInput v-model="form.name" @keyup.enter="inviteAdmin" />
            </UFormGroup>
          </template>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isInviteOpen = false">{{ $t('common.cancel') }}</UButton>
            <UButton 
              color="primary" 
              @click="inviteAdmin" 
              :loading="isLoading" 
              :disabled="isLoading || (useExistingUser ? !form.selectedUserId : !form.email)"
            >
              {{ $t('users.inviteAdmin') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<style scoped></style>

