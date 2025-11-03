<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: `Admin - ${t('admin.myProjects') || 'My Projects'}` })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const currentAdminId = computed(() => user.value?.id || '')
const { isGlobalAdmin, canManageProject } = useAdminRole()
const { getErrorMessage } = useErrorMessage()
const { formatDate, formatValue, formatStatus, statusColor } = useCommissionFormatters()

type Project = { id: string, name: string, admins: string[], commission_rate_min?: number | null, commission_rate_max?: number | null, policy?: string | null }
const allProjects = ref<Project[]>([])
const allUsers = ref<any[]>([])
const allAdmins = ref<any[]>([])

const isEditOpen = ref(false)
const isManageUsersOpen = ref(false)
const isManageAdminsOpen = ref(false)

// Commissions
const commissions = ref<any[]>([])
const isLoadingCommissions = ref(false)

// Commission filters
const selectedProject = ref<string>('')
const selectedStatus = ref<string>('')
const selectedYear = ref<number | string>('')
const selectedMonth = ref<string>('')

// Edit commission modal
const isEditCommissionOpen = ref(false)
const editCommissionDraft = reactive<{
  id: string
  contract_amount: number | null
  commission_rate: number | null
  status: string
  client_name: string
  description: string
}>({
  id: '',
  contract_amount: null,
  commission_rate: null,
  status: 'requested',
  client_name: '',
  description: '',
})

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

// Filter projects - only show projects where current admin is in admins array
// Global admins see all projects, project owners see only their projects
const filteredProjects = computed(() => {
  if (isGlobalAdminValue.value) {
    // Global admin sees all projects
    return allProjects.value
  }
  // Project owner sees only projects where they are in admins array
  return allProjects.value.filter(p => 
    p.admins && Array.isArray(p.admins) && p.admins.includes(currentAdminId.value)
  )
})

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
const tableRows = computed(() => filteredProjects.value.map(p => ({
  ...p,
  usersCount: projectIdToUsersCount.value[p.id] || 0,
  adminsCount: (p.admins || []).length,
})))

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

const saveProject = async () => {
  if (!draft.id) return
  
  const project = allProjects.value.find(p => p.id === draft.id)
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
  
  const { error } = await supabase.from('projects').update({ 
    name: draft.name.trim(),
    commission_rate_min: draft.commission_rate_min || null,
    commission_rate_max: draft.commission_rate_max || null,
    policy: draft.policy || null
  }).eq('id', draft.id)
  
  if (error) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToUpdate'),
      description: getErrorMessage(error),
    })
    return
  }
  
  const idx = allProjects.value.findIndex(p => p.id === draft.id)
  if (idx !== -1) {
    allProjects.value[idx].name = draft.name.trim()
    allProjects.value[idx].commission_rate_min = draft.commission_rate_min || null
    allProjects.value[idx].commission_rate_max = draft.commission_rate_max || null
    allProjects.value[idx].policy = draft.policy || null
  }
  isEditOpen.value = false
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
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToAddUser'),
      description: getErrorMessage(error),
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
  
  const { error } = await supabase.from('user_project_info').delete().eq('project_id', selected.value.id).eq('user_id', uid)
  
  if (error) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToRemove'),
      description: getErrorMessage(error),
    })
    return
  }
  
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
  
  const p = allProjects.value.find(pr => pr.id === selected.value!.id)
  if (!p) return
  
  const next = Array.from(new Set([...(p.admins || []), manageState.addAdmin]))
  const { error } = await supabase
    .from('projects')
    .update({ admins: next })
    .eq('id', p.id)
  
  if (error) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToAddAdmin'),
      description: getErrorMessage(error),
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
  
  const p = allProjects.value.find(pr => pr.id === selected.value!.id)
  if (!p) return
  const next = (p.admins || []).filter(id => id !== uid)
  const { error } = await supabase.from('projects').update({ admins: next }).eq('id', p.id)
  
  if (error) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToRemove'),
      description: getErrorMessage(error),
    })
    return
  }
  
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

// Get project IDs that admin manages
const managedProjectIds = computed(() => {
  return filteredProjects.value.map(p => p.id)
})

// Fetch commissions from managed projects
const fetchCommissions = async () => {
  if (managedProjectIds.value.length === 0) {
    commissions.value = []
    return
  }
  
  isLoadingCommissions.value = true
  try {
    const { data, error } = await supabase
      .from('commissions')
      .select('id, user_id, project_id, client_name, description, date, status, value, original_value, currency, contract_amount, commission_rate')
      .in('project_id', managedProjectIds.value)
      .order('date', { ascending: false })
    
    if (error) {
      return
    }
    
    commissions.value = data || []
  } finally {
    isLoadingCommissions.value = false
  }
}

// Helper function to extract date parts from various date formats
const getDateString = (dateValue: any): string => {
  if (!dateValue) return ''
  if (typeof dateValue === 'string') return dateValue
  if (dateValue instanceof Date) return dateValue.toISOString()
  if (typeof dateValue === 'number') return new Date(dateValue).toISOString()
  return String(dateValue)
}

// Get project name
const getProjectName = (projectId: string) => {
  if (!projectId) return '—'
  return filteredProjects.value.find(p => p.id === projectId)?.name || projectId
}

// Get user name/email
const getUserName = (userId: string) => {
  if (!userId) return '—'
  const u = allUsers.value.find(u => u.id === userId)
  return u ? (u.name || u.email) : userId
}

// Filtered commissions
const filteredCommissions = computed(() => {
  let filtered = commissions.value
  
  if (selectedProject.value) {
    filtered = filtered.filter(c => c.project_id === selectedProject.value)
  }
  
  if (selectedStatus.value) {
    filtered = filtered.filter(c => c.status === selectedStatus.value)
  }
  
  // Filter by year if selected
  if (selectedYear.value && selectedYear.value !== '') {
    const yearStr = String(selectedYear.value)
    filtered = filtered.filter(c => {
      const dateStr = getDateString(c.date)
      if (!dateStr) return false
      const year = dateStr.slice(0, 4)
      return year === yearStr
    })
  }
  
  // Filter by month if selected
  if (selectedMonth.value && selectedMonth.value !== '') {
    const monthStr = selectedMonth.value
    filtered = filtered.filter(c => {
      const dateStr = getDateString(c.date)
      if (!dateStr) return false
      const yearMonth = dateStr.slice(0, 7)
      return yearMonth === monthStr
    })
  }
  
  return filtered
})

// Project options for commission filter (only managed projects)
const commissionProjectOptions = computed(() => [
  { label: t('common.all'), value: '' },
  ...filteredProjects.value.map(p => ({ label: p.name || p.id, value: p.id }))
])

// Status options
const statusOptions = computed(() => [
  { label: t('common.all'), value: '' },
  { label: capitalize(t('commissions.requested')), value: 'requested' },
  { label: capitalize(t('commissions.confirmed')), value: 'confirmed' },
  { label: capitalize(t('commissions.paid')), value: 'paid' },
])

// Capitalize helper
const capitalize = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Date filters
const { yearOptions, monthOptions } = useDateFilters(selectedYear, selectedMonth)

// Reset commission filters
const resetCommissionFilters = () => {
  selectedProject.value = ''
  selectedStatus.value = ''
  selectedYear.value = ''
  selectedMonth.value = ''
}

// Open edit commission modal
const openEditCommission = (row: any) => {
  if (!row || !row.id) return
  
  editCommissionDraft.id = row.id || ''
  editCommissionDraft.contract_amount = (row.contract_amount != null && row.contract_amount !== '') 
    ? Number(row.contract_amount) 
    : (row.original_value != null && row.original_value !== '') 
      ? Number(row.original_value) 
      : null
  editCommissionDraft.commission_rate = (row.commission_rate != null && row.commission_rate !== '') 
    ? Number(row.commission_rate) 
    : null
  editCommissionDraft.status = row.status || 'requested'
  editCommissionDraft.client_name = (row.client_name != null) ? String(row.client_name) : ''
  editCommissionDraft.description = (row.description != null) ? String(row.description) : ''
  
  nextTick(() => {
    isEditCommissionOpen.value = true
  })
}

// Calculate commission amount
const calculateCommissionAmount = () => {
  if (editCommissionDraft.contract_amount != null && editCommissionDraft.commission_rate != null) {
    return Number(editCommissionDraft.contract_amount || 0) * (Number(editCommissionDraft.commission_rate || 0) / 100)
  }
  return 0
}

// Save commission
const saveCommission = async () => {
  if (!editCommissionDraft.id) return
  
  isLoadingCommissions.value = true
  try {
    const calculatedValue = calculateCommissionAmount()
    
    const updateData: any = {
      client_name: editCommissionDraft.client_name || null,
      description: editCommissionDraft.description || null,
      contract_amount: editCommissionDraft.contract_amount || null,
      commission_rate: editCommissionDraft.commission_rate || null,
      status: editCommissionDraft.status,
      original_value: editCommissionDraft.contract_amount || null,
    }
    
    if (calculatedValue > 0 && editCommissionDraft.contract_amount != null && editCommissionDraft.commission_rate != null) {
      updateData.value = calculatedValue
    }
    
    const { error } = await supabase
      .from('commissions')
      .update(updateData)
      .eq('id', editCommissionDraft.id)
    
    if (error) throw error
    
    await fetchCommissions()
    isEditCommissionOpen.value = false
    
    const toast = useToast()
    toast.add({
      color: 'green',
      title: t('common.save'),
      description: t('messages.success'),
    })
  } catch (error: any) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToUpdate'),
      description: getErrorMessage(error),
    })
  } finally {
    isLoadingCommissions.value = false
  }
}

onMounted(async () => {
  // Check if user is global admin
  isGlobalAdminValue.value = await isGlobalAdmin()
  
  const [{ data: projs }, { data: users }, { data: admins }] = await Promise.all([
    supabase.from('projects').select('id, name, admins, commission_rate_min, commission_rate_max, policy').order('name'),
    supabase.from('user_profiles').select('id, email, name'),
    supabase.from('admins').select('id, email, name, role')
  ])
  allProjects.value = projs || []
  allUsers.value = users || []
  allAdmins.value = admins || []
  
  // Pre-check permissions for all projects
  if (currentAdminId.value) {
    for (const project of allProjects.value) {
      const canManage = await canManageProject(project.id)
      projectPermissions.value[project.id] = canManage
    }
  }
  
  await refreshCounts()
  await fetchCommissions()
})

// Watch for project changes to refetch commissions
watch(filteredProjects, () => {
  fetchCommissions()
})
</script>

<template>
  <div class="container mx-auto">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{{ $t('admin.myProjects') || 'My Projects' }}</h2>
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
          </div>
        </template>
        <template #empty>
          <div class="text-center py-8 text-gray-500">
            {{ $t('projects.noProjects') || 'No projects found' }}
          </div>
        </template>
      </UTable>
    </UCard>

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

    <!-- Commissions Section -->
    <UCard class="mt-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{{ $t('admin.allCommissions') || 'All Commissions' }}</h2>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500">{{ $t('common.filter') }}</span>
            <USelect 
              v-model="selectedProject" 
              :options="commissionProjectOptions" 
              :placeholder="$t('common.project')"
              class="min-w-[150px]"
            />
            <USelect 
              v-model="selectedStatus" 
              :options="statusOptions" 
              :placeholder="$t('common.status')"
              class="min-w-[120px]"
            />
            <USelect 
              v-model="selectedYear" 
              :options="yearOptions" 
              :placeholder="$t('common.year')"
              class="min-w-[100px]"
            />
            <USelect 
              v-model="selectedMonth" 
              :options="monthOptions" 
              :placeholder="$t('common.month')"
              class="min-w-[150px]"
              :disabled="!selectedYear"
            />
            <UButton 
              v-if="selectedProject || selectedStatus || selectedYear || selectedMonth"
              color="gray" 
              variant="soft" 
              size="xs"
              @click="resetCommissionFilters"
              icon="i-lucide-x"
            >
              {{ $t('common.reset') || 'Reset' }}
            </UButton>
          </div>
        </div>
      </template>

      <div v-if="isLoadingCommissions" class="text-center py-8">
        <div class="text-gray-500">{{ $t('common.loading') || 'Loading...' }}</div>
      </div>

      <UTable 
        v-else
        :rows="filteredCommissions" 
        :columns="[
          { key: 'date', label: $t('common.date') },
          { key: 'user_id', label: $t('common.user') },
          { key: 'project_id', label: $t('common.project') },
          { key: 'client_name', label: $t('commissions.clientName') },
          { key: 'description', label: $t('common.description') },
          { key: 'contract_amount', label: $t('commissions.contractAmount') },
          { key: 'commission_rate', label: $t('commissions.commissionRate') },
          { key: 'value', label: $t('commissions.commissionAmount') },
          { key: 'status', label: $t('common.status') },
          { key: 'actions', label: $t('common.actions') },
        ]"
      >
        <template #date-data="{ row }">
          <span>{{ formatDate(row.date) }}</span>
        </template>
        <template #user_id-data="{ row }">
          <NuxtLink 
            class="text-primary hover:underline" 
            :to="`/admin/users/${row.user_id}`"
          >
            {{ getUserName(row.user_id) }}
          </NuxtLink>
        </template>
        <template #project_id-data="{ row }">
          <NuxtLink 
            class="text-primary hover:underline" 
            :to="`/admin/projects/${row.project_id}`"
          >
            {{ getProjectName(row.project_id) }}
          </NuxtLink>
        </template>
        <template #client_name-data="{ row }">
          <span>{{ row.client_name || '—' }}</span>
        </template>
        <template #description-data="{ row }">
          <span class="max-w-xs truncate block" :title="row.description">{{ row.description || '—' }}</span>
        </template>
        <template #contract_amount-data="{ row }">
          <span>{{ formatValue(row.contract_amount != null ? row.contract_amount : row.original_value, row.currency) }}</span>
        </template>
        <template #commission_rate-data="{ row }">
          <span>{{ row.commission_rate != null ? `${row.commission_rate}%` : '—' }}</span>
        </template>
        <template #value-data="{ row }">
          <span>{{ formatValue(row.value, row.currency) }}</span>
        </template>
        <template #status-data="{ row }">
          <UBadge 
            :label="formatStatus(row.status || 'unknown')" 
            :color="statusColor(row.status)" 
            variant="soft" 
          />
        </template>
        <template #actions-data="{ row }">
          <UButton 
            size="xs" 
            color="gray" 
            @click="openEditCommission(row)"
          >
            {{ $t('common.edit') }}
          </UButton>
        </template>
        <template #empty>
          <div class="text-center py-8 text-gray-500">
            {{ $t('commissions.noCommissions') }}
          </div>
        </template>
      </UTable>
    </UCard>

    <!-- Edit Commission Modal -->
    <UModal v-model="isEditCommissionOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">{{ $t('commissions.editCommission') }}</h3>
        </template>
        <div class="space-y-4">
          <UFormGroup :label="$t('commissions.clientName')">
            <UInput 
              v-model="editCommissionDraft.client_name" 
              :placeholder="$t('commissions.clientNamePlaceholder')" 
            />
          </UFormGroup>
          
          <UFormGroup :label="$t('common.description')">
            <UTextarea 
              v-model="editCommissionDraft.description" 
              :rows="3"
            />
          </UFormGroup>
          
          <UFormGroup :label="$t('commissions.contractAmount')">
            <UInput 
              v-model.number="editCommissionDraft.contract_amount" 
              type="number" 
              step="0.01"
              :placeholder="$t('commissions.contractAmount')"
            />
          </UFormGroup>
          
          <UFormGroup :label="$t('commissions.commissionRate')">
            <UInput 
              v-model.number="editCommissionDraft.commission_rate" 
              type="number" 
              step="0.01" 
              min="0" 
              max="100"
              :placeholder="$t('commissions.commissionRate')"
            />
            <p class="text-xs text-gray-500 mt-1">
              {{ $t('commissions.commissionAmount') }}: {{ formatValue(calculateCommissionAmount(), 'USD') }}
            </p>
          </UFormGroup>
          
          <UFormGroup :label="$t('common.status')">
            <USelect 
              v-model="editCommissionDraft.status"
              :options="[
                { label: capitalize($t('commissions.requested')), value: 'requested' },
                { label: capitalize($t('commissions.confirmed')), value: 'confirmed' },
                { label: capitalize($t('commissions.paid')), value: 'paid' },
              ]"
            />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton 
              color="gray" 
              variant="soft" 
              @click="isEditCommissionOpen = false"
            >
              {{ $t('common.cancel') }}
            </UButton>
            <UButton 
              color="primary" 
              @click="saveCommission"
            >
              {{ $t('common.save') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<style scoped></style>

