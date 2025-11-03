<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: `Admin - ${t('common.projects')}` })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const currentAdminId = computed(() => user.value?.id || '')
const { isGlobalAdmin, canManageProject } = useAdminRole()
const { getErrorMessage } = useErrorMessage()
const { canManageProjectSync: canManageProjectSyncHelper, refreshCounts: refreshCountsHelper } = useProjectManagement()

type Project = { id: string, name: string, admins: string[], commission_rate_min?: number | null, commission_rate_max?: number | null, policy?: string | null }
const projects = ref<Project[]>([])
const allUsers = ref<any[]>([])
const allAdmins = ref<any[]>([])

const isCreateOpen = ref(false)
const isEditOpen = ref(false)
const isManageUsersOpen = ref(false)
const isManageAdminsOpen = ref(false)

const draft = reactive<{ 
  id?: string, 
  name: string, 
  selectedUsers: string[],
  selectedOwners: string[],
  commission_rate_min?: number | null,
  commission_rate_max?: number | null,
  policy?: string | null
}>({ 
  name: '', 
  selectedUsers: [],
  selectedOwners: [],
  commission_rate_min: null,
  commission_rate_max: null,
  policy: null
})
const selected = ref<Project | null>(null)
const editProject = ref<Project | null>(null)

// Role states
const isGlobalAdminValue = ref(false)
const projectPermissions = ref<Record<string, boolean>>({})

// Check if current user can manage a project (Global Admin or Project Owner)
const canManageProjectSync = (project: Project | null): boolean => {
  return canManageProjectSyncHelper(project, projectPermissions.value)
}

const userOptions = computed(() => allUsers.value.map(u => ({ label: u.name || u.email, value: u.id })))

// Admin options for creating project (only project owners)
const availableOwnerOptions = computed(() => {
  return allAdmins.value
    .filter(a => {
      // Only allow project_owner or null role (exclude global_admin)
      return a.role !== 'global_admin'
    })
    .map(a => ({ 
      label: `${a.name || a.email}${a.role ? ` (${a.role === 'project_owner' ? t('admin.projectOwner') : a.role})` : ''}`, 
      value: a.id 
    }))
})

const columns = computed(() => [
  { key: 'name', label: t('common.project') },
  { key: 'commissionRate', label: t('projects.commissionRateRange') },
  { key: 'usersCount', label: t('common.users') },
  { key: 'adminsCount', label: t('common.admins') },
  { key: 'actions', label: t('common.actions') },
])

const goDetail = (id: string) => navigateTo({ name: 'admin-projects-id', params: { id } })

const projectIdToUsersCount = ref<Record<string, number>>({})
const tableRows = computed(() => projects.value.map(p => ({
  ...p,
  usersCount: projectIdToUsersCount.value[p.id] || 0,
  adminsCount: (p.admins || []).length,
})))

const openCreate = () => { 
  draft.id = undefined
  draft.name = ''
  draft.selectedUsers = []
  draft.selectedOwners = []
  draft.commission_rate_min = null
  draft.commission_rate_max = null
  draft.policy = null
  isCreateOpen.value = true 
}

const openEdit = async (p: Project) => {
  // Check permission
  const canManage = await canManageProject(p.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: isGlobalAdminValue.value ? t('admin.onlyGlobalAdminsCanEdit') : t('admin.onlyProjectAdminsCanEdit'),
    })
    return
  }
  
  editProject.value = JSON.parse(JSON.stringify(p))
  isEditOpen.value = true 
}

const createProject = async () => {
  if (!currentAdminId.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.userMustBeLoggedIn'),
      description: 'You must be logged in as admin to create a project',
    })
    return
  }
  
  // Add selected owners to project, or use current admin as default
  // Ensure selectedOwners is array of strings (user IDs)
  let admins: string[] = []
  if (draft.selectedOwners.length > 0) {
    // Extract values if they are objects, otherwise use as is
    admins = draft.selectedOwners.map(owner => 
      typeof owner === 'string' ? owner : (owner as any)?.value || owner
    ).filter((id): id is string => typeof id === 'string' && id.length > 0)
  }
  
  // If no valid owners selected, use current admin as default
  if (admins.length === 0) {
    admins = [currentAdminId.value]
  }
  
  const { data, error } = await supabase
    .from('projects')
    .insert({ 
      name: draft.name.trim(), 
      admins,
      commission_rate_min: draft.commission_rate_min || null,
      commission_rate_max: draft.commission_rate_max || null,
      policy: draft.policy || null
    })
    .select('id')
    .single()
  
  if (error) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToCreateProject'),
      description: getErrorMessage(error),
    })
    return
  }
  
  if (data) {
    const newProject = { 
      id: data.id, 
      name: draft.name.trim(), 
      admins,
      commission_rate_min: draft.commission_rate_min || null,
      commission_rate_max: draft.commission_rate_max || null,
      policy: draft.policy || null
    }
    projects.value.unshift(newProject)
    
    // Add selected users to project if any
    if (draft.selectedUsers.length > 0) {
      // Ensure selectedUsers is array of strings (user IDs)
      const userIds = draft.selectedUsers.map(user => 
        typeof user === 'string' ? user : (user as any)?.value || user
      ).filter((id): id is string => typeof id === 'string' && id.length > 0)
      
      const userInserts = userIds.map(uid => ({
        project_id: data.id,
        user_id: uid,
        ref_percentage: 10
      }))
      
      const { error: usersError } = await supabase
        .from('user_project_info')
        .insert(userInserts)
      
      if (usersError) {
        // Non-fatal, just log
      } else {
        await refreshCounts()
      }
    }
  }
  
  isCreateOpen.value = false
  draft.selectedUsers = []
  draft.selectedOwners = []
  draft.commission_rate_min = null
  draft.commission_rate_max = null
  draft.policy = null
}
const handleProjectUpdated = async () => {
  // Refresh projects list
  const { data: projs } = await supabase.from('projects').select('id, name, admins, commission_rate_min, commission_rate_max, policy').order('name')
  if (projs) {
    projects.value = projs
    // Update selected project if it exists
    if (selected.value) {
      const updated = projs.find(p => p.id === selected.value!.id)
      if (updated) {
        selected.value = updated
      }
    }
  }
  await refreshCounts()
}

const deleteProject = async (p: Project) => {
  // Check if current user can manage this project
  const canManage = await canManageProject(p.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: isGlobalAdminValue.value ? t('admin.onlyGlobalAdminsCanDelete') : t('admin.onlyProjectAdminsCanDelete'),
    })
    return
  }
  
  // Only global admins can delete projects
  if (!isGlobalAdminValue.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyGlobalAdminsCanDelete'),
    })
    return
  }
  
  const { error } = await supabase.from('projects').delete().eq('id', p.id)
  
  if (error) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToDelete'),
      description: getErrorMessage(error),
    })
    return
  }
  
  projects.value = projects.value.filter(x => x.id !== p.id)
}


const openManageUsers = async (p: Project) => {
  // Check permission
  const canManage = await canManageProject(p.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: isGlobalAdminValue.value ? t('admin.onlyGlobalAdminsCanManageUsers') : t('admin.onlyProjectAdminsCanManageUsers'),
    })
    return
  }
  
  selected.value = JSON.parse(JSON.stringify(p))
  isManageUsersOpen.value = true
}

const openManageAdmins = async (p: Project) => {
  // Check permission
  const canManage = await canManageProject(p.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: isGlobalAdminValue.value ? t('admin.onlyGlobalAdminsCanManageAdmins') : t('admin.onlyProjectAdminsCanManageAdmins'),
    })
    return
  }
  
  selected.value = JSON.parse(JSON.stringify(p))
  isManageAdminsOpen.value = true
}

const refreshCounts = async () => {
  const counts = await refreshCountsHelper()
  projectIdToUsersCount.value = counts
}

onMounted(async () => {
  // Check if user is global admin
  isGlobalAdminValue.value = await isGlobalAdmin()
  
  const [{ data: projs }, { data: users }, { data: admins }] = await Promise.all([
    supabase.from('projects').select('id, name, admins, commission_rate_min, commission_rate_max, policy').order('name'),
    supabase.from('user_profiles').select('id, email, name'),
    supabase.from('admins').select('id, email, name, role')
  ])
  projects.value = projs || []
  allUsers.value = users || []
  allAdmins.value = admins || []
  
  // Pre-check permissions for all projects
  if (currentAdminId.value) {
    for (const project of projects.value) {
      const canManage = await canManageProject(project.id)
      projectPermissions.value[project.id] = canManage
    }
  }
  
  await refreshCounts()
})
</script>

<template>
  <div class="container mx-auto">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{{ $t('common.projects') }}</h2>
          <UButton 
            color="primary" 
            @click="openCreate"
            :disabled="!isGlobalAdminValue"
            :title="!isGlobalAdminValue ? $t('admin.onlyGlobalAdminsCanCreateProjects') || 'Only global admins can create projects' : ''"
          >
            {{ $t('projects.newProject') }}
          </UButton>
        </div>
      </template>

      <UTable :rows="tableRows" :columns="columns">
        <template #name-data="{ row }">
          <NuxtLink class="text-primary hover:underline" :to="{ name: 'admin-projects-id', params: { id: row.id } }">{{ row.name }}</NuxtLink>
        </template>
        <template #commissionRate-data="{ row }">
          <span v-if="row.commission_rate_min != null || row.commission_rate_max != null" class="text-sm">
            {{ row.commission_rate_min != null ? `${row.commission_rate_min}%` : '' }}
            <span v-if="row.commission_rate_min != null && row.commission_rate_max != null"> - </span>
            {{ row.commission_rate_max != null ? `${row.commission_rate_max}%` : '' }}
          </span>
          <span v-else class="text-gray-400 text-sm">—</span>
        </template>
        <template #actions-data="{ row }">
          <div class="flex gap-2">
            <UButton 
              size="xs" 
              color="primary" 
              @click="openManageUsers(row)"
              :disabled="!canManageProjectSync(row)"
              :title="!canManageProjectSync(row) ? (isGlobalAdminValue ? $t('admin.onlyGlobalAdminsCanManageUsers') : $t('admin.onlyProjectAdminsCanManageUsers')) : ''"
            >
              {{ $t('projects.addUsers') }}
            </UButton>
            <UButton 
              size="xs" 
              color="primary" 
              variant="soft" 
              @click="openManageAdmins(row)"
              :disabled="!canManageProjectSync(row)"
              :title="!canManageProjectSync(row) ? (isGlobalAdminValue ? $t('admin.onlyGlobalAdminsCanManageAdmins') : $t('admin.onlyProjectAdminsCanManageAdmins')) : ''"
            >
              {{ $t('projects.addAdmins') }}
            </UButton>
            <UButton 
              size="xs" 
              color="gray" 
              variant="soft" 
              @click="openEdit(row)"
              :disabled="!canManageProjectSync(row)"
              :title="!canManageProjectSync(row) ? (isGlobalAdminValue ? $t('admin.onlyGlobalAdminsCanEdit') : $t('admin.onlyProjectAdminsCanEdit')) : ''"
            >
              {{ $t('common.edit') }}
            </UButton>
            <UButton 
              size="xs" 
              color="red" 
              variant="soft" 
              @click="deleteProject(row)"
              :disabled="!canManageProjectSync(row) || !isGlobalAdminValue"
              :title="!isGlobalAdminValue ? $t('admin.onlyGlobalAdminsCanDelete') || 'Only global admins can delete projects' : (!canManageProjectSync(row) ? $t('admin.onlyProjectAdminsCanDelete') : '')"
            >
              {{ $t('common.delete') }}
            </UButton>
          </div>
        </template>
        <template #empty>
          <div class="text-center py-8 text-gray-500">
            {{ $t('projects.noProjectsAvailable') || 'No projects found' }}
          </div>
        </template>
      </UTable>
    </UCard>

    <!-- Create -->
    <UModal v-model="isCreateOpen" :ui="{ width: 'sm:max-w-2xl', container: 'items-start' }">
      <UCard>
        <template #header>
          <h3 class="font-semibold">{{ $t('projects.newProject') }}</h3>
        </template>
        <div class="space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto pb-4" style="padding-left: 0.25rem; padding-right: 0.25rem;">
          <UFormGroup :label="$t('projects.projectName')">
            <UInput v-model="draft.name" @keyup.enter="createProject" />
          </UFormGroup>
          <div class="grid grid-cols-2 gap-4">
            <UFormGroup :label="$t('projects.commissionRateMin')">
              <UInput 
                v-model.number="(draft as any).commission_rate_min" 
                type="number" 
                step="0.01" 
                min="0" 
                max="100"
                :placeholder="$t('projects.commissionRateMinPlaceholder')"
              />
            </UFormGroup>
            <UFormGroup :label="$t('projects.commissionRateMax')">
              <UInput 
                v-model.number="(draft as any).commission_rate_max" 
                type="number" 
                step="0.01" 
                min="0" 
                max="100"
                :placeholder="$t('projects.commissionRateMaxPlaceholder')"
              />
            </UFormGroup>
          </div>
          <UFormGroup :label="$t('projects.policy')">
            <UTextarea 
              v-model="(draft as any).policy" 
              :rows="4"
              :placeholder="$t('projects.policyPlaceholder')"
              :ui="{ base: 'resize-none' }"
            />
          </UFormGroup>
          <UFormGroup :label="$t('projects.projectOwners')">
            <USelectMenu 
              v-model="(draft as any).selectedOwners" 
              :options="availableOwnerOptions" 
              :placeholder="$t('projects.selectOwners')"
              multiple
              searchable
              value-attribute="value"
              :ui="{ 
                width: 'w-full',
                option: { container: 'max-h-60 overflow-y-auto overflow-x-hidden' },
                popper: { placement: 'bottom-start', strategy: 'fixed' }
              }"
              class="w-full"
            />
            <p class="text-xs text-gray-500 mt-1">{{ $t('projects.selectOwnersNote') }}</p>
          </UFormGroup>
          <UFormGroup :label="$t('projects.addUsers')">
            <USelectMenu 
              v-model="(draft as any).selectedUsers" 
              :options="userOptions" 
              :placeholder="$t('projects.selectUsersToAdd')"
              multiple
              searchable
              value-attribute="value"
              :ui="{ 
                width: 'w-full',
                option: { container: 'max-h-60 overflow-y-auto overflow-x-hidden' },
                popper: { placement: 'bottom-start', strategy: 'fixed' }
              }"
              class="w-full"
            />
            <p class="text-xs text-gray-500 mt-1">{{ $t('projects.usersNote') }}</p>
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isCreateOpen = false">{{ $t('common.cancel') }}</UButton>
            <UButton color="primary" @click="createProject" :disabled="!draft.name.trim()">{{ $t('common.create') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit -->
    <AdminProjectsProjectEditModal
      v-model="isEditOpen"
      :project="editProject"
      :is-global-admin="isGlobalAdminValue"
      :can-manage="editProject ? canManageProjectSync(editProject) : false"
      @updated="handleProjectUpdated"
    />

    <!-- Manage Users -->
    <AdminProjectsProjectManageUsersModal
      v-model="isManageUsersOpen"
      :project="selected"
      :all-users="allUsers"
      :is-global-admin="isGlobalAdminValue"
      @updated="handleProjectUpdated"
    />

    <!-- Manage Admins -->
    <AdminProjectsProjectManageAdminsModal
      v-model="isManageAdminsOpen"
      :project="selected"
      :all-admins="allAdmins"
      :projects="projects"
      :is-global-admin="isGlobalAdminValue"
      @updated="handleProjectUpdated"
    />
  </div>
</template>

<style scoped></style>
