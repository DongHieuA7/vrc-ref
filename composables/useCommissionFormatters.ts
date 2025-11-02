import { useI18n } from '#imports'

export const useCommissionFormatters = () => {
  const { t } = useI18n()

  const formatDate = (input: string | null | undefined) => {
    if (!input) return '—'
    const d = new Date(input)
    if (isNaN(d.getTime())) return input
    const pad = (n: number) => String(n).padStart(2, '0')
    // Format: DD/MM/YYYY HH:mm
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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

  return {
    formatDate,
    formatValue,
    formatStatus,
    statusColor,
  }
}

