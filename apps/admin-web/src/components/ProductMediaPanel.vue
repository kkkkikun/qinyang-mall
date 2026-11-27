<template>
  <div>
    <div class="page-toolbar">
      <t-select v-model="uploadRole" class="media-role-select" :options="roleOptions" />
      <t-input-number v-model="uploadSort" :min="0" :max="999" style="width: 120px" />
      <label class="qy-upload-button">
        <input
          type="file"
          accept="image/*"
          multiple
          :disabled="uploading || !productId"
          @change="handleFileChange"
        />
        <span>{{ uploading ? `上传中…（${doneCount}/${totalCount}）` : '选择图片上传（可多选）' }}</span>
      </label>
      <span class="muted">
        上传后按所选角色归入图集；封面以「封面」角色的图集条目为准。图集内可用「上移/下移」调整顺序。
      </span>
    </div>

    <div v-if="!productId" class="empty-text">请先保存商品，再管理图集</div>
    <div v-else-if="!media.length" class="empty-text">暂无图集</div>

    <div v-for="group in grouped" v-else :key="group.role" class="media-group">
      <div class="section-title">{{ group.label }}</div>
      <div class="media-list">
        <div
          v-for="(item, index) in group.items"
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
          <div class="muted" style="margin-top: 4px; font-size: var(--qy-font-xs)">
            排序 {{ item.sortOrder }} · {{ item.width }}×{{ item.height }}
          </div>
          <div class="media-actions">
            <t-button
              theme="default"
              size="small"
              :disabled="index === 0 || busyId === item.id"
              @click="handleMove(item, index, -1)"
            >
              上移
            </t-button>
            <t-button
              theme="default"
              size="small"
              :disabled="index === group.items.length - 1 || busyId === item.id"
              @click="handleMove(item, index, 1)"
            >
              下移
            </t-button>
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
const totalCount = ref(0);
const doneCount = ref(0);

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

/**
 * 上传（支持多选）。
 *
 * 一件商品往往有 7~9 张图，此前只能一张张传 —— 76 件商品维护起来非常痛苦。
 * 多选后按顺序逐张上传，中途失败会明确报告成功/失败数量，不静默吞掉错误。
 */
async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length === 0 || !props.productId) {
    return;
  }
  uploading.value = true;
  totalCount.value = files.length;
  doneCount.value = 0;
  let failed = 0;
  try {
    for (const file of files) {
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
          // 多选上传时按当前排序值依次递增，顺序与选择顺序一致
          sortOrder: uploadSort.value + doneCount.value,
        });
      } catch {
        failed += 1;
      } finally {
        doneCount.value += 1;
      }
    }
    if (failed > 0) {
      MessagePlugin.warning(`已上传 ${files.length - failed} 张，${failed} 张失败`);
    } else {
      MessagePlugin.success(`已上传 ${files.length} 张图片`);
    }
    emit('changed');
  } finally {
    uploading.value = false;
  }
}

/**
 * 上移 / 下移：就地调整图集顺序。
 *
 * 交换相邻两图的排序值即可，不必删掉重传。
 */
async function handleMove(item: MediaDto, index: number, delta: number): Promise<void> {
  if (!props.productId) {
    return;
  }
  const group = grouped.value.find((entry) => entry.role === item.role);
  if (!group) {
    return;
  }
  const target = group.items[index + delta];
  if (!target) {
    return;
  }
  busyId.value = item.id;
  try {
    await productApi.updateMedia(props.productId, item.id, { sortOrder: target.sortOrder });
    await productApi.updateMedia(props.productId, target.id, { sortOrder: item.sortOrder });
    MessagePlugin.success('顺序已调整');
    emit('changed');
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '调整顺序失败'));
  } finally {
    busyId.value = '';
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
  font-size: var(--qy-font-base);
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
