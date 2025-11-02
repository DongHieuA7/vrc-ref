<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: `Admin - ${t('common.projects')}` })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const currentAdminId = computed(() => user.value?.id || '')
const { isGlobalAdmin, canManageProject } = useAdminRole()

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

// Role states
const isGlobalAdminValue = ref(false)
const projectPermissions = ref<Record<string, boolean>>({})

// Check if current user can manage a project (Global Admin or Project Owner)
const canManageProjectSync = (project: Project | null): boolean => {
  if (!project || !currentAdminId.value) return false
  // Use cached permission if available
  if (projectPermissions.value[project.id] !== undefined) {
    return projectPermissions.value[project.id]
  }
  // Fallback: check if in admins array (for Project Owner)
  return (project.admins || []).includes(currentAdminId.value)
}

// Backward compatibility - check if user is project owner (not global admin)
const isProjectAdmin = (project: Project | null): boolean => {
  if (!project || !currentAdminId.value) return false
  // If global admin, return true
  if (isGlobalAdminValue.value) return true
  // Otherwise check if in admins array
  return (project.admins || []).includes(currentAdminId.value)
}

// Filter out users already in project
const availableUserOptionsForManage = computed(() => {
  const set = new Set(projectUsers.value)
  return allUsers.value
    .filter(u => !set.has(u.id))
    .map(u => ({ label: u.name || u.email, value: u.id }))
})

const userOptions = computed(() => allUsers.value.map(u => ({ label: u.name || u.email, value: u.id })))

// Admin options for creating project (only project owners)
const availableOwnerOptions = computed(() => {
  return allAdmins.value
    .filter(a => {
      // Only allow project_owner or null role (exclude global_admin)
      return a.role !== 'global_admin'
    })
    .map(a => ({ 
      label: `${a.name || a.email}${a.role ? ` (${a.role === 'project_owner' ? 'Project Owner' : a.role})` : ''}`, 
      value: a.id 
    }))
})

// Filter out admins already in project and global admins
// Only project owners can be added to projects
const availableAdminOptionsForManage = computed(() => {
  if (!selected.value) return []
  const set = new Set(selected.value.admins || [])
  return allAdmins.value
    .filter(a => {
      // Exclude if already in project
      if (set.has(a.id)) return false
      // Exclude global admins (only allow project_owner or null role)
      // Global admins must be set manually in database
      return a.role !== 'global_admin'
    })
    .map(a => ({ 
      label: `${a.name || a.email}${a.role ? ` (${a.role === 'project_owner' ? 'Project Owner' : a.role})` : ''}`, 
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
  
  draft.id = p.id
  draft.name = p.name
  draft.commission_rate_min = p.commission_rate_min || null
  draft.commission_rate_max = p.commission_rate_max || null
  draft.policy = p.policy || null
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
  const admins = draft.selectedOwners.length > 0 
    ? draft.selectedOwners 
    : [currentAdminId.value]
  
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
    console.error('Error creating project:', error)
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToCreateProject'),
      description: error.message,
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
      const userInserts = draft.selectedUsers.map(uid => ({
        project_id: data.id,
        user_id: uid,
        ref_percentage: 10
      }))
      
      const { error: usersError } = await supabase
        .from('user_project_info')
        .insert(userInserts)
      
      if (usersError) {
        console.error('Error adding users to project:', usersError)
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
const saveProject = async () => {
  if (!draft.id) return
  
  const project = projects.value.find(p => p.id === draft.id)
  if (!project) return
  
  // Check if current user can manage this project
  const canManage = await canManageProject(project.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: isGlobalAdminValue.value ? t('admin.onlyGlobalAdminsCanEdit') : t('admin.onlyProjectAdminsCanEdit'),
    })
    isEditOpen.value = false
    return
  }
  
  await supabase.from('projects').update({ 
    name: draft.name.trim(),
    commission_rate_min: draft.commission_rate_min || null,
    commission_rate_max: draft.commission_rate_max || null,
    policy: draft.policy || null
  }).eq('id', draft.id)
  const idx = projects.value.findIndex(p => p.id === draft.id)
  if (idx !== -1) {
    projects.value[idx].name = draft.name.trim()
    projects.value[idx].commission_rate_min = draft.commission_rate_min || null
    projects.value[idx].commission_rate_max = draft.commission_rate_max || null
    projects.value[idx].policy = draft.policy || null
  }
  isEditOpen.value = false
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
  
  await supabase.from('projects').delete().eq('id', p.id)
  projects.value = projects.value.filter(x => x.id !== p.id)
}

const manageState = reactive<{ addUser?: string, addAdmin?: string }>({})
const projectUsers = ref<string[]>([]) // Store users for selected project

const fetchProjectUsers = async (projectId: string) => {
  const { data } = await supabase
    .from('user_project_info')
    .select('user_id')
    .eq('project_id', projectId)
  projectUsers.value = (data || []).map((r: any) => r.user_id)
}

const addUserToProject = async () => { 
  if (!selected.value || !manageState.addUser) return
  
  // Check if current user can manage this project
  const canManage = await canManageProject(selected.value.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: isGlobalAdminValue.value ? t('admin.onlyGlobalAdminsCanAddUsers') : t('admin.onlyProjectAdminsCanAddUsers'),
    })
    return
  }
  
  // Check if user already in project
  if (projectUsers.value.includes(manageState.addUser)) {
    const toast = useToast()
    toast.add({
      color: 'yellow',
      title: t('messages.userAlreadyInProject'),
      description: t('messages.userAlreadyInProject'),
    })
    return
  }
  
  const { error } = await supabase
    .from('user_project_info')
    .upsert({ 
      project_id: selected.value.id, 
      user_id: manageState.addUser, 
      ref_percentage: 10 
    }, { onConflict: 'project_id,user_id' })
  
  if (error) {
    console.error('Error adding user:', error)
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToAddUser'),
      description: error.message,
    })
    return
  }
  
  manageState.addUser = undefined
  await fetchProjectUsers(selected.value.id)
  await refreshCounts()
}

const removeUserFromProject = async (uid: string) => { 
  if (!selected.value) return
  
  // Check if current user is admin of this project
  if (!isProjectAdmin(selected.value)) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyProjectAdminsCanRemoveUsers'),
    })
    return
  }
  
  await supabase.from('user_project_info').delete().eq('project_id', selected.value.id).eq('user_id', uid)
  projectUsers.value = projectUsers.value.filter(id => id !== uid)
  await refreshCounts()
}

const addAdminToProject = async () => { 
  if (!selected.value || !manageState.addAdmin) return
  
  // Check if current user can manage this project
  const canManage = await canManageProject(selected.value.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: isGlobalAdminValue.value ? t('admin.onlyGlobalAdminsCanAddAdmins') : t('admin.onlyProjectAdminsCanAddAdmins'),
    })
    return
  }
  
  // Check if trying to add a global admin
  const adminToAdd = allAdmins.value.find(a => a.id === manageState.addAdmin)
  if (adminToAdd && adminToAdd.role === 'global_admin') {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.cannotAddGlobalAdmin'),
      description: t('admin.globalAdminMustBeSetManually'),
    })
    return
  }
  
  // Check if admin already in project
  if ((selected.value.admins || []).includes(manageState.addAdmin)) {
    const toast = useToast()
    toast.add({
      color: 'yellow',
      title: t('messages.adminAlreadyInProject'),
      description: t('messages.adminAlreadyInProject'),
    })
    return
  }
  
  const p = projects.value.find(pr => pr.id === selected.value!.id)
  if (!p) return
  
  const next = Array.from(new Set([...(p.admins || []), manageState.addAdmin]))
  const { error } = await supabase
    .from('projects')
    .update({ admins: next })
    .eq('id', p.id)
  
  if (error) {
    console.error('Error adding admin:', error)
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToAddAdmin'),
      description: error.message,
    })
    return
  }
  
  p.admins = next
  selected.value.admins = next
  manageState.addAdmin = undefined
}

const removeAdminFromProject = async (uid: string) => { 
  if (!selected.value) return
  
  // Check if current user can manage this project
  const canManage = await canManageProject(selected.value.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: isGlobalAdminValue.value ? t('admin.onlyGlobalAdminsCanRemoveAdmins') : t('admin.onlyProjectAdminsCanRemoveAdmins'),
    })
    return
  }
  
  const p = projects.value.find(pr => pr.id === selected.value!.id)
  if (!p) return
  const next = (p.admins || []).filter(id => id !== uid)
  await supabase.from('projects').update({ admins: next }).eq('id', p.id)
  p.admins = next
  selected.value.admins = next
}

const displayUser = (uid: string) => { 
  const u = allUsers.value.find(x => x.id === uid)
  return u ? (u.name || u.email) : uid 
}

const displayAdmin = (uid: string) => { 
  const a = allAdmins.value.find(x => x.id === uid)
  return a ? (a.name || a.email) : uid 
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
  await fetchProjectUsers(p.id)
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

const saveUsers = () => { isManageUsersOpen.value = false }
const saveAdmins = () => { isManageAdminsOpen.value = false }

const refreshCounts = async () => {
  const { data } = await supabase.from('user_project_info').select('project_id, user_id')
  const counts: Record<string, number> = {}
  ;(data || []).forEach(r => { counts[r.project_id] = (counts[r.project_id] || 0) + 1 })
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
    <UModal v-model="isEditOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">{{ $t('projects.editProject') }}</h3>
        </template>
        <div class="space-y-4">
          <UFormGroup :label="$t('common.name')">
            <UInput v-model="draft.name" @keyup.enter="saveProject" />
          </UFormGroup>
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
          <UFormGroup :label="$t('projects.policy')">
            <UTextarea 
              v-model="(draft as any).policy" 
              :rows="4"
              :placeholder="$t('projects.policyPlaceholder')"
            />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isEditOpen = false">{{ $t('common.cancel') }}</UButton>
            <UButton color="primary" @click="saveProject" :disabled="!draft.name.trim()">{{ $t('common.save') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Manage Users -->
    <UModal v-model="isManageUsersOpen">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">{{ $t('projects.manageUsers') }}</h3>
            <div class="flex items-center gap-2">
              <USelect 
                v-model="(manageState as any).addUser" 
                :options="availableUserOptionsForManage" 
                :placeholder="$t('projects.selectUser')"
                class="w-48"
              />
              <UButton 
                color="primary" 
                @click="addUserToProject" 
                :disabled="!manageState.addUser || projectUsers.includes(manageState.addUser || '')"
              >
                {{ $t('common.add') }}
              </UButton>
            </div>
          </div>
        </template>
        <div class="space-y-4">
          <div v-if="projectUsers.length > 0" class="flex flex-wrap gap-2">
            <UBadge v-for="uid in projectUsers" :key="uid" color="gray">
              <span class="mr-1">{{ displayUser(uid) }}</span>
              <UButton size="2xs" color="red" variant="link" @click="removeUserFromProject(uid)">×</UButton>
            </UBadge>
          </div>
          <div v-else class="text-sm text-gray-500 text-center py-4">
            {{ $t('projects.noUsers') }}
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isManageUsersOpen = false">{{ $t('common.cancel') }}</UButton>
            <UButton color="primary" @click="saveUsers">{{ $t('common.save') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Manage Admins -->
    <UModal v-model="isManageAdminsOpen">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">{{ $t('projects.manageAdmins') }}</h3>
            <div class="flex items-center gap-2">
              <USelect 
                v-model="(manageState as any).addAdmin" 
                :options="availableAdminOptionsForManage" 
                :placeholder="$t('projects.selectAdmin')"
                class="w-48"
              />
              <UButton 
                color="primary" 
                @click="addAdminToProject" 
                :disabled="!manageState.addAdmin || (selected?.admins || []).includes(manageState.addAdmin || '')"
              >
                {{ $t('common.add') }}
              </UButton>
            </div>
          </div>
        </template>
        <div class="space-y-4">
          <p class="text-xs text-gray-500">{{ $t('admin.onlyProjectOwnersCanBeAdded') }}</p>
          <div v-if="selected?.admins && selected.admins.length > 0" class="flex flex-wrap gap-2">
            <UBadge v-for="uid in selected.admins" :key="uid" color="primary">
              <span class="mr-1">{{ displayAdmin(uid) }}</span>
              <UButton size="2xs" color="red" variant="link" @click="removeAdminFromProject(uid)">×</UButton>
            </UBadge>
          </div>
          <div v-else class="text-sm text-gray-500 text-center py-4">
            {{ $t('projects.noAdmins') }}
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isManageAdminsOpen = false">{{ $t('common.cancel') }}</UButton>
            <UButton color="primary" @click="saveAdmins">{{ $t('common.save') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<style scoped></style>
