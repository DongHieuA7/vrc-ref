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
const { canManageProjectSync: canManageProjectSyncHelper, refreshCounts: refreshCountsHelper } = useProjectManagement()

type Project = { id: string, name: string, admins: string[], commission_rate_min?: number | null, commission_rate_max?: number | null, policy?: string | null }
const allProjects = ref<Project[]>([])
const allUsers = ref<any[]>([])
const allAdmins = ref<any[]>([])

const isEditOpen = ref(false)
const isManageUsersOpen = ref(false)
const isManageAdminsOpen = ref(false)
const selected = ref<Project | null>(null)
const editProject = ref<Project | null>(null)

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
  return canManageProjectSyncHelper(project, projectPermissions.value)
}

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
  
  editProject.value = JSON.parse(JSON.stringify(p))
  isEditOpen.value = true 
}

const handleProjectUpdated = async () => {
  // Refresh projects list
  const { data: projs } = await supabase.from('projects').select('id, name, admins, commission_rate_min, commission_rate_max, policy').order('name')
  if (projs) {
    allProjects.value = projs
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
      :projects="allProjects"
      :is-global-admin="isGlobalAdminValue"
      @updated="handleProjectUpdated"
    />

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
              {{ $t('commissions.commissionAmount') }}: {{ formatValue(calculateCommissionAmount(), 'VND') }}
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

