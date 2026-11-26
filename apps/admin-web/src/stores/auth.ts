import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { AdminRole, type AdminUser } from '@qinyang/contracts';
import { authApi } from '../api/admin';
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../api/http';

function readStoredUser(): AdminUser | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as AdminUser;
  } catch {
    return null;
  }
}

/** 登录态：token + 管理员资料，持久化到 localStorage */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_STORAGE_KEY) ?? '');
  const user = ref<AdminUser | null>(readStoredUser());

  const isLoggedIn = computed(() => token.value.length > 0);
  const isOwner = computed(() => user.value?.role === AdminRole.OWNER);
  const roleLabel = computed(() => {
    if (user.value?.role === AdminRole.OWNER) {
      return '店主';
    }
    if (user.value?.role === AdminRole.STAFF) {
      return '店员';
    }
    return '未登录';
  });
  const displayName = computed(() => user.value?.displayName || user.value?.username || '—');

  function setSession(nextToken: string, nextUser: AdminUser): void {
    token.value = nextToken;
    user.value = nextUser;
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
  }

  function clear(): void {
    token.value = '';
    user.value = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }

  async function refreshProfile(): Promise<void> {
    const me = await authApi.me();
    user.value = me;
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(me));
  }

  return { token, user, isLoggedIn, isOwner, roleLabel, displayName, setSession, clear, refreshProfile };
});
