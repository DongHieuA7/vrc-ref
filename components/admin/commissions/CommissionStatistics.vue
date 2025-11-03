<script setup lang="ts">
const { t } = useI18n()
const { formatValue } = useCommissionFormatters()

interface Props {
  totals: {
    totalVND?: number
    confirmedVND?: number
    paidVND?: number
  }
}

const props = defineProps<Props>()

const totalsComputed = computed(() => ({
  totalVND: props.totals.totalVND || 0,
  confirmedVND: props.totals.confirmedVND || 0,
  paidVND: props.totals.paidVND || 0,
}))
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <template v-if="totalsComputed.paidVND > 0">
              <div class="text-3xl font-bold text-gray-900">{{ formatValue(totalsComputed.paidVND, 'VND') }}</div>
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
            <template v-if="totalsComputed.paidVND > 0">
              <div class="text-3xl font-bold text-gray-900">{{ formatValue(totalsComputed.paidVND, 'VND') }}</div>
            </template>
            <template v-else>
              <div class="text-3xl font-bold text-gray-400">—</div>
            </template>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

