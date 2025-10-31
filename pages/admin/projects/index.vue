<script setup lang="ts">
definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: 'Admin - Projects' })

const supabase = useSupabaseClient()

type Project = { id: string, name: string, admins: string[] }
const projects = ref<Project[]>([])
const allUsers = ref<any[]>([])

const isCreateOpen = ref(false)
const isEditOpen = ref(false)
const isManageUsersOpen = ref(false)
const isManageAdminsOpen = ref(false)

const draft = reactive<{ id?: string, name: string }>({ name: '' })
const selected = ref<Project | null>(null)

const userOptions = computed(() => allUsers.value.map(u => ({ label: u.name || u.email, value: u.id })))

const columns = [
  { key: 'name', label: 'Project' },
  { key: 'usersCount', label: 'Users' },
  { key: 'adminsCount', label: 'Admins' },
  { key: 'actions', label: 'Actions' },
]

const goDetail = (id: string) => navigateTo({ name: 'admin-projects-id', params: { id } })

const projectIdToUsersCount = ref<Record<string, number>>({})
const tableRows = computed(() => projects.value.map(p => ({
  ...p,
  usersCount: projectIdToUsersCount.value[p.id] || 0,
  adminsCount: (p.admins || []).length,
})))

const openCreate = () => { draft.id = undefined; draft.name = ''; isCreateOpen.value = true }
const openEdit = (p: Project) => { draft.id = p.id; draft.name = p.name; isEditOpen.value = true }
const openManageUsers = (p: Project) => { selected.value = JSON.parse(JSON.stringify(p)); isManageUsersOpen.value = true }
const openManageAdmins = (p: Project) => { selected.value = JSON.parse(JSON.stringify(p)); isManageAdminsOpen.value = true }

const createProject = async () => {
  const { data } = await supabase.from('projects').insert({ name: draft.name.trim(), admins: [] }).select('id').single()
  if (data) projects.value.unshift({ id: data.id, name: draft.name.trim(), admins: [] })
  isCreateOpen.value = false
}
const saveProject = async () => {
  if (!draft.id) return
  await supabase.from('projects').update({ name: draft.name.trim() }).eq('id', draft.id)
  const idx = projects.value.findIndex(p => p.id === draft.id); if (idx !== -1) projects.value[idx].name = draft.name.trim(); isEditOpen.value = false
}
const deleteProject = async (p: Project) => {
  await supabase.from('projects').delete().eq('id', p.id)
  projects.value = projects.value.filter(x => x.id !== p.id)
}

const manageState = reactive<{ addUser?: string, addAdmin?: string }>({})
const addUserToProject = async () => { if (!selected.value || !manageState.addUser) return; await supabase.from('user_project_info').upsert({ project_id: selected.value.id, user_id: manageState.addUser, ref_percentage: 10 }); manageState.addUser = undefined; await refreshCounts() }
const removeUserFromProject = async (uid: string) => { if (!selected.value) return; await supabase.from('user_project_info').delete().eq('project_id', selected.value.id).eq('user_id', uid); await refreshCounts() }
const addAdminToProject = async () => { if (!selected.value || !manageState.addAdmin) return; const p = projects.value.find(pr => pr.id === selected.value!.id); if (!p) return; const next = Array.from(new Set([...(p.admins || []), manageState.addAdmin])); await supabase.from('projects').update({ admins: next }).eq('id', p.id); p.admins = next; manageState.addAdmin = undefined }
const removeAdminFromProject = async (uid: string) => { if (!selected.value) return; const p = projects.value.find(pr => pr.id === selected.value!.id); if (!p) return; const next = (p.admins || []).filter(id => id !== uid); await supabase.from('projects').update({ admins: next }).eq('id', p.id); p.admins = next }
const displayUser = (uid: string) => { const u = allUsers.value.find(x => x.id === uid); return u ? (u.name || u.email) : uid }

const saveUsers = () => { isManageUsersOpen.value = false }
const saveAdmins = () => { isManageAdminsOpen.value = false }

const refreshCounts = async () => {
  const { data } = await supabase.from('user_project_info').select('project_id, user_id')
  const counts: Record<string, number> = {}
  ;(data || []).forEach(r => { counts[r.project_id] = (counts[r.project_id] || 0) + 1 })
  projectIdToUsersCount.value = counts
}

onMounted(async () => {
  const [{ data: projs }, { data: users }] = await Promise.all([
    supabase.from('projects').select('id, name, admins').order('name'),
    supabase.from('user_profiles').select('id, email, name')
  ])
  projects.value = projs || []
  allUsers.value = users || []
  await refreshCounts()
})
</script>

<template>
  <div class="container mx-auto py-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Projects</h2>
          <UButton color="primary" @click="openCreate">New Project</UButton>
        </div>
      </template>

      <UTable :rows="tableRows" :columns="columns">
        <template #name-data="{ row }">
          <NuxtLink class="text-primary hover:underline" :to="{ name: 'admin-projects-id', params: { id: row.id } }">{{ row.name }}</NuxtLink>
        </template>
        <template #actions-data="{ row }">
          <div class="flex gap-2">
            <UButton size="xs" color="primary" variant="soft" @click="goDetail(row.id)">View</UButton>
            <UButton size="xs" color="gray" @click="openManageUsers(row)">Users</UButton>
            <UButton size="xs" color="gray" variant="soft" @click="openManageAdmins(row)">Admins</UButton>
            <UButton size="xs" color="gray" variant="soft" @click="openEdit(row)">Edit</UButton>
            <UButton size="xs" color="red" variant="soft" @click="deleteProject(row)">Delete</UButton>
          </div>
        </template>
      </UTable>
    </UCard>

    <!-- Create -->
    <UModal v-model="isCreateOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">New Project</h3>
        </template>
        <UForm @submit.prevent="createProject">
          <UFormGroup label="Name">
            <UInput v-model="draft.name" />
          </UFormGroup>
          <template #footer>
            <div class="flex justify-end gap-2 mt-4">
              <UButton color="gray" variant="soft" @click="isCreateOpen = false">Cancel</UButton>
              <UButton type="submit" color="primary" :disabled="!draft.name.trim()">Create</UButton>
            </div>
          </template>
        </UForm>
      </UCard>
    </UModal>

    <!-- Edit -->
    <UModal v-model="isEditOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">Edit Project</h3>
        </template>
        <UForm @submit.prevent="saveProject">
          <UFormGroup label="Name">
            <UInput v-model="draft.name" />
          </UFormGroup>
          <template #footer>
            <div class="flex justify-end gap-2 mt-4">
              <UButton color="gray" variant="soft" @click="isEditOpen = false">Cancel</UButton>
              <UButton type="submit" color="primary" :disabled="!draft.name.trim()">Save</UButton>
            </div>
          </template>
        </UForm>
      </UCard>
    </UModal>

    <!-- Manage Users -->
    <UModal v-model="isManageUsersOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">Manage Users</h3>
        </template>
        <div>
          <div class="flex gap-2 items-center mb-3">
            <USelect v-model="(manageState as any).addUser" :options="userOptions" placeholder="Select user" />
            <UButton size="xs" color="gray" @click="addUserToProject">Add</UButton>
          </div>
          <div class="flex flex-wrap gap-2">
            <UBadge v-for="uid in (selected?.users || [])" :key="uid" color="gray">
              <span class="mr-1">{{ displayUser(uid) }}</span>
              <UButton size="2xs" color="red" variant="link" @click="removeUserFromProject(uid)">×</UButton>
            </UBadge>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isManageUsersOpen = false">Cancel</UButton>
            <UButton color="primary" @click="saveUsers">Save</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Manage Admins -->
    <UModal v-model="isManageAdminsOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">Manage Admins</h3>
        </template>
        <div>
          <div class="flex gap-2 items-center mb-3">
            <USelect v-model="(manageState as any).addAdmin" :options="userOptions" placeholder="Select admin" />
            <UButton size="xs" color="gray" @click="addAdminToProject">Add</UButton>
          </div>
          <div class="flex flex-wrap gap-2">
            <UBadge v-for="uid in (selected?.admins || [])" :key="uid" color="primary">
              <span class="mr-1">{{ displayUser(uid) }}</span>
              <UButton size="2xs" color="red" variant="link" @click="removeAdminFromProject(uid)">×</UButton>
            </UBadge>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isManageAdminsOpen = false">Cancel</UButton>
            <UButton color="primary" @click="saveAdmins">Save</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<style scoped></style>
