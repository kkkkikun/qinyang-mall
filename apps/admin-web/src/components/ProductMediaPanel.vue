<template>
  <div>
    <div class="page-toolbar">
      <t-select v-model="uploadRole" class="media-role-select" :options="roleOptions" />
      <t-input-number v-model="uploadSort" :min="0" :max="999" style="width: 120px" />
      <label class="qy-upload-button">
        <input type="file" accept="image/*" :disabled="uploading || !productId" @change="handleFileChange" />
        <span>{{ uploading ? '上传中…' : '选择图片上传' }}</span>
      </label>
      <span class="muted">上传后按所选角色归入图集；封面以「封面」角色的图集条目为准。</span>
    </div>

    <div v-if="!productId" class="empty-text">请先保存商品，再管理图集</div>
    <div v-else-if="!media.length" class="empty-text">暂无图集</div>

    <div v-for="group in grouped" v-else :key="group.role" class="media-group">
      <div class="section-title">{{ group.label }}</div>
      <div class="media-list">
        <div
          v-for="item in group.items"
          :key="item.id"
          class="media-card"
          :class="{ 'is-cover': item.role === MediaRole.COVER }"
        >
          <img
            v-if="item.url"
            :src="item.url"
            :alt="item.alt ?? item.role"
            style="width: 100%; height: 96px; object-fit: cover; border-radius: 4px"
          />
          <div class="muted" style="margin-top: 4px; font-size: 12px">
            排序 {{ item.sortOrder }} · {{ item.width }}×{{ item.height }}
          </div>
          <div class="media-actions">
            <t-button
              v-if="item.role !== MediaRole.COVER"
              theme="default"
              size="small"
              :loading="busyId === item.id"
              @click="handleSetCover(item)"
            >
              设为封面
            </t-button>
            <t-popconfirm content="确认移除该图片？" theme="danger" @confirm="handleRemove(item)">
              <t-button theme="danger" variant="outline" size="small">移除</t-button>
            </t-popconfirm>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { MediaRole, type MediaDto } from '@qinyang/contracts';
import { mediaApi, productApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { MEDIA_ROLE_LABELS } from '../utils/status';

const props = defineProps<{ productId: string | null; media: MediaDto[] }>();
const emit = defineEmits<{ (event: 'changed'): void }>();

const roleOptions = Object.values(MediaRole).map((value) => ({
  label: MEDIA_ROLE_LABELS[value],
  value,
}));

const uploadRole = ref<MediaRole>(MediaRole.COVER);
const uploadSort = ref(0);
const uploading = ref(false);
const busyId = ref<string>('');

interface MediaGroup {
  role: MediaRole;
  label: string;
  items: MediaDto[];
}

/** 按角色分组，组内按 sortOrder 升序 */
const grouped = computed<MediaGroup[]>(() =>
  Object.values(MediaRole)
    .map((role) => ({
      role,
      label: MEDIA_ROLE_LABELS[role],
      items: props.media
        .filter((item) => item.role === role)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    }))
    .filter((group) => group.items.length > 0),
);

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';
  if (!file || !props.productId) {
    return;
  }
  uploading.value = true;
  try {
    const uploaded = await mediaApi.upload(file, props.productId);
    await productApi.addMedia(props.productId, {
      role: uploadRole.value,
      storageKey: uploaded.storageKey,
      url: uploaded.url,
      width: uploaded.width,
      height: uploaded.height,
      bytes: uploaded.bytes,
      alt: uploaded.alt ?? null,
      sortOrder: uploadSort.value,
    });
    MessagePlugin.success('图片已上传');
    emit('changed');
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '图片上传失败'));
  } finally {
    uploading.value = false;
  }
}

/** 设为封面：追加一条 role=COVER 的图集条目，并移除旧的封面条目 */
async function handleSetCover(item: MediaDto): Promise<void> {
  if (!props.productId) {
    return;
  }
  busyId.value = item.id;
  try {
    const oldCover = props.media.find(
      (media) => media.role === MediaRole.COVER && media.id !== item.id,
    );
    await productApi.addMedia(props.productId, {
      role: MediaRole.COVER,
      storageKey: item.storageKey,
      url: item.url,
      width: item.width,
      height: item.height,
      bytes: item.bytes,
      alt: item.alt ?? null,
      sortOrder: 0,
    });
    if (oldCover) {
      await productApi.removeMedia(props.productId, oldCover.id);
    }
    MessagePlugin.success('已设为封面');
    emit('changed');
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '设置封面失败'));
  } finally {
    busyId.value = '';
  }
}

async function handleRemove(item: MediaDto): Promise<void> {
  if (!props.productId) {
    return;
  }
  busyId.value = item.id;
  try {
    await productApi.removeMedia(props.productId, item.id);
    MessagePlugin.success('已移除');
    emit('changed');
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '移除失败'));
  } finally {
    busyId.value = '';
  }
}
</script>

<style scoped>
.qy-upload-button {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 14px;
  border-radius: 3px;
  background: var(--qy-tan);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}

.qy-upload-button input {
  display: none;
}

.qy-upload-button:hover {
  background: var(--qy-gold);
}
</style>
