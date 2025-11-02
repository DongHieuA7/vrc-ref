<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: t('admin.projectDetail') })

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const projectId = computed(() => route.params.id as string)
const currentAdminId = computed(() => user.value?.id || '')
const { isGlobalAdmin, canManageProject } = useAdminRole()

// Project data
const project = ref<{ id: string, name: string, admins: string[], commission_rate_min?: number | null, commission_rate_max?: number | null, policy?: string | null } | null>(null)

// Role states
const isGlobalAdminValue = ref(false)
const canManageProjectValue = ref(false)

// Check if current user can manage this project
const isProjectAdmin = computed(() => {
  return canManageProjectValue.value
})

// All users from user_profiles
const allUsers = ref<any[]>([])
// All admins from admins table
const allAdmins = ref<any[]>([])

type Commission = { id: string, user_id: string, project_id: string, client_name?: string | null, description: string, date: string, status: 'requested'|'confirmed'|'paid', value: number, original_value?: number | null, currency?: string, contract_amount?: number | null, commission_rate?: number | null }

type JoinRequest = { 
  id: string, 
  user_id: string, 
  project_id: string, 
  message: string | null, 
  ref_percentage: number | null,
  status: 'pending'|'approved'|'rejected', 
  created_at: string,
  updated_at: string | null
}

const statuses = ['requested','confirmed','paid']
const commissions = ref<Commission[]>([])
const joinRequests = ref<JoinRequest[]>([])

const usersInProject = ref<string[]>([])
const adminsInProject = ref<string[]>([])
const userRefInfo = ref<Record<string, { ref_percentage: number, joined_at: string }>>({})

// Get pending requests
const pendingRequests = computed(() => joinRequests.value.filter(r => r.status === 'pending'))

// Combined users and pending requests for table display
const usersTableData = computed(() => {
  const result: Array<{
    user_id: string,
    status: 'joined' | 'pending',
    join_request_id?: string,
    message?: string | null,
    ref_percentage: number,
    joined_at?: string,
    requested_at?: string
  }> = []
  
  // Add joined users
  for (const uid of usersInProject.value) {
    result.push({
      user_id: uid,
      status: 'joined',
      ref_percentage: userRefInfo.value[uid]?.ref_percentage || 0,
      joined_at: userRefInfo.value[uid]?.joined_at || '',
    })
  }
  
  // Add pending requests
  for (const request of pendingRequests.value) {
    if (!usersInProject.value.includes(request.user_id)) {
      result.push({
        user_id: request.user_id,
        status: 'pending',
        join_request_id: request.id,
        message: request.message,
        ref_percentage: request.ref_percentage || 10,
        requested_at: request.created_at,
      })
    }
  }
  
  return result
})

// Month-Year filter
const selectedYear = ref<number>(new Date().getFullYear())
const selectedMonth = ref<string>('')
const { yearOptions, monthOptions } = useDateFilters(selectedYear, selectedMonth)
const filteredCommissions = computed(() => {
  const byYear = commissions.value.filter(r => (r.date || '').slice(0,4) === String(selectedYear.value))
  if (!selectedMonth.value) return byYear
  return byYear.filter(r => (r.date || '').slice(0,7) === selectedMonth.value)
})

const commissionsByUser = computed<Record<string, Commission[]>>(() => {
  const map: Record<string, Commission[]> = {}
  for (const c of filteredCommissions.value) {
    if (!map[c.user_id]) map[c.user_id] = []
    map[c.user_id].push(c)
  }
  return map
})

const expandedUsers = ref<Set<string>>(new Set())
const toggleExpand = (uid: string) => {
  const set = new Set(expandedUsers.value)
  if (set.has(uid)) set.delete(uid); else set.add(uid)
  expandedUsers.value = set
}

// Fetch project data
const fetchProject = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, admins, commission_rate_min, commission_rate_max, policy')
    .eq('id', projectId.value)
    .single()
  
  if (error || !data) {
    console.error('Error fetching project:', error)
    return
  }
  
  project.value = data
  adminsInProject.value = data.admins || []
}

// Fetch users in project from user_project_info
const fetchUsersInProject = async () => {
  const { data, error } = await supabase
    .from('user_project_info')
    .select('user_id, ref_percentage, created_at')
    .eq('project_id', projectId.value)
  
  if (error) {
    console.error('Error fetching users in project:', error)
    return
  }
  
  usersInProject.value = (data || []).map((r: any) => r.user_id)
  const map: Record<string, { ref_percentage: number, joined_at: string }> = {}
  for (const r of data || []) {
    map[r.user_id] = {
      ref_percentage: Number(r.ref_percentage),
      joined_at: r.created_at,
    }
  }
  userRefInfo.value = map
}

// Fetch all users
const fetchAllUsers = async () => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, name, created_at')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching users:', error)
    return
  }
  
  allUsers.value = data || []
}

// Fetch all admins
const fetchAllAdmins = async () => {
  const { data, error } = await supabase
    .from('admins')
    .select('id, email, name, created_at, role')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching admins:', error)
    return
  }
  
  allAdmins.value = data || []
}

// Fetch commissions
const fetchCommissions = async () => {
  const { data, error } = await supabase
    .from('commissions')
    .select('id, user_id, project_id, client_name, description, date, status, value, original_value, currency, contract_amount, commission_rate')
    .eq('project_id', projectId.value)
    .order('date', { ascending: false })
  
  if (error) {
    console.error('Error fetching commissions:', error)
    return
  }
  
  commissions.value = (data || []).map((c: any) => ({
    id: c.id,
    user_id: c.user_id,
    project_id: c.project_id,
    client_name: c.client_name || null,
    description: c.description || '',
    date: c.date,
    status: c.status,
    value: Number(c.value),
    currency: c.currency || 'USD',
    contract_amount: c.contract_amount || null,
    commission_rate: c.commission_rate || null,
  }))
}

// Fetch join requests
const fetchJoinRequests = async () => {
  const { data, error } = await supabase
    .from('project_join_requests')
    .select('id, user_id, project_id, message, ref_percentage, status, created_at, updated_at')
    .eq('project_id', projectId.value)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching join requests:', error)
    return
  }
  
  joinRequests.value = (data || []) as JoinRequest[]
}

// Approve join request
const approveJoinRequest = async (request: JoinRequest) => {
  if (request.status !== 'pending') return
  
  if (!isProjectAdmin.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyProjectAdminsCanApproveRequests'),
    })
    return
  }
  
  // Update request status  
  const { error: updateError } = await supabase
    .from('project_join_requests')
    .update({ status: 'approved' }) // Keep 'approved' for join requests, this is different from commission status
    .eq('id', request.id)
  
  if (updateError) {
    console.error('Error approving join request:', updateError)
    return
  }
  
  // Add user to project with ref_percentage
  const refPercentage = request.ref_percentage || 10
  const { error: addError } = await supabase
    .from('user_project_info')
    .upsert({ 
      project_id: projectId.value, 
      user_id: request.user_id, 
      ref_percentage: refPercentage 
    }, { onConflict: 'project_id,user_id' })
  
  if (addError) {
    console.error('Error adding user to project:', addError)
    return
  }
  
  // Refresh data
  await Promise.all([fetchJoinRequests(), fetchUsersInProject()])
}

// Reject join request
const rejectJoinRequest = async (request: JoinRequest) => {
  if (request.status !== 'pending') return
  
  if (!isProjectAdmin.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyProjectAdminsCanRejectRequests'),
    })
    return
  }
  
  const { error } = await supabase
    .from('project_join_requests')
    .update({ status: 'rejected' })
    .eq('id', request.id)
  
  if (error) {
    console.error('Error rejecting join request:', error)
    return
  }
  
  await fetchJoinRequests()
}

// Confirm commission
const confirmCommission = async (c: Commission) => {
  if (c.status !== 'requested') return
  
  if (!isProjectAdmin.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyProjectAdminsCanApproveCommissions'),
    })
    return
  }
  
  // Calculate commission amount from contract_amount and commission_rate
  let calculatedValue = c.value
  if (c.contract_amount != null && c.commission_rate != null) {
    calculatedValue = Number(c.contract_amount || 0) * (Number(c.commission_rate || 0) / 100)
  } else {
    // Fallback: Get ref_percentage from user_project_info
    const refInfo = userRefInfo.value[c.user_id]
    const refPercentage = refInfo?.ref_percentage || 0
    
    // Get original value (if exists, use it; otherwise use current value)
    const currentOriginalValue = c.original_value != null ? Number(c.original_value || 0) : Number(c.value || 0)
    calculatedValue = currentOriginalValue * (refPercentage / 100)
  }
  
  const { error } = await supabase
    .from('commissions')
    .update({ 
      status: 'confirmed',
      value: calculatedValue,
      original_value: c.contract_amount != null ? c.contract_amount : (c.original_value || c.value) // Store contract_amount as original_value
    })
    .eq('id', c.id)
  
  if (error) {
    console.error('Error confirming commission:', error)
    return
  }
  
  await fetchCommissions()
}

const { formatDate, formatValue, formatStatus } = useCommissionFormatters()

// Get original value for display
const getOriginalValueDisplay = (commission: Commission) => {
  return commission.original_value != null ? commission.original_value : commission.value
}

// Calculate commission received for display
const getCommissionReceivedDisplay = (commission: Commission) => {
  if (commission.status === 'confirmed' || commission.status === 'paid') {
    return commission.value
  }
  // For requested status, use contract_amount and commission_rate if available
  if (commission.contract_amount != null && commission.commission_rate != null) {
    return Number(commission.contract_amount || 0) * (Number(commission.commission_rate || 0) / 100)
  }
  // Fallback: calculate based on ref_percentage
  const refInfo = userRefInfo.value[commission.user_id]
  const refPercentage = refInfo?.ref_percentage || 0
  const originalValue = commission.original_value != null ? commission.original_value : commission.value
  return originalValue * (refPercentage / 100)
}

// Available options excluding existing members
const availableUserOptions = computed(() => {
  const set = new Set(usersInProject.value)
  return allUsers.value
    .filter(u => !set.has(u.id))
    .map(u => ({ label: u.name || u.email, value: u.id }))
})
// Filter out admins already in project and global admins
// Only project owners can be added to projects
const availableAdminOptions = computed(() => {
  const set = new Set(adminsInProject.value)
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

const removeUser = async (uid: string) => {
  if (!isProjectAdmin.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyProjectAdminsCanRemoveUsers'),
    })
    return
  }
  
  const { error } = await supabase
    .from('user_project_info')
    .delete()
    .eq('project_id', projectId.value)
    .eq('user_id', uid)
  
  if (error) {
    console.error('Error removing user:', error)
    return
  }
  
  usersInProject.value = usersInProject.value.filter(id => id !== uid)
  const set = new Set(expandedUsers.value)
  if (set.has(uid)) { set.delete(uid); expandedUsers.value = set }
  delete userRefInfo.value[uid]
}

const removeAdmin = async (uid: string) => {
  if (uid === currentAdminId.value) return
  if (!project.value) return
  
  if (!isProjectAdmin.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyProjectAdminsCanRemoveAdmins'),
    })
    return
  }
  
  const next = (project.value.admins || []).filter(id => id !== uid)
  const { error } = await supabase
    .from('projects')
    .update({ admins: next })
    .eq('id', projectId.value)
  
  if (error) {
    console.error('Error removing admin:', error)
    return
  }
  
  project.value.admins = next
  adminsInProject.value = next
}

const userLabel = (uid: string) => {
  const u = allUsers.value.find(x => x.id === uid)
  return u ? (u.name || u.email) : uid
}

const adminLabel = (uid: string) => {
  const a = allAdmins.value.find(x => x.id === uid)
  return a ? (a.name || a.email) : uid
}

onMounted(async () => {
  // Check roles
  isGlobalAdminValue.value = await isGlobalAdmin()
  canManageProjectValue.value = await canManageProject(projectId.value)
  
  await Promise.all([
    fetchProject(),
    fetchAllUsers(),
    fetchAllAdmins(),
    fetchUsersInProject(),
    fetchCommissions(),
    fetchJoinRequests(),
  ])
  
  // Re-check after project is loaded
  if (project.value) {
    canManageProjectValue.value = await canManageProject(projectId.value)
  }
  
  // Set default to current month/year
  const now = new Date()
  selectedYear.value = now.getFullYear()
  selectedMonth.value = `${selectedYear.value}-${String(now.getMonth() + 1).padStart(2, '0')}`
})

// Edit Ref % modal
const isEditRefOpen = ref(false)
const isAddUserOpen = ref(false)
const isAddAdminOpen = ref(false)
const isEditRequestOpen = ref(false)
const isEditPolicyOpen = ref(false)
const manageState = reactive<{ addUser?: string, addAdmin?: string }>({})
const editRef = reactive<{ uid: string, value: number | null }>({ uid: '', value: null })
const editRequest = reactive<{ id: string, ref_percentage: number | null }>({ id: '', ref_percentage: null })
const editPolicy = reactive<{ policy: string }>({ policy: '' })
const openEditRequest = (request: JoinRequest) => {
  editRequest.id = request.id
  editRequest.ref_percentage = request.ref_percentage || 10
  isEditRequestOpen.value = true
}
const saveEditRequest = async () => {
  if (!editRequest.id) return
  
  if (!isProjectAdmin.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyProjectAdminsCanEditRequests'),
    })
    isEditRequestOpen.value = false
    return
  }
  
  const { error } = await supabase
    .from('project_join_requests')
    .update({ ref_percentage: editRequest.ref_percentage })
    .eq('id', editRequest.id)
  
  if (error) {
    console.error('Error updating request:', error)
    return
  }
  
  await fetchJoinRequests()
  isEditRequestOpen.value = false
}
const openEditRef = (uid: string) => {
  editRef.uid = uid
  editRef.value = userRefInfo.value[uid]?.ref_percentage ?? null
  isEditRefOpen.value = true
}
const saveEditRef = async () => {
  if (!editRef.uid || editRef.value == null) { isEditRefOpen.value = false; return }
  
  if (!isProjectAdmin.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyProjectAdminsCanEditReferral'),
    })
    isEditRefOpen.value = false
    return
  }
  
  const v = Math.max(0, Math.min(100, Number(editRef.value)))
  
  const { error } = await supabase
    .from('user_project_info')
    .upsert({ 
      project_id: projectId.value, 
      user_id: editRef.uid, 
      ref_percentage: v 
    }, { onConflict: 'project_id,user_id' })
  
  if (error) {
    console.error('Error saving ref percentage:', error)
    return
  }
  
  if (!userRefInfo.value[editRef.uid]) {
    userRefInfo.value[editRef.uid] = { ref_percentage: v, joined_at: new Date().toISOString() }
  }
  userRefInfo.value[editRef.uid].ref_percentage = v
  isEditRefOpen.value = false
}

const openEditPolicy = () => {
  if (!isProjectAdmin.value) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: t('admin.onlyProjectAdminsCanEdit'),
    })
    return
  }
  editPolicy.policy = project.value?.policy || ''
  isEditPolicyOpen.value = true
}

const savePolicy = async () => {
  if (!isProjectAdmin.value || !project.value) return
  
  const { error } = await supabase
    .from('projects')
    .update({ policy: editPolicy.policy || null })
    .eq('id', projectId.value)
  
  if (error) {
    console.error('Error saving policy:', error)
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToCreateProject'),
      description: error.message,
    })
    return
  }
  
  if (project.value) {
    project.value.policy = editPolicy.policy || null
  }
  
  isEditPolicyOpen.value = false
  
  const toast = useToast()
  toast.add({
    color: 'green',
    title: t('common.save'),
    description: t('messages.success'),
  })
}
</script>

<template>
  <div class="container mx-auto">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <NuxtLink class="text-sm text-gray-500 hover:underline" to="/admin/projects">← {{ $t('common.back') }}</NuxtLink>
            <h2 class="font-semibold">{{ $t('admin.projectDetailTitle', { name: project?.name || projectId }) }}</h2>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500">{{ $t('common.filter') }}</span>
            <USelect v-model="selectedYear" :options="yearOptions" />
            <USelect v-model="selectedMonth" :options="monthOptions" />
          </div>
        </div>
      </template>

      <div class="grid grid-cols-1 gap-6">
        <!-- Policy Section -->
        <div class="col-span-1">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-medium">{{ $t('projects.policy') }}</h3>
                <UButton 
                  v-if="isProjectAdmin"
                  size="xs" 
                  color="gray" 
                  variant="soft"
                  @click="openEditPolicy"
                >
                  {{ $t('common.edit') }}
                </UButton>
              </div>
            </template>
            <div class="whitespace-pre-wrap text-sm text-gray-700">
              {{ project?.policy || $t('common.noData') }}
            </div>
          </UCard>
        </div>

        <div class="col-span-1">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-medium">{{ $t('common.admins') }}</h3>
                <UButton 
                  size="xs" 
                  color="primary" 
                  @click="isAddAdminOpen = true"
                  :disabled="!isProjectAdmin"
                  :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanAddAdmins') : ''"
                >
                  {{ $t('projects.addAdmin') }}
                </UButton>
              </div>
            </template>
            <UTable :rows="adminsInProject.map(uid => ({ uid }))" :columns="[
              { key: 'name', label: $t('common.name') },
              { key: 'email', label: $t('common.email') },
              { key: 'joined', label: $t('common.joined') },
              { key: 'actions', label: $t('common.actions') },
            ]">
              <template #name-data="{ row }">
                <div class="flex items-center gap-2">
                  <span>{{ adminLabel(row.uid) }}</span>
                  <UBadge 
                    v-if="allAdmins.find(a => a.id === row.uid)?.role === 'global_admin'" 
                    color="blue" 
                    variant="soft"
                    size="xs"
                  >
                    {{ $t('admin.globalAdmin') || 'Global Admin' }}
                  </UBadge>
                  <UBadge 
                    v-else-if="allAdmins.find(a => a.id === row.uid)?.role === 'project_owner'" 
                    color="gray" 
                    variant="soft"
                    size="xs"
                  >
                    {{ $t('admin.projectOwner') || 'Project Owner' }}
                  </UBadge>
                </div>
              </template>
              <template #email-data="{ row }">
                <span>{{ allAdmins.find(a => a.id === row.uid)?.email || '-' }}</span>
              </template>
              <template #joined-data="{ row }">
                <span>{{ formatDate(allAdmins.find(a => a.id === row.uid)?.created_at || '') }}</span>
              </template>
              <template #actions-data="{ row }">
                <UButton 
                  size="xs" 
                  color="red" 
                  variant="soft" 
                  :disabled="row.uid === currentAdminId || !isProjectAdmin"
                  :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanRemoveAdmins') : ''"
                  @click="removeAdmin(row.uid)"
                >
                  {{ $t('common.remove') }}
                </UButton>
              </template>
            </UTable>
          </UCard>
        </div>

        <div class="col-span-1">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-medium">{{ $t('common.users') }}</h3>
                <UButton 
                  size="xs" 
                  color="primary" 
                  @click="isAddUserOpen = true"
                  :disabled="!isProjectAdmin"
                  :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanAddUsers') : ''"
                >
                  {{ $t('projects.addUser') }}
                </UButton>
              </div>
            </template>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-left text-gray-500">
                    <th class="w-10"></th>
                    <th class="py-2">{{ $t('common.name') }}</th>
                    <th class="py-2">{{ $t('common.email') }}</th>
                    <th class="py-2">{{ $t('common.status') }}</th>
                    <th class="py-2">{{ $t('projects.joinedRequested') }}</th>
                    <th class="py-2">{{ $t('projects.refPercentage') }}</th>
                    <th class="py-2">{{ $t('common.actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in usersTableData" :key="`${row.user_id}-${row.status}`">
                    <tr class="border-t">
                      <td class="py-2">
                        <UButton 
                          v-if="row.status === 'joined'" 
                          size="xs" 
                          color="gray" 
                          variant="soft" 
                          @click="toggleExpand(row.user_id)"
                        >
                          <UIcon :name="expandedUsers.has(row.user_id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" />
                        </UButton>
                      </td>
                      <td class="py-2 font-medium">
                        <NuxtLink 
                          class="text-primary hover:underline" 
                          :to="`/admin/users/${row.user_id}`"
                        >
                          {{ userLabel(row.user_id) }}
                        </NuxtLink>
                      </td>
                      <td class="py-2">
                        <NuxtLink 
                          class="text-primary hover:underline" 
                          :to="`/admin/users/${row.user_id}`"
                        >
                          {{ allUsers.find(u => u.id === row.user_id)?.email || '-' }}
                        </NuxtLink>
                      </td>
                      <td class="py-2">
                        <UBadge 
                          :label="row.status === 'joined' ? $t('projects.joined') : $t('projects.pending')" 
                          :color="row.status === 'joined' ? 'green' : 'yellow'" 
                          variant="soft" 
                        />
                      </td>
                      <td class="py-2">{{ formatDate(row.status === 'joined' ? (row.joined_at || '') : (row.requested_at || '')) }}</td>
                      <td class="py-2">{{ row.ref_percentage }}%</td>
                      <td class="py-2 flex items-center gap-2">
                        <template v-if="row.status === 'joined'">
                          <UButton 
                            size="xs" 
                            color="gray" 
                            @click="openEditRef(row.user_id)"
                            :disabled="!isProjectAdmin"
                            :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanEditReferral') : ''"
                          >
                            {{ $t('projects.editRef') }}
                          </UButton>
                          <UButton 
                            size="xs" 
                            color="red" 
                            variant="soft" 
                            @click="removeUser(row.user_id)"
                            :disabled="!isProjectAdmin"
                            :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanRemoveUsers') : ''"
                          >
                            {{ $t('common.remove') }}
                          </UButton>
                        </template>
                        <template v-else>
                          <UButton 
                            size="xs" 
                            color="gray" 
                            variant="soft" 
                            @click="openEditRequest(joinRequests.find(r => r.id === row.join_request_id)!)"
                            :disabled="!isProjectAdmin"
                            :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanEditRequests') : ''"
                          >
                            {{ $t('common.edit') }}
                          </UButton>
                          <UButton 
                            size="xs" 
                            color="green" 
                            variant="soft" 
                            @click="approveJoinRequest(joinRequests.find(r => r.id === row.join_request_id)!)"
                            :disabled="!isProjectAdmin"
                            :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanApproveRequests') : ''"
                          >
                            {{ $t('projects.approve') }}
                          </UButton>
                          <UButton 
                            size="xs" 
                            color="red" 
                            variant="soft" 
                            @click="rejectJoinRequest(joinRequests.find(r => r.id === row.join_request_id)!)"
                            :disabled="!isProjectAdmin"
                            :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanRejectRequests') : ''"
                          >
                            {{ $t('projects.reject') }}
                          </UButton>
                        </template>
                      </td>
                    </tr>
                    <tr v-show="row.status === 'joined' && expandedUsers.has(row.user_id)" class="bg-gray-50/40">
                      <td></td>
                      <td class="py-2" :colspan="6">
                        <UTable :rows="commissionsByUser[row.user_id] || []" :columns="[
                          { key: 'date', label: $t('common.date') },
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
                          <template #client_name-data="{ row }">
                            <span>{{ row.client_name || '—' }}</span>
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
                            <UBadge :label="formatStatus(row.status || 'unknown')" :color="row.status === 'paid' ? 'green' : row.status === 'confirmed' ? 'blue' : 'yellow'" variant="soft" />
                          </template>
                          <template #actions-data="{ row }">
                            <UButton 
                              v-if="row.status === 'requested'" 
                              size="xs" 
                              color="gray" 
                              @click="confirmCommission(row)"
                              :disabled="!isProjectAdmin"
                              :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanApproveCommissions') : ''"
                            >
                              {{ $t('projects.approve') }}
                            </UButton>
                            <span v-else class="text-xs text-gray-400">—</span>
                          </template>
                        </UTable>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <div v-if="usersTableData.length === 0" class="text-xs text-gray-500 py-2">{{ $t('projects.noUsersOrPending') }}</div>
          </UCard>
        </div>
      </div>

      <UModal v-model="isAddUserOpen">
        <UCard>
          <template #header>
            <h3 class="font-semibold">{{ $t('projects.addUserToProject') }}</h3>
          </template>
          <div class="space-y-4">
            <UFormGroup :label="$t('projects.selectUser')">
              <USelect 
                v-model="(manageState as any).addUser" 
                :options="availableUserOptions" 
                :placeholder="$t('projects.selectUser')" 
              />
            </UFormGroup>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="gray" variant="soft" @click="isAddUserOpen = false">{{ $t('common.cancel') }}</UButton>
              <UButton 
                color="primary" 
                @click="async () => { 
                  if (!manageState.addUser || usersInProject.includes(manageState.addUser)) return
                  if (!isProjectAdmin.value) {
                    const toast = useToast()
                    toast.add({
                      color: 'red',
                      title: t('admin.permissionDenied'),
                      description: t('admin.onlyProjectAdminsCanAddUsers'),
                    })
                    return
                  }
                  
                  const { error } = await supabase
                    .from('user_project_info')
                    .upsert({ 
                      project_id: projectId.value, 
                      user_id: manageState.addUser, 
                      ref_percentage: 10 
                    }, { onConflict: 'project_id,user_id' })
                  
                  if (error) {
                    console.error('Error adding user:', error)
                    const toast = useToast()
                    toast.add({
                      color: 'red',
                      title: t('messages.failedToAddUser'),
                      description: error.message,
                    })
                    return
                  }
                  
                  await fetchUsersInProject()
                  manageState.addUser = undefined
                  isAddUserOpen.value = false
                }"
                :disabled="!manageState.addUser || usersInProject.includes(manageState.addUser || '') || !isProjectAdmin"
                :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanAddUsers') : ''"
              >
                {{ $t('common.add') }}
              </UButton>
            </div>
          </template>
        </UCard>
      </UModal>

      <UModal v-model="isAddAdminOpen">
        <UCard>
          <template #header>
            <h3 class="font-semibold">{{ $t('projects.addAdminToProject') }}</h3>
          </template>
          <div class="space-y-4">
            <UFormGroup :label="$t('projects.selectAdmin')">
              <USelect 
                v-model="(manageState as any).addAdmin" 
                :options="availableAdminOptions" 
                :placeholder="$t('projects.selectAdmin')" 
              />
              <p class="text-xs text-gray-500 mt-1">{{ $t('admin.onlyProjectOwnersCanBeAdded') }}</p>
            </UFormGroup>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="gray" variant="soft" @click="isAddAdminOpen = false">{{ $t('common.cancel') }}</UButton>
              <UButton 
                color="primary" 
                @click="async () => { 
                  if (!manageState.addAdmin || !project || !isProjectAdmin.value) return
                  
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
                  
                  if (adminsInProject.includes(manageState.addAdmin)) return
                  
                  const next = Array.from(new Set([...(project.admins || []), manageState.addAdmin]))
                  const { error } = await supabase.from('projects').update({ admins: next }).eq('id', projectId.value)
                  
                  if (error) {
                    const toast = useToast()
                    toast.add({
                      color: 'red',
                      title: t('messages.failedToAddAdmin'),
                      description: error.message,
                    })
                    return
                  }
                  
                  project.admins = next
                  adminsInProject.value = next
                  manageState.addAdmin = undefined
                  isAddAdminOpen.value = false
                }"
                :disabled="!manageState.addAdmin || adminsInProject.includes(manageState.addAdmin || '') || !project || !isProjectAdmin"
                :title="!isProjectAdmin ? $t('admin.onlyProjectAdminsCanAddAdmins') : ''"
              >
                {{ $t('common.add') }}
              </UButton>
            </div>
          </template>
        </UCard>
      </UModal>
      

      <UModal v-model="isEditRefOpen">
        <UCard>
          <template #header>
            <h3 class="font-semibold">{{ $t('projects.editReferralPercentage') }}</h3>
          </template>
          <div class="space-y-4">
            <UFormGroup :label="$t('projects.refPercentage')">
              <UInput v-model.number="(editRef as any).value" type="number" min="0" max="100" step="0.1" />
            </UFormGroup>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="gray" variant="soft" @click="isEditRefOpen = false">{{ $t('common.cancel') }}</UButton>
              <UButton color="primary" :disabled="editRef.value == null" @click="saveEditRef">{{ $t('common.save') }}</UButton>
            </div>
          </template>
        </UCard>
      </UModal>

      <UModal v-model="isEditRequestOpen">
        <UCard>
          <template #header>
            <h3 class="font-semibold">{{ $t('projects.editJoinRequest') }}</h3>
          </template>
          <div class="space-y-4">
            <UFormGroup :label="$t('projects.refPercentage')">
              <UInput v-model.number="(editRequest as any).ref_percentage" type="number" min="0" max="100" step="0.1" />
            </UFormGroup>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="gray" variant="soft" @click="isEditRequestOpen = false">{{ $t('common.cancel') }}</UButton>
              <UButton color="primary" :disabled="editRequest.ref_percentage == null" @click="saveEditRequest">{{ $t('common.save') }}</UButton>
            </div>
          </template>
        </UCard>
      </UModal>

      <UModal v-model="isEditPolicyOpen">
        <UCard>
          <template #header>
            <h3 class="font-semibold">{{ $t('projects.editPolicy') || 'Edit Policy' }}</h3>
          </template>
          <div class="space-y-4">
            <UFormGroup :label="$t('projects.policy')">
              <UTextarea 
                v-model="editPolicy.policy" 
                :rows="8"
                :placeholder="$t('projects.policyPlaceholder')"
              />
            </UFormGroup>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="gray" variant="soft" @click="isEditPolicyOpen = false">{{ $t('common.cancel') }}</UButton>
              <UButton color="primary" @click="savePolicy">{{ $t('common.save') }}</UButton>
            </div>
          </template>
        </UCard>
      </UModal>
    </UCard>
  </div>
</template>

<style scoped></style>

