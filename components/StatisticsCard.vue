<script setup lang="ts">
interface Props {
  title: string
  icon: string
  iconColor?: string
  value?: string | number | null
  valueVND?: number | null
  currency?: 'VND'
}

const props = withDefaults(defineProps<Props>(), {
  iconColor: 'blue',
  currency: 'VND',
})

const { formatValue } = useCommissionFormatters()

// Convert kebab-case props to camelCase for Vue
const iconColorProp = computed(() => props.iconColor)

const displayValue = computed(() => {
  if (props.value != null) {
    return props.value
  }
  
  if (props.valueVND != null && props.valueVND > 0) {
    return props.valueVND
  }
  
  return null
})

const iconBgColorClass = computed(() => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    yellow: 'bg-yellow-100',
    orange: 'bg-orange-100',
    red: 'bg-red-100',
    gray: 'bg-gray-100',
  }
  return colorMap[iconColorProp.value] || 'bg-blue-100'
})

const iconTextColorClass = computed(() => {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
    gray: 'text-gray-600',
  }
  return colorMap[iconColorProp.value] || 'text-blue-600'
})
</script>

<template>
  <UCard class="border border-gray-200 hover:shadow-md transition-shadow">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <div class="flex items-center gap-3 mb-3">
          <div :class="['w-10 h-10 rounded-full flex items-center justify-center', iconBgColorClass]">
            <UIcon :name="icon" :class="['w-5 h-5', iconTextColorClass]" />
          </div>
          <span class="text-sm font-medium text-gray-600">{{ title }}</span>
        </div>
        <template v-if="displayValue !== null && displayValue !== undefined">
          <div v-if="value !== null && value !== undefined" class="text-3xl font-bold text-gray-900">
            {{ displayValue }}
          </div>
          <div v-else-if="typeof displayValue === 'number'" class="text-3xl font-bold text-gray-900">
            {{ formatValue(displayValue, 'VND') }}
          </div>
          <div v-else class="text-3xl font-bold text-gray-400">—</div>
        </template>
        <div v-else class="text-3xl font-bold text-gray-400">—</div>
      </div>
    </div>
  </UCard>
</template>

