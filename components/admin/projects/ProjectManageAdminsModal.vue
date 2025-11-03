<script setup lang="ts">
const { t } = useI18n()
const supabase = useSupabaseClient()
const { getErrorMessage } = useErrorMessage()
const { canManageProject } = useAdminRole()

type Project = { 
  id: string
  name: string
  admins: string[]
}

interface Props {
  modelValue: boolean
  project: Project | null
  allAdmins: Array<{ id: string; name?: string | null; email: string; role?: string | null }>
  projects: Project[]
  isGlobalAdmin: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'updated'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const manageState = reactive<{ addAdmin?: string }>({})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const availableAdminOptionsForManage = computed(() => {
  if (!props.project) return []
  const set = new Set(props.project.admins || [])
  return props.allAdmins
    .filter(a => {
      if (set.has(a.id)) return false
      return a.role !== 'global_admin'
    })
    .map(a => ({ 
      label: `${a.name || a.email}${a.role ? ` (${a.role === 'project_owner' ? t('admin.projectOwner') : a.role})` : ''}`, 
      value: a.id 
    }))
})

const displayAdmin = (uid: string) => { 
  const a = props.allAdmins.find(x => x.id === uid)
  return a ? (a.name || a.email) : uid 
}

const addAdminToProject = async () => { 
  if (!props.project || !manageState.addAdmin) return
  
  const canManage = await canManageProject(props.project.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: props.isGlobalAdmin ? t('admin.onlyGlobalAdminsCanAddAdmins') : t('admin.onlyProjectAdminsCanAddAdmins'),
    })
    return
  }
  
  const adminToAdd = props.allAdmins.find(a => a.id === manageState.addAdmin)
  if (adminToAdd && adminToAdd.role === 'global_admin') {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.cannotAddGlobalAdmin'),
      description: t('admin.globalAdminMustBeSetManually'),
    })
    return
  }
  
  if ((props.project.admins || []).includes(manageState.addAdmin)) {
    const toast = useToast()
    toast.add({
      color: 'yellow',
      title: t('messages.adminAlreadyInProject'),
      description: t('messages.adminAlreadyInProject'),
    })
    return
  }
  
  const p = props.projects.find(pr => pr.id === props.project!.id)
  if (!p) return
  
  const next = Array.from(new Set([...(p.admins || []), manageState.addAdmin]))
  const { error } = await supabase
    .from('projects')
    .update({ admins: next })
    .eq('id', p.id)
  
  if (error) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToAddAdmin'),
      description: getErrorMessage(error),
    })
    return
  }
  
  p.admins = next
  if (props.project) {
    props.project.admins = next
  }
  manageState.addAdmin = undefined
  emit('updated')
}

const removeAdminFromProject = async (uid: string) => { 
  if (!props.project) return
  
  const canManage = await canManageProject(props.project.id)
  if (!canManage) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('admin.permissionDenied'),
      description: props.isGlobalAdmin ? t('admin.onlyGlobalAdminsCanRemoveAdmins') : t('admin.onlyProjectAdminsCanRemoveAdmins'),
    })
    return
  }
  
  const p = props.projects.find(pr => pr.id === props.project!.id)
  if (!p) return
  const next = (p.admins || []).filter(id => id !== uid)
  const { error } = await supabase
    .from('projects')
    .update({ admins: next })
    .eq('id', p.id)
  
  if (error) {
    const toast = useToast()
    toast.add({
      color: 'red',
      title: t('messages.failedToRemove'),
      description: getErrorMessage(error),
    })
    return
  }
  
  p.admins = next
  if (props.project) {
    props.project.admins = next
  }
  emit('updated')
}

const saveAdmins = () => { 
  isOpen.value = false 
}
</script>

<template>
  <UModal v-model="isOpen">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">{{ $t('projects.manageAdmins') }}</h3>
          <div class="flex items-center gap-2">
            <USelect 
              v-model="manageState.addAdmin" 
              :options="availableAdminOptionsForManage" 
              :placeholder="$t('projects.selectAdmin')"
              class="w-48"
            />
            <UButton 
              color="primary" 
              @click="addAdminToProject" 
              :disabled="!manageState.addAdmin || (project?.admins || []).includes(manageState.addAdmin || '')"
            >
              {{ $t('common.add') }}
            </UButton>
          </div>
        </div>
      </template>
      <div class="space-y-4">
        <div v-if="project?.admins && project.admins.length > 0" class="flex flex-wrap gap-2">
          <UBadge v-for="uid in project.admins" :key="uid" color="primary">
            <span class="mr-1">{{ displayAdmin(uid) }}</span>
            <UButton size="2xs" color="red" variant="link" @click="removeAdminFromProject(uid)">×</UButton>
          </UBadge>
        </div>
        <div v-else class="text-sm text-gray-500 text-center py-4">
          {{ $t('projects.noAdmins') }}
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="soft" @click="isOpen = false">{{ $t('common.cancel') }}</UButton>
          <UButton color="primary" @click="saveAdmins">{{ $t('common.save') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

