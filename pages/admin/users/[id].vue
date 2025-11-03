<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: t('users.userDetail') })

const route = useRoute()
const supabase = useSupabaseClient()
const userId = computed(() => route.params.id as string)

// User profile data
const userProfile = ref<any>(null)
const userProjects = ref<any[]>([])
const userCommissions = ref<any[]>([])

// Filter for commissions
const selectedYear = ref<number>(new Date().getFullYear())
const selectedMonth = ref<string>('')

// Fetch user profile
const fetchUserProfile = async () => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, name, company, descript, ref_code, created_at')
    .eq('id', userId.value)
    .single()
  
  if (error || !data) {
    return
  }
  
  userProfile.value = data
}

// Fetch user projects
const fetchUserProjects = async () => {
  const { data, error } = await supabase
    .from('user_project_info')
    .select('project_id, ref_percentage, created_at')
    .eq('user_id', userId.value)
  
  if (error) {
    return
  }
  
  if (!data || data.length === 0) {
    userProjects.value = []
    return
  }
  
  // Fetch project details
  const projectIds = data.map((r: any) => r.project_id)
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name')
    .in('id', projectIds)
  
  if (projectsError) {
    userProjects.value = []
    return
  }
  
  // Combine project info with user_project_info
  userProjects.value = (projects || []).map((p: any) => {
    const info = data.find((r: any) => r.project_id === p.id)
    return {
      ...p,
      ref_percentage: info?.ref_percentage || 0,
      joined_at: info?.created_at || '',
    }
  })
}

// Fetch user commissions
const fetchUserCommissions = async () => {
  const { data, error } = await supabase
    .from('commissions')
    .select('id, project_id, client_name, description, date, status, value, original_value, currency, contract_amount, commission_rate')
    .eq('user_id', userId.value)
    .order('date', { ascending: false })
  
  if (error) {
    return
  }
  
  userCommissions.value = data || []
}

// Fetch project names for commissions
const projectsMap = ref<Record<string, string>>({})

const fetchProjectsMap = async () => {
  if (userCommissions.value.length === 0) return
  
  const projectIds = Array.from(new Set(userCommissions.value.map(c => c.project_id)))
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .in('id', projectIds)
  
  if (error) {
    return
  }
  
  const map: Record<string, string> = {}
  for (const p of data || []) {
    map[p.id] = p.name
  }
  projectsMap.value = map
}

const getProjectName = (projectId: string) => {
  return projectsMap.value[projectId] || projectId
}

// Format functions
const { formatDate, formatValue, statusColor: getStatusColor } = useCommissionFormatters()

// Custom formatStatus for this page
const formatStatus = (status: string) => {
  const statusMap: Record<string, string> = {
    'requested': t('commissions.requested'),
    'confirmed': t('commissions.confirmed'),
    'paid': t('commissions.paid'),
  }
  const statusText = statusMap[status] || status
  return statusText.charAt(0).toUpperCase() + statusText.slice(1)
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

// Get original value for display
const getOriginalValueDisplay = (commission: any) => {
  return commission.original_value != null ? commission.original_value : commission.value
}

// Calculate commission received for display
const getCommissionReceivedDisplay = (commission: any) => {
  // If status is confirmed or paid, use the stored value (already calculated when confirmed)
  if (commission.status === 'confirmed' || commission.status === 'paid') {
    return commission.value
  }
  
  // For requested status: only calculate, never use existing value directly
  // 1. If both contract_amount and commission_rate are available, calculate
  if (commission.contract_amount != null && commission.commission_rate != null) {
    return Number(commission.contract_amount || 0) * (Number(commission.commission_rate || 0) / 100)
  }
  
  // 2. Fallback: calculate based on ref_percentage from userProjects
  const project = userProjects.value.find(p => p.id === commission.project_id)
  const refPercentage = project?.ref_percentage || 0
  const originalValue = commission.original_value != null ? commission.original_value : commission.value
  return originalValue * (refPercentage / 100)
}

// Year and month filters
const { yearOptions, monthOptions } = useDateFilters(selectedYear, selectedMonth)

const filteredCommissions = computed(() => {
  const byYear = userCommissions.value.filter(c => (c.date || '').slice(0,4) === String(selectedYear.value))
  if (!selectedMonth.value) return byYear
  return byYear.filter(c => (c.date || '').slice(0,7) === selectedMonth.value)
})

// Statistics
const totals = computed(() => {
  const result = {
    totalUSD: 0,
    totalVND: 0,
    confirmedUSD: 0,
    confirmedVND: 0,
    paidUSD: 0,
    paidVND: 0,
  }
  
  for (const c of userCommissions.value) {
    const currency = c.currency || 'USD'
    const value = Number(c.value || 0)
    
    if (currency === 'VND') {
      result.totalVND += value
      if (c.status === 'confirmed') result.confirmedVND += value
      if (c.status === 'paid') result.paidVND += value
    } else {
      result.totalUSD += value
      if (c.status === 'confirmed') result.confirmedUSD += value
      if (c.status === 'paid') result.paidUSD += value
    }
  }
  
  return result
})

// Confirm commission
const confirmCommission = async (commission: any) => {
  if (commission.status !== 'requested') return
  
  // Calculate commission amount from contract_amount and commission_rate (never use existing value)
  let calculatedValue = 0
  if (commission.contract_amount != null && commission.commission_rate != null) {
    calculatedValue = Number(commission.contract_amount || 0) * (Number(commission.commission_rate || 0) / 100)
  } else {
    // Fallback: Get ref_percentage from user_project_info
    const { data: refData, error: refError } = await supabase
      .from('user_project_info')
      .select('ref_percentage')
      .eq('user_id', userId.value)
      .eq('project_id', commission.project_id)
      .single()
    
    if (refError) {
      // Use 0 if not found
    }
    
    const refPercentage = refData?.ref_percentage || 0
    
    // Use original_value only (never use existing value for calculation)
    const currentOriginalValue = commission.original_value != null ? Number(commission.original_value || 0) : (commission.contract_amount != null ? Number(commission.contract_amount || 0) : 0)
    calculatedValue = currentOriginalValue * (refPercentage / 100)
  }
  
  const { error } = await supabase
    .from('commissions')
    .update({ 
      status: 'confirmed',
      value: calculatedValue,
      original_value: commission.contract_amount != null ? commission.contract_amount : commission.original_value // Store contract_amount as original_value
    })
    .eq('id', commission.id)
  
  if (error) {
    return
  }
  
  await fetchUserCommissions()
}

onMounted(async () => {
  await Promise.all([
    fetchUserProfile(),
    fetchUserProjects(),
    fetchUserCommissions(),
  ])
  await fetchProjectsMap()
  
  // Set default month/year
  const now = new Date()
  selectedYear.value = now.getFullYear()
  selectedMonth.value = `${selectedYear.value}-${String(now.getMonth() + 1).padStart(2, '0')}`
})

// Watch for commissions changes to update projects map
watch(userCommissions, () => {
  fetchProjectsMap()
}, { immediate: true })
</script>

<template>
  <div class="container mx-auto">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <NuxtLink class="text-sm text-gray-500 hover:underline" to="/admin/users">← {{ $t('common.back') }}</NuxtLink>
            <h2 class="font-semibold">{{ $t('users.userDetail') }} - {{ userProfile?.name || userProfile?.email || userId }}</h2>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-1 gap-6">
        <!-- User Info -->
        <UCard>
          <template #header>
            <h3 class="font-medium">{{ $t('users.userProfile') }}</h3>
          </template>
          <div class="space-y-2 text-sm" v-if="userProfile">
            <div><span class="text-gray-500">{{ $t('common.name') }}:</span> <span class="font-medium">{{ userProfile.name || '—' }}</span></div>
            <div><span class="text-gray-500">{{ $t('common.email') }}:</span> <span class="font-medium">{{ userProfile.email }}</span></div>
            <div><span class="text-gray-500">{{ $t('profile.company') }}:</span> <span class="font-medium">{{ userProfile.company || '—' }}</span></div>
            <div><span class="text-gray-500">{{ $t('profile.about') }}:</span> <span class="font-medium">{{ userProfile.descript || '—' }}</span></div>
            <div>
              <span class="text-gray-500">{{ $t('profile.referralCode') }}:</span>
              <UBadge color="primary" variant="soft" :label="userProfile.ref_code" />
            </div>
            <div><span class="text-gray-500">{{ $t('projects.created') }}:</span> <span class="font-medium">{{ formatDate(userProfile.created_at) }}</span></div>
          </div>
        </UCard>

        <!-- Projects Joined -->
        <UCard>
          <template #header>
            <h3 class="font-medium">{{ $t('commissions.projectsJoined') }}</h3>
          </template>
          <UTable :rows="userProjects" :columns="[
            { key: 'name', label: $t('common.name') },
            { key: 'ref_percentage', label: $t('projects.refPercentage') },
            { key: 'joined_at', label: $t('projects.joinedRequested') },
          ]">
            <template #joined_at-data="{ row }">
              <span>{{ formatDate(row.joined_at) }}</span>
            </template>
            <template #ref_percentage-data="{ row }">
              <span>{{ row.ref_percentage }}%</span>
            </template>
            <template #empty>
              <div class="text-sm text-gray-500 py-4 text-center">
                {{ $t('projects.noProjectsAvailable') }}
              </div>
            </template>
          </UTable>
        </UCard>

        <!-- Commissions -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-medium">{{ $t('users.userCommissions') }}</h3>
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500">{{ $t('common.filter') }}</span>
                <USelect v-model="selectedYear" :options="yearOptions" />
                <USelect v-model="selectedMonth" :options="monthOptions" />
              </div>
            </div>
          </template>

          <!-- Statistics -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <UCard class="border border-gray-200 hover:shadow-md transition-shadow">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <UIcon name="i-lucide-badge-dollar-sign" class="w-5 h-5 text-green-600" />
                    </div>
                    <span class="text-sm font-medium text-gray-600">{{ $t('commissions.totalReceived') }}</span>
                  </div>
                  <div class="space-y-1">
                    <template v-if="totals.paidUSD > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.paidUSD, 'USD') }}</div>
                      <div v-if="totals.paidVND > 0" class="text-base font-medium text-gray-500">{{ formatValue(totals.paidVND, 'VND') }}</div>
                    </template>
                    <template v-else-if="totals.paidVND > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.paidVND, 'VND') }}</div>
                    </template>
                    <template v-else>
                      <div class="text-3xl font-bold text-gray-400">—</div>
                    </template>
                  </div>
                </div>
              </div>
            </UCard>
            <UCard class="border border-gray-200 hover:shadow-md transition-shadow">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-blue-600" />
                    </div>
                    <span class="text-sm font-medium text-gray-600">{{ $t('commissions.totalPaid') }}</span>
                  </div>
                  <div class="space-y-1">
                    <template v-if="totals.paidUSD > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.paidUSD, 'USD') }}</div>
                      <div v-if="totals.paidVND > 0" class="text-base font-medium text-gray-500">{{ formatValue(totals.paidVND, 'VND') }}</div>
                    </template>
                    <template v-else-if="totals.paidVND > 0">
                      <div class="text-3xl font-bold text-gray-900">{{ formatValue(totals.paidVND, 'VND') }}</div>
                    </template>
                    <template v-else>
                      <div class="text-3xl font-bold text-gray-400">—</div>
                    </template>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Commissions Table -->
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
              <span>{{ getProjectName(row.project_id) }}</span>
            </template>
            <template #client_name-data="{ row }">
              <span>{{ row.client_name || '—' }}</span>
            </template>
            <template #description-data="{ row }">
              <span>{{ row.description || '—' }}</span>
            </template>
            <template #value-data="{ row }">
              <span>{{ formatValue(getOriginalValueDisplay(row), row.currency) }}</span>
            </template>
            <template #commission_rate-data="{ row }">
              <span>{{ row.commission_rate != null ? `${row.commission_rate}%` : '—' }}</span>
            </template>
            <template #commission_received-data="{ row }">
              <span>{{ formatValue(getCommissionReceivedDisplay(row), row.currency) }}</span>
            </template>
            <template #status-data="{ row }">
              <UBadge :label="formatStatus(row.status || 'unknown')" :color="statusColor(row.status)" variant="soft" />
            </template>
            <template #actions-data="{ row }">
              <UButton 
                v-if="row.status === 'requested'" 
                size="xs" 
                color="primary" 
                @click="confirmCommission(row)"
              >
                {{ $t('projects.approve') }}
              </UButton>
              <span v-else class="text-xs text-gray-400">—</span>
            </template>
            <template #empty>
              <div class="text-sm text-gray-500 py-4 text-center">
                {{ $t('commissions.noCommissions') }}
              </div>
            </template>
          </UTable>
        </UCard>
      </div>
    </UCard>
  </div>
</template>

<style scoped></style>

