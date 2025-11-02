<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: 'Admin - Commissions' })

const supabase = useSupabaseClient()
const isLoading = ref(false)
const rows = ref<any[]>([])

// Format status display with capital first letter
const formatStatus = (status: string) => {
  const statusMap: Record<string, string> = {
    'requested': t('commissions.requested'),
    'confirmed': t('commissions.confirmed'),
    'paid': t('commissions.paid'),
  }
  const statusText = statusMap[status] || status
  return statusText.charAt(0).toUpperCase() + statusText.slice(1)
}

const fetchAll = async () => {
  const { data } = await supabase
    .from('commissions')
    .select('id, user_id, project_id, description, date, status, value, contract_amount, commission_rate, currency')
    .order('date', { ascending: false })
  rows.value = data || []
}

onMounted(fetchAll)

const statuses = ['requested','confirmed','paid']

const save = async (row: any) => {
  // Calculate value if contract_amount and commission_rate are provided
  let calculatedValue = row.value
  if (row.contract_amount != null && row.commission_rate != null) {
    calculatedValue = Number(row.contract_amount || 0) * (Number(row.commission_rate || 0) / 100)
  }
  
  await supabase
    .from('commissions')
    .update({ 
      status: row.status, 
      value: calculatedValue,
      contract_amount: row.contract_amount || null,
      commission_rate: row.commission_rate || null,
      original_value: row.original_value || calculatedValue
    })
    .eq('id', row.id)
  
  // Update local value for immediate display
  row.value = calculatedValue
}

const confirm = async (row: any) => {
  if (row.status !== 'requested') return
  
  // Calculate commission amount from contract_amount and commission_rate
  let calculatedValue = row.value
  if (row.contract_amount != null && row.commission_rate != null) {
    calculatedValue = Number(row.contract_amount || 0) * (Number(row.commission_rate || 0) / 100)
  } else {
    // Fallback: Get ref_percentage from user_project_info
    const { data: refData } = await supabase
      .from('user_project_info')
      .select('ref_percentage')
      .eq('user_id', row.user_id)
      .eq('project_id', row.project_id)
      .single()
    
    const refPercentage = refData?.ref_percentage || 0
    const currentOriginalValue = row.original_value != null ? Number(row.original_value || 0) : Number(row.value || 0)
    calculatedValue = currentOriginalValue * (refPercentage / 100)
  }
  
  row.status = 'confirmed'
  row.value = calculatedValue
  row.original_value = row.contract_amount != null ? row.contract_amount : (row.original_value || row.value)
  await save(row)
}
</script>

<template>
  <div class="container mx-auto py-6">
    <UCard>
      <template #header>
        <h2 class="font-semibold">All Commissions</h2>
      </template>
      <UTable :rows="rows" :columns="[
        { key: 'date', label: 'Date' },
        { key: 'user_id', label: 'User' },
        { key: 'project_id', label: 'Project' },
        { key: 'description', label: 'Description' },
        { key: 'contract_amount', label: 'Contract Amount' },
        { key: 'commission_rate', label: 'Commission Rate (%)' },
        { key: 'value', label: 'Commission Amount' },
        { key: 'status', label: 'Status' },
        { key: 'actions', label: 'Actions' },
      ]">
        <template #contract_amount-data="{ row }">
          <UInput v-model.number="row.contract_amount" type="number" step="0.01" @blur="save(row)" placeholder="Contract amount" />
        </template>
        <template #commission_rate-data="{ row }">
          <UInput v-model.number="row.commission_rate" type="number" step="0.01" min="0" max="100" @blur="save(row)" placeholder="Rate %" />
        </template>
        <template #value-data="{ row }">
          <UInput v-model.number="row.value" type="number" step="0.01" disabled class="bg-gray-50" />
        </template>
        <template #status-data="{ row }">
          <USelect 
            v-model="row.status"
            :options="[
              { label: 'Requested', value: 'requested' },
              { label: 'Confirmed', value: 'confirmed' },
              { label: 'Paid', value: 'paid' }
            ]"
            @change="save(row)"
          />
        </template>
        <template #actions-data="{ row }">
          <UButton v-if="row.status === 'requested'" size="xs" color="gray" @click="confirm(row)">Confirm</UButton>
          <span v-else class="text-xs text-gray-400">—</span>
        </template>
      </UTable>
    </UCard>
  </div>
</template>

<style scoped></style>




