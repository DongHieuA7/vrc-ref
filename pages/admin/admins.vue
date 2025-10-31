<script setup lang="ts">
definePageMeta({ middleware: ['auth','admin'] })
useSeoMeta({ title: 'Admin - Admins' })

const isLoading = ref(false)
const admins = ref<any[]>([])
const supabase = useSupabaseClient()

const form = reactive({
  email: '',
  name: '',
})

const isInviteOpen = ref(false)

const fetchAdmins = async () => {
  const { data } = await supabase
    .from('admins')
    .select('id, email, name, created_at')
    .order('created_at', { ascending: false })
  admins.value = data || []
}

onMounted(fetchAdmins)

const inviteAdmin = async () => {
  try {
    isLoading.value = true
    await $fetch('/api/admin/invite', { method: 'POST', body: { email: form.email, name: form.name, makeAdmin: true } })
    await fetchAdmins()
    form.email = ''
    form.name = ''
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="container mx-auto py-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Admins</h2>
          <UButton color="primary" @click="isInviteOpen = true">Invite Admin</UButton>
        </div>
      </template>

      <UTable :rows="admins" :columns="[
        { key: 'email', label: 'Email' },
        { key: 'name', label: 'Name' },
        { key: 'created_at', label: 'Created' },
      ]" />
    </UCard>

    <UModal v-model="isInviteOpen">
      <UCard>
        <template #header>
          <h3 class="font-semibold">Invite Admin</h3>
        </template>
        <UForm id="invite-admin-form" @submit.prevent="inviteAdmin">
          <UFormGroup label="Email">
            <UInput v-model="form.email" type="email" />
          </UFormGroup>
          <UFormGroup label="Name">
            <UInput v-model="form.name" />
          </UFormGroup>
        </UForm>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="isInviteOpen = false">Cancel</UButton>
            <UButton form="invite-admin-form" type="submit" color="primary" :loading="isLoading" :disabled="isLoading || !form.email">Invite</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<style scoped></style>

