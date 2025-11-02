<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: t('admin.allCommissions') || 'Admin - Commissions' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isGlobalAdmin } = useAdminRole()

const isLoading = ref(false)
const commissions = ref<any[]>([])
const projects = ref<any[]>([])
const allUsers = ref<any[]>([])

// Filters
const selectedProject = ref<string>('')
const selectedStatus = ref<string>('')
const selectedYear = ref<number | string>(new Date().getFullYear())
const selectedMonth = ref<string>('')

// Edit modal
const isEditOpen = ref(false)
const editDraft = reactive<{
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

// Fetch all commissions
const fetchCommissions = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('commissions')
      .select('id, user_id, project_id, client_name, description, date, status, value, original_value, currency, contract_amount, commission_rate')
      .order('date', { ascending: false })
    
    if (error) {
      console.error('Error fetching commissions:', error)
      return
    }
    
    commissions.value = data || []
  } finally {
    isLoading.value = false
  }
}

// Fetch projects
const fetchProjects = async () => {
  const { data } = await supabase
    .from('projects')
    .select('id, name')
    .order('name')
  
  projects.value = data || []
}

// Fetch users
const fetchUsers = async () => {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, name')
    .order('name')
  
  allUsers.value = data || []
}

// Get project name
const getProjectName = (projectId: string) => {
  return projects.value.find(p => p.id === projectId)?.name || projectId
}

// Get user name/email
const getUserName = (userId: string) => {
  const u = allUsers.value.find(u => u.id === userId)
  return u ? (u.name || u.email) : userId
}

const { formatDate, formatValue, formatStatus, statusColor } = useCommissionFormatters()

// Filtered commissions
const filteredCommissions = computed(() => {
  let filtered = commissions.value
  
  if (selectedProject.value) {
    filtered = filtered.filter(c => c.project_id === selectedProject.value)
  }
  
  if (selectedStatus.value) {
    filtered = filtered.filter(c => c.status === selectedStatus.value)
  }
  
  if (selectedYear.value) {
    filtered = filtered.filter(c => (c.date || '').slice(0,4) === String(selectedYear.value))
  }
  
  if (selectedMonth.value) {
    filtered = filtered.filter(c => (c.date || '').slice(0,7) === selectedMonth.value)
  }
  
  return filtered
})

const { yearOptions, monthOptions } = useDateFilters(selectedYear, selectedMonth)

// Status options
const statusOptions = computed(() => [
  { label: t('common.all'), value: '' },
  { label: capitalize(t('commissions.requested')), value: 'requested' },
  { label: capitalize(t('commissions.confirmed')), value: 'confirmed' },
  { label: capitalize(t('commissions.paid')), value: 'paid' },
])

// Project options
const projectOptions = computed(() => [
  { label: t('common.all'), value: '' },
  ...projects.value.map(p => ({ label: p.name || p.id, value: p.id }))
])

// Capitalize helper
const capitalize = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Open edit modal
const openEdit = (row: any) => {
  if (!row || !row.id) return
  
  // Reset form first
  editDraft.id = ''
  editDraft.contract_amount = null
  editDraft.commission_rate = null
  editDraft.status = 'requested'
  editDraft.client_name = ''
  editDraft.description = ''
  
  // Use nextTick to ensure modal is ready before setting values
  nextTick(() => {
    editDraft.id = row.id
    editDraft.contract_amount = row.contract_amount != null ? Number(row.contract_amount) : null
    editDraft.commission_rate = row.commission_rate != null ? Number(row.commission_rate) : null
    editDraft.status = row.status || 'requested'
    editDraft.client_name = row.client_name || ''
    editDraft.description = row.description || ''
    isEditOpen.value = true
  })
}

// Calculate commission amount
const calculateCommissionAmount = () => {
  if (editDraft.contract_amount != null && editDraft.commission_rate != null) {
    return Number(editDraft.contract_amount || 0) * (Number(editDraft.commission_rate || 0) / 100)
  }
  return 0
}

// Save commission
const saveCommission = async () => {
  if (!editDraft.id) return
  
  isLoading.value = true
  try {
    // Calculate commission amount if both contract_amount and commission_rate are provided
    const calculatedValue = calculateCommissionAmount()
    
    const updateData: any = {
      client_name: editDraft.client_name || null,
      description: editDraft.description || null,
      contract_amount: editDraft.contract_amount || null,
      commission_rate: editDraft.commission_rate || null,
      status: editDraft.status,
      original_value: editDraft.contract_amount || null, // Store contract_amount as original_value
    }
    
    // Only update value if we can calculate it (both contract_amount and commission_rate are provided)
    if (calculatedValue > 0 && editDraft.contract_amount != null && editDraft.commission_rate != null) {
      updateData.value = calculatedValue
    }
    
    const { error } = await supabase
      .from('commissions')
      .update(updateData)
      .eq('id', editDraft.id)
    
    if (error) throw error
    
    await fetchCommissions()
    isEditOpen.value = false
    
    const toast = useToast()
    toast.add({
      color: 'green',
      title: t('common.save'),
      description: t('messages.success'),
    })
  } catch (error: any) {
    console.error('Error updating commission:', error)
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToUpdate'),
      description: error.message,
    })
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    fetchCommissions(),
    fetchProjects(),
    fetchUsers(),
  ])
  
  // Set default to current month/year
  const now = new Date()
  selectedYear.value = now.getFullYear()
  selectedMonth.value = `${selectedYear.value}-${String(now.getMonth() + 1).padStart(2, '0')}`
})
</script>

<template>
  <div class="container mx-auto py-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{{ $t('admin.allCommissions') || 'All Commissions' }}</h2>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500">{{ $t('common.filter') }}</span>
            <USelect 
              v-model="selectedProject" 
              :options="projectOptions" 
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
          </div>
        </div>
      </template>

      <div v-if="isLoading" class="text-center py-8">
        <div class="text-gray-500">{{ $t('common.loading') || 'Loading...' }}</div>
      </div>

      <div v-else-if="filteredCommissions.length === 0" class="text-center py-8 text-gray-500">
        {{ $t('commissions.noCommissions') }}
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
            @click="openEdit(row)"
          >
            {{ $t('common.edit') }}
          </UButton>
        </template>
      </UTable>
    </UCard>

    <!-- Edit Commission Modal -->
    <UModal v-model="isEditOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">{{ $t('commissions.editCommission') }}</h3>
        </template>
        <div class="space-y-4">
          <UFormGroup :label="$t('commissions.clientName')">
            <UInput 
              v-model="editDraft.client_name" 
              :placeholder="$t('commissions.clientNamePlaceholder')" 
            />
          </UFormGroup>
          
          <UFormGroup :label="$t('common.description')">
            <UTextarea 
              v-model="editDraft.description" 
              :rows="3"
            />
          </UFormGroup>
          
          <UFormGroup :label="$t('commissions.contractAmount')">
            <UInput 
              v-model.number="editDraft.contract_amount" 
              type="number" 
              step="0.01"
              :placeholder="$t('commissions.contractAmount')"
            />
          </UFormGroup>
          
          <UFormGroup :label="$t('commissions.commissionRate')">
            <UInput 
              v-model.number="editDraft.commission_rate" 
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
              v-model="editDraft.status"
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
              @click="isEditOpen = false"
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
