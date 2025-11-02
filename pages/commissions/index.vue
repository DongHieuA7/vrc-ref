<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth', 'user-only'] })
useSeoMeta({ title: t('commissions.myCommissionRequests') })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const isLoading = ref(false)
const commissions = ref<any[]>([])
const isModalOpen = ref(false)
const editDraft = reactive<{ id: string; description: string; contract_amount: number | undefined; currency: string }>({ id: '', description: '', contract_amount: undefined, currency: 'USD' })
const isCreateOpen = ref(false)
const selectedYear = ref<number | string>('')
const selectedMonth = ref<string>('')
const selectedProject = ref<string>('')
const selectedStatus = ref<string>('')

const form = reactive({
  project_id: '',
  description: '',
  contract_amount: undefined as unknown as number,
  currency: 'USD' as 'USD' | 'VND',
})

const projects = ref<any[]>([])
// Store ref_percentage for each project
const projectRefPercentages = ref<Record<string, number>>({})

const formatDate = (input: string) => {
  const d = new Date(input)
  if (isNaN(d.getTime())) return input
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const formatValue = (value: number | string | null | undefined, currency: string = 'USD') => {
  if (value == null || value === '' || value === undefined) return '—'
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '—'
  
  const currencySymbol = currency === 'VND' ? '₫' : '$'
  const locale = currency === 'VND' ? 'vi-VN' : 'en-US'
  const formatted = numValue.toLocaleString(locale, { 
    minimumFractionDigits: 0,
    maximumFractionDigits: 0 
  })
  
  return currency === 'VND' ? `${formatted} ${currencySymbol}` : `${currencySymbol}${formatted}`
}

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
    .select('id, project_id, description, date, status, value, original_value, currency, contract_amount, commission_rate')
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

const statusColor = (status: string) => {
  switch (status) {
    case 'requested':
      return 'yellow'
    case 'confirmed':
      return 'blue'
    case 'paid':
      return 'green'
    default:
      return 'gray'
  }
}

const yearOptions = computed(() => {
  const { t } = useI18n()
  const current = new Date().getFullYear()
  const years: { label: string, value: number | string }[] = [
    { label: t('common.all'), value: '' }
  ]
  for (let y = current; y >= current - 4; y--) {
    years.push({ label: String(y), value: y })
  }
  return years
})

const monthOptions = computed(() => {
  const { t } = useI18n()
  const options: { label: string, value: string }[] = [
    { label: t('commissions.allMonths'), value: '' } // Add "All" option
  ]
  for (let m = 1; m <= 12; m++) {
    const value = `${selectedYear.value}-${String(m).padStart(2,'0')}`
    const label = new Date(`${selectedYear.value}-${String(m).padStart(2,'0')}-01`).toLocaleString(undefined, { month: 'long'})
    options.push({ label, value })
  }
  return options
})

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

// Format status display with capital first letter
const formatStatus = (status: string) => {
  const { t } = useI18n()
  const statusMap: Record<string, string> = {
    'requested': t('commissions.requested'),
    'confirmed': t('commissions.confirmed'),
    'paid': t('commissions.paid'),
  }
  const statusText = statusMap[status] || status
  return statusText.charAt(0).toUpperCase() + statusText.slice(1)
}

// Total statistics should show all commissions, not filtered ones
// Calculate separately by currency
const totals = computed(() => {
  const list = commissions.value
  const result = {
    claimedUSD: 0,
    claimedVND: 0,
    approvedButNotClaimedUSD: 0,
    approvedButNotClaimedVND: 0,
    requestedUSD: 0,
    requestedVND: 0,
  }
  
  for (const c of list) {
    const currency = c.currency || 'USD'
    const value = Number(c.value || 0)
    
    if (currency === 'VND') {
      if (c.status === 'paid') {
        result.claimedVND += value
      }
      if (c.status === 'confirmed') {
        result.approvedButNotClaimedVND += value
      }
      if (c.status === 'requested') {
        result.requestedVND += value
      }
    } else {
      if (c.status === 'paid') {
        result.claimedUSD += value
      }
      if (c.status === 'confirmed') {
        result.approvedButNotClaimedUSD += value
      }
      if (c.status === 'requested') {
        result.requestedUSD += value
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
        description: form.description,
        contract_amount: form.contract_amount,
        value: 0, // Will be calculated by admin when setting commission_rate
        original_value: form.contract_amount, // Store contract amount as original value
        currency: form.currency,
        status: 'requested',
      })
    if (error) throw error
    form.project_id = ''
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
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- Projects Joined -->
            <UCard class="border border-gray-200 hover:shadow-md transition-shadow">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <UIcon name="i-lucide-folders" class="w-5 h-5 text-blue-600" />
                    </div>
                    <span class="text-sm font-medium text-gray-600">{{ $t('commissions.projectsJoined') }}</span>
                  </div>
                  <div class="text-3xl font-bold text-gray-900">{{ projectCount }}</div>
                </div>
              </div>
            </UCard>

            <!-- Total Received -->
            <UCard class="border border-gray-200 hover:shadow-md transition-shadow">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <UIcon name="i-lucide-badge-dollar-sign" class="w-5 h-5 text-green-600" />
                    </div>
                    <span class="text-sm font-medium text-gray-600">{{ $t('commissions.receivedCommission') }}</span>
                  </div>
                  <div class="space-y-1">
                    <template v-if="totals.claimedUSD > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.claimedUSD, 'USD') }}</div>
                      <div v-if="totals.claimedVND > 0" class="text-base font-medium text-gray-500">{{ formatValue(totals.claimedVND, 'VND') }}</div>
                    </template>
                    <template v-else-if="totals.claimedVND > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.claimedVND, 'VND') }}</div>
                    </template>
                    <template v-else>
                      <div class="text-3xl font-bold text-gray-400">—</div>
                    </template>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Total Not Claimed -->
            <UCard class="border border-gray-200 hover:shadow-md transition-shadow">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                      <UIcon name="i-lucide-hourglass" class="w-5 h-5 text-orange-600" />
                    </div>
                    <span class="text-sm font-medium text-gray-600">{{ $t('commissions.pendingCommission') }}</span>
                  </div>
                  <div class="space-y-1">
                    <template v-if="totals.approvedButNotClaimedUSD > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.approvedButNotClaimedUSD, 'USD') }}</div>
                      <div v-if="totals.approvedButNotClaimedVND > 0" class="text-base font-medium text-gray-500">{{ formatValue(totals.approvedButNotClaimedVND, 'VND') }}</div>
                    </template>
                    <template v-else-if="totals.approvedButNotClaimedVND > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.approvedButNotClaimedVND, 'VND') }}</div>
                    </template>
                    <template v-else>
                      <div class="text-3xl font-bold text-gray-400">—</div>
                    </template>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Total Requested -->
            <UCard class="border border-gray-200 hover:shadow-md transition-shadow">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                      <UIcon name="i-lucide-clock" class="w-5 h-5 text-yellow-600" />
                    </div>
                    <span class="text-sm font-medium text-gray-600">{{ $t('commissions.totalRequested') }}</span>
                  </div>
                  <div class="space-y-1">
                    <template v-if="totals.requestedUSD > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.requestedUSD, 'USD') }}</div>
                      <div v-if="totals.requestedVND > 0" class="text-base font-medium text-gray-500">{{ formatValue(totals.requestedVND, 'VND') }}</div>
                    </template>
                    <template v-else-if="totals.requestedVND > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.requestedVND, 'VND') }}</div>
                    </template>
                    <template v-else>
                      <div class="text-3xl font-bold text-gray-400">—</div>
                    </template>
                  </div>
                </div>
              </div>
            </UCard>
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
            { key: 'description', label: $t('common.description') },
            { key: 'value', label: $t('commissions.contractAmount') },
            { key: 'commission_received', label: $t('commissions.commissionReceived') },
            { key: 'status', label: $t('common.status') },
            { key: 'actions', label: $t('common.actions') },
          ]">
            <template #date-data="{ row }">
              <span>{{ formatDate(row.date) }}</span>
            </template>
            <template #project_id-data="{ row }">
              <span>{{ getProjectLabel(row.project_id) }}</span>
            </template>
            <template #description-data="{ row }">
              <span>{{ row.description || 'Failed to get cell value' }}</span>
            </template>
            <template #value-data="{ row }">
              <span>{{ formatValue(row.contract_amount != null ? row.contract_amount : getOriginalValue(row), row.currency) }}</span>
            </template>
            <template #commission_received-data="{ row }">
              <span>{{ formatValue(getCommissionReceived(row), row.currency) }}</span>
            </template>
            <template #status-data="{ row }">
              <UBadge :label="formatStatus(row.status || 'unknown')" :color="statusColor(row.status)" variant="soft" />
            </template>
            <template #actions-data="{ row }">
              <UButton v-if="row.status === 'requested'" color="gray" size="xs" @click="openEdit(row)">{{ $t('commissions.edit') }}</UButton>
              <UButton v-else-if="row.status === 'confirmed'" color="primary" size="xs" @click="async () => { await supabase.from('commissions').update({ status: 'paid' }).eq('id', row.id); await fetchCommissions() }">{{ $t('commissions.claim') }}</UButton>
              <div v-else>{{ $t('common.noData') }}</div>
            </template>
          </UTable>
        </div>

        <UModal v-model="isModalOpen">
          <UCard>
            <template #header>
              <h3 class="font-semibold">{{ $t('commissions.editCommission') }}</h3>
            </template>
            <div class="space-y-4">
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




