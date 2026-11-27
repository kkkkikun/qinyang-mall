<template>
  <div>
    <div class="muted mb-8">
      量体模板：{{ snapshot.templateName }}（{{ snapshot.templateCode }} · v{{ snapshot.templateVersion }}）
    </div>

    <div v-if="!sections.length" class="empty-text">该申请没有量体资料</div>

    <div v-for="section in sections" :key="section.sectionId" class="measure-section">
      <div class="measure-section-head">
        <span>{{ section.title }}</span>
        <span class="muted">{{ typeLabel(section.measurementType) }}</span>
      </div>
      <div v-if="section.description" class="muted pad-top-8">
        {{ section.description }}
      </div>
      <div class="measure-field-list">
        <div v-for="field in section.measurementFields" :key="field.fieldCode" class="measure-field">
          <div>
            {{ field.fieldName }}
            <span v-if="field.required" class="text-red">*</span>
            <span class="muted">（{{ field.unit }}）</span>
          </div>
          <div class="measure-field-value" :class="{ muted: valueOf(field.fieldCode) === null }">
            {{ displayValue(field.fieldCode, field.unit) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MeasurementType, type MeasurementSnapshot } from '@qinyang/contracts';
import { MEASUREMENT_TYPE_LABELS } from '../utils/status';

const props = defineProps<{ snapshot: MeasurementSnapshot }>();

const sections = computed(() => props.snapshot.sections ?? []);

function typeLabel(type: MeasurementType): string {
  return MEASUREMENT_TYPE_LABELS[type] ?? type;
}

function valueOf(fieldCode: string): number | null {
  const found = props.snapshot.fields?.find((item) => item.fieldCode === fieldCode);
  return found ? found.value : null;
}

function displayValue(fieldCode: string, unit: string): string {
  const value = valueOf(fieldCode);
  if (value === null || value === undefined) {
    return '未填写';
  }
  return `${value} ${unit}`.trim();
}
</script>
