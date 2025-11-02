<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth', 'user-only'] })
useSeoMeta({ title: t('commissions.myCommissionRequests') })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const isLoading = ref(false)
const commissions = ref<any[]>([])
const isModalOpen = ref(false)
const editDraft = reactive<{ id: string; client_name: string; description: string; contract_amount: number | undefined; currency: string }>({ id: '', client_name: '', description: '', contract_amount: undefined, currency: 'USD' })
const isCreateOpen = ref(false)
const selectedYear = ref<number | string>('')
const selectedMonth = ref<string>('')
const selectedProject = ref<string>('')
const selectedStatus = ref<string>('')

const form = reactive({
  project_id: '',
  client_name: '',
  description: '',
  contract_amount: undefined as unknown as number,
  currency: 'USD' as 'USD' | 'VND',
})

const projects = ref<any[]>([])
// Store ref_percentage for each project
const projectRefPercentages = ref<Record<string, number>>({})

const { formatDate, formatValue, formatStatus, statusColor: getStatusColor } = useCommissionFormatters()

const fetchProjects = async () => {
  if (!user.value) return
  
  // Fetch only projects that the user has joined (from user_project_info)
  const { data: userProjects, error } = await supabase
    .from('user_project_info')
    .select('project_id, ref_percentage')
    .eq('user_id', user.value.id)
  
  if (error) {
    console.error('Error fetching user projects:', error)
    projects.value = []
    return
  }
  
  if (!userProjects || userProjects.length === 0) {
    projects.value = []
    return
  }
  
  // Remove duplicates (in case there are any)
  const uniqueProjectIds = Array.from(new Set(userProjects.map(up => up.project_id)))
  
  console.log('[DEBUG] User projects from user_project_info:', userProjects.length, 'Unique:', uniqueProjectIds.length, uniqueProjectIds)
  
  if (uniqueProjectIds.length === 0) {
    projects.value = []
    return
  }
  
  // Store ref_percentage for each project
  const percentages: Record<string, number> = {}
  for (const up of userProjects || []) {
    percentages[up.project_id] = Number(up.ref_percentage || 0)
  }
  projectRefPercentages.value = percentages
  
  // Fetch project details for joined projects
  const { data, error: projectsError } = await supabase
    .from('projects')
    .select('id, name')
    .in('id', uniqueProjectIds)
    .order('name')
  
  if (projectsError) {
    console.error('Error fetching projects:', projectsError)
    projects.value = []
    return
  }
  
  console.log('[DEBUG] Fetched projects:', data?.length, data?.map(p => p.name))
  
  projects.value = data || []
}

const fetchCommissions = async () => {
  if (!user.value) return
  const { data } = await supabase
    .from('commissions')
    .select('id, project_id, client_name, description, date, status, value, original_value, currency, contract_amount, commission_rate')
    .eq('user_id', user.value.id)
    .order('date', { ascending: false })
  commissions.value = data || []
}

onMounted(async () => {
  await Promise.all([fetchProjects(), fetchCommissions()])
  // Don't set default filters - show all commissions
})

const getProjectLabel = (projectId: string) => {
  return projects.value.find(p => p.id === projectId)?.name || 'Failed to get cell value'
}

// Get original value (before calculation)
const getOriginalValue = (commission: any) => {
  // If original_value exists, use it (for approved/claimed commissions)
  if (commission.original_value != null) {
    return Number(commission.original_value || 0)
  }
  // Otherwise, use current value (for requested commissions)
  return Number(commission.value || 0)
}

// Calculate commission received
const getCommissionReceived = (commission: any) => {
  if (commission.status === 'confirmed' || commission.status === 'paid') {
    // Already calculated when confirmed, return the value
    return Number(commission.value || 0)
  }
  
  // For requested status, use contract_amount and commission_rate if available
  if (commission.contract_amount != null && commission.commission_rate != null) {
    return Number(commission.contract_amount || 0) * (Number(commission.commission_rate || 0) / 100)
  }
  
  // Fallback: calculate based on ref_percentage
  const refPercentage = projectRefPercentages.value[commission.project_id] || 0
  const originalValue = getOriginalValue(commission)
  return originalValue * (refPercentage / 100)
}

const statusColor = getStatusColor
const { yearOptions, monthOptions } = useDateFilters(selectedYear, selectedMonth)

const filteredCommissions = computed(() => {
  let filtered = commissions.value
  
  // Filter by year (if year is selected)
  if (selectedYear.value) {
    filtered = filtered.filter(c => (c.date || '').slice(0,4) === String(selectedYear.value))
  }
  
  // Filter by month
  if (selectedMonth.value) {
    filtered = filtered.filter(c => (c.date || '').slice(0,7) === selectedMonth.value)
  }
  
  // Filter by project
  if (selectedProject.value) {
    filtered = filtered.filter(c => c.project_id === selectedProject.value)
  }
  
  // Filter by status
  if (selectedStatus.value) {
    filtered = filtered.filter(c => c.status === selectedStatus.value)
  }
  
  return filtered
})

// Project filter options
const projectOptions = computed(() => {
  const { t } = useI18n()
  const options = [
    { label: t('common.all'), value: '' }
  ]
  for (const p of projects.value) {
    options.push({ label: p.name || p.id, value: p.id })
  }
  return options
})

// Status filter options
const statusOptions = computed(() => {
  const { t } = useI18n()
  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)
  return [
    { label: t('common.all'), value: '' },
    { label: capitalize(t('commissions.requested')), value: 'requested' },
    { label: capitalize(t('commissions.confirmed')), value: 'confirmed' },
    { label: capitalize(t('commissions.paid')), value: 'paid' },
  ]
})

// formatStatus is already imported from useCommissionFormatters

// Total statistics should show all commissions, not filtered ones
// Calculate separately by currency
const totals = computed(() => {
  const list = commissions.value
  const result = {
    // Total Contract Amount: Sum all contract_amount
    totalContractAmountUSD: 0,
    totalContractAmountVND: 0,
    // Pending Contract Amount: Sum contract_amount of status = requested
    pendingContractAmountUSD: 0,
    pendingContractAmountVND: 0,
    // Received Commission: Sum commission amount (value) of status = paid
    receivedCommissionUSD: 0,
    receivedCommissionVND: 0,
    // Pending Commission: Sum commission amount (value) of status = confirmed
    pendingCommissionUSD: 0,
    pendingCommissionVND: 0,
  }
  
  for (const c of list) {
    const currency = c.currency || 'USD'
    
    // Get contract amount (use contract_amount if exists, otherwise original_value, otherwise 0)
    const contractAmount = c.contract_amount != null ? Number(c.contract_amount || 0) : (c.original_value != null ? Number(c.original_value || 0) : 0)
    
    // Get commission amount (value)
    const commissionAmount = Number(c.value || 0)
    
    if (currency === 'VND') {
      // Total Contract Amount - sum all
      result.totalContractAmountVND += contractAmount
      
      // Pending Contract Amount - status = requested
      if (c.status === 'requested') {
        result.pendingContractAmountVND += contractAmount
      }
      
      // Received Commission - status = paid
      if (c.status === 'paid') {
        result.receivedCommissionVND += commissionAmount
      }
      
      // Pending Commission - status = confirmed
      if (c.status === 'confirmed') {
        result.pendingCommissionVND += commissionAmount
      }
    } else {
      // Total Contract Amount - sum all
      result.totalContractAmountUSD += contractAmount
      
      // Pending Contract Amount - status = requested
      if (c.status === 'requested') {
        result.pendingContractAmountUSD += contractAmount
      }
      
      // Received Commission - status = paid
      if (c.status === 'paid') {
        result.receivedCommissionUSD += commissionAmount
      }
      
      // Pending Commission - status = confirmed
      if (c.status === 'confirmed') {
        result.pendingCommissionUSD += commissionAmount
      }
    }
  }
  
  return result
})

const perProject = computed(() => {
  const map: Record<string, { project_id: string, total: number, confirmed: number, paid: number, count: number }> = {}
  for (const c of filteredCommissions.value) {
    const key = c.project_id
    if (!map[key]) map[key] = { project_id: key, total: 0, confirmed: 0, paid: 0, count: 0 }
    map[key].total += Number(c.value || 0)
    map[key].confirmed += c.status === 'confirmed' ? Number(c.value || 0) : 0
    map[key].paid += c.status === 'paid' ? Number(c.value || 0) : 0
    map[key].count += 1
  }
  return Object.values(map)
})

// Project count should show all projects that user has joined (from user_project_info)
// This matches the dropdown options in "New Commission"
const projectCount = computed(() => projects.value.length)

const submit = async () => {
  try {
    isLoading.value = true
    if (!user.value) return
    const { error } = await supabase
      .from('commissions')
      .insert({
        user_id: user.value.id,
        project_id: form.project_id,
        client_name: form.client_name || null,
        description: form.description,
        contract_amount: form.contract_amount,
        value: 0, // Will be calculated by admin when setting commission_rate
        original_value: form.contract_amount, // Store contract amount as original value
        currency: form.currency,
        status: 'requested',
      })
    if (error) throw error
    form.project_id = ''
    form.client_name = ''
    form.description = ''
    ;(form as any).contract_amount = undefined
    form.currency = 'USD'
    isCreateOpen.value = false
    await fetchCommissions()
  } finally {
    isLoading.value = false
  }
}

const openEdit = (row: any) => {
  if (row.status === 'confirmed' || row.status === 'paid') return
  editDraft.id = row.id
  editDraft.client_name = row.client_name || ''
  editDraft.description = row.description
  // Use contract_amount if exists, otherwise use original_value or value
  ;(editDraft as any).contract_amount = row.contract_amount != null ? row.contract_amount : (row.original_value != null ? row.original_value : row.value)
  editDraft.currency = row.currency || 'USD'
  isModalOpen.value = true
}

const saveEdit = async () => {
  const idx = commissions.value.findIndex(c => c.id === editDraft.id)
  if (idx === -1) return
  // When editing requested commission, update contract_amount
  await supabase.from('commissions').update({ 
    client_name: editDraft.client_name || null,
    description: editDraft.description, 
    contract_amount: editDraft.contract_amount,
    original_value: editDraft.contract_amount, // Store contract_amount as original_value
    currency: editDraft.currency
  }).eq('id', editDraft.id)
  await fetchCommissions()
  isModalOpen.value = false
}

</script>

<template>
  <div>
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{{ $t('commissions.myCommissionRequests') }}</h2>
          <UButton color="primary" @click="isCreateOpen = true">{{ $t('commissions.newCommission') }}</UButton>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="md:col-span-3">
          <!-- Row 1: Projects Joined, Total Contract Amount, Pending Contract Amount -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <StatisticsCard
              :title="$t('commissions.projectsJoined')"
              icon="i-lucide-folders"
              icon-color="blue"
              :value="projectCount"
              currency="USD"
            />
            <StatisticsCard
              :title="$t('commissions.totalContractAmount')"
              icon="i-lucide-file-text"
              icon-color="blue"
              :value-USD="totals.totalContractAmountUSD"
              :value-VND="totals.totalContractAmountVND"
            />
            <StatisticsCard
              :title="$t('commissions.pendingContractAmount')"
              icon="i-lucide-clock"
              icon-color="yellow"
              :value-USD="totals.pendingContractAmountUSD"
              :value-VND="totals.pendingContractAmountVND"
            />
          </div>

          <!-- Row 2: Received Commission, Pending Commission -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatisticsCard
              :title="$t('commissions.receivedCommission')"
              icon="i-lucide-badge-dollar-sign"
              icon-color="green"
              :value-USD="totals.receivedCommissionUSD"
              :value-VND="totals.receivedCommissionVND"
            />
            <StatisticsCard
              :title="$t('commissions.pendingCommission')"
              icon="i-lucide-hourglass"
              icon-color="orange"
              :value-USD="totals.pendingCommissionUSD"
              :value-VND="totals.pendingCommissionVND"
            />
          </div>
        </div>
        <div class="md:col-span-3">
          <div class="flex items-center gap-3 flex-wrap">
            <span class="text-sm text-gray-500 font-medium">{{ $t('common.filter') }}:</span>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600">{{ $t('common.year') }}:</span>
              <USelect v-model="selectedYear" :options="yearOptions" />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600">{{ $t('common.month') }}:</span>
              <USelect v-model="selectedMonth" :options="monthOptions" />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600">{{ $t('common.project') }}:</span>
              <USelect v-model="selectedProject" :options="projectOptions" :placeholder="$t('common.all')" />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600">{{ $t('common.status') }}:</span>
              <USelect v-model="selectedStatus" :options="statusOptions" :placeholder="$t('common.all')" />
            </div>
          </div>
        </div>
        <div class="md:col-span-3">
          <UTable :rows="filteredCommissions" :columns="[
            { key: 'date', label: $t('common.date') },
            { key: 'project_id', label: $t('common.project') },
            { key: 'client_name', label: $t('commissions.clientName') },
            { key: 'description', label: $t('common.description') },
            { key: 'value', label: $t('commissions.contractAmount') },
            { key: 'commission_rate', label: $t('commissions.commissionRate') },
            { key: 'commission_received', label: $t('commissions.commissionAmount') },
            { key: 'status', label: $t('common.status') },
            { key: 'actions', label: $t('common.actions') },
          ]">
            <template #date-data="{ row }">
              <span>{{ formatDate(row.date) }}</span>
            </template>
            <template #project_id-data="{ row }">
              <span>{{ getProjectLabel(row.project_id) }}</span>
            </template>
            <template #client_name-data="{ row }">
              <span>{{ row.client_name || '—' }}</span>
            </template>
            <template #description-data="{ row }">
              <span>{{ row.description || 'Failed to get cell value' }}</span>
            </template>
            <template #value-data="{ row }">
              <span>{{ formatValue(row.contract_amount != null ? row.contract_amount : getOriginalValue(row), row.currency) }}</span>
            </template>
            <template #commission_rate-data="{ row }">
              <span>{{ row.commission_rate != null ? `${row.commission_rate}%` : '—' }}</span>
            </template>
            <template #commission_received-data="{ row }">
              <span>{{ formatValue(getCommissionReceived(row), row.currency) }}</span>
            </template>
            <template #status-data="{ row }">
              <UBadge :label="formatStatus(row.status || 'unknown')" :color="statusColor(row.status)" variant="soft" />
            </template>
            <template #actions-data="{ row }">
              <UButton v-if="row.status === 'requested'" color="gray" size="xs" @click="openEdit(row)">{{ $t('commissions.edit') }}</UButton>
              <span v-else class="text-xs text-gray-400">—</span>
            </template>
          </UTable>
        </div>

        <UModal v-model="isModalOpen">
          <UCard>
            <template #header>
              <h3 class="font-semibold">{{ $t('commissions.editCommission') }}</h3>
            </template>
            <div class="space-y-4">
              <UFormGroup :label="$t('commissions.clientName')">
                <UInput v-model="editDraft.client_name" :placeholder="$t('commissions.clientNamePlaceholder')" />
              </UFormGroup>
              <UFormGroup :label="$t('common.description')">
                <UTextarea v-model="editDraft.description" />
              </UFormGroup>
              <UFormGroup :label="$t('commissions.contractAmount')">
                <UInput v-model.number="(editDraft as any).contract_amount" type="number" step="0.01" />
              </UFormGroup>
              <UFormGroup :label="$t('commissions.currency')">
                <USelect 
                  v-model="editDraft.currency" 
                  :options="[
                    { label: 'USD ($)', value: 'USD' },
                    { label: 'VND (₫)', value: 'VND' }
                  ]" 
                />
              </UFormGroup>
            </div>
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton color="gray" variant="soft" @click="isModalOpen = false">{{ $t('common.cancel') }}</UButton>
                <UButton color="primary" @click="saveEdit">{{ $t('common.save') }}</UButton>
              </div>
            </template>
          </UCard>
        </UModal>

        <UModal v-model="isCreateOpen">
          <UCard>
            <template #header>
              <h3 class="font-semibold">{{ $t('commissions.newCommission') }}</h3>
            </template>
            <div class="space-y-4">
              <UFormGroup :label="$t('common.project')">
                <USelect v-model="form.project_id" :options="projects.map(p => ({ label: p.name || p.id, value: p.id }))" />
              </UFormGroup>
              <UFormGroup :label="$t('commissions.clientName')">
                <UInput v-model="form.client_name" :placeholder="$t('commissions.clientNamePlaceholder')" @keyup.enter="submit" />
              </UFormGroup>
              <UFormGroup :label="$t('common.description')">
                <UTextarea v-model="form.description" />
              </UFormGroup>
              <UFormGroup :label="$t('commissions.contractAmount')">
                <UInput v-model.number="form.contract_amount" type="number" step="0.01" @keyup.enter="submit" />
              </UFormGroup>
              <UFormGroup :label="$t('commissions.currency')">
                <USelect 
                  v-model="form.currency" 
                  :options="[
                    { label: 'USD ($)', value: 'USD' },
                    { label: 'VND (₫)', value: 'VND' }
                  ]" 
                />
              </UFormGroup>
            </div>
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton color="gray" variant="soft" @click="isCreateOpen = false">{{ $t('common.cancel') }}</UButton>
                <UButton color="primary" @click="submit" :loading="isLoading" :disabled="isLoading || !form.project_id || !form.contract_amount">{{ $t('common.create') }}</UButton>
              </div>
            </template>
          </UCard>
        </UModal>
      </div>
    </UCard>
  </div>
</template>

<style scoped></style>




