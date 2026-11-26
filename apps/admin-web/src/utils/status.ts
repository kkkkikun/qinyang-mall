import {
  MediaRole,
  OrderStatus,
  ProductStatus,
  QuoteStatus,
  RequestStatus,
  TemplateStatus,
  MeasurementType,
} from '@qinyang/contracts';

/** TDesign Tag 支持的主题色 */
export type TagTheme = 'default' | 'primary' | 'warning' | 'danger' | 'success';

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  [QuoteStatus.ACTIVE]: '当前有效',
  [QuoteStatus.SUPERSEDED]: '已被新版本取代',
  [QuoteStatus.WITHDRAWN]: '已撤回',
};

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  [TemplateStatus.DRAFT]: '草稿',
  [TemplateStatus.ACTIVE]: '已发布',
  [TemplateStatus.ARCHIVED]: '已归档',
};

export const MEDIA_ROLE_LABELS: Record<MediaRole, string> = {
  [MediaRole.COVER]: '封面',
  [MediaRole.FRONT]: '正面',
  [MediaRole.BACK]: '背面',
  [MediaRole.DETAIL]: '细节',
  [MediaRole.FABRIC]: '面料',
  [MediaRole.MODEL]: '模特',
  [MediaRole.FLATLAY]: '平铺',
  [MediaRole.SIZE_CHART]: '尺码表',
  [MediaRole.DESCRIPTION]: '说明图',
  [MediaRole.OTHER]: '其他',
};

export const MEASUREMENT_TYPE_LABELS: Record<MeasurementType, string> = {
  [MeasurementType.BODY]: '身体测量',
  [MeasurementType.GARMENT_FLAT]: '合身衣物平铺测量',
};

export function productStatusTheme(status: ProductStatus): TagTheme {
  switch (status) {
    case ProductStatus.PUBLISHED:
      return 'success';
    case ProductStatus.PENDING_REVIEW:
      return 'warning';
    case ProductStatus.OFFLINE:
      return 'default';
    case ProductStatus.DRAFT:
    default:
      return 'primary';
  }
}

export function requestStatusTheme(status: RequestStatus): TagTheme {
  switch (status) {
    case RequestStatus.PENDING_REVIEW:
      return 'warning';
    case RequestStatus.PENDING_QUOTE:
      return 'warning';
    case RequestStatus.QUOTED:
      return 'primary';
    case RequestStatus.CONFIRMED:
    case RequestStatus.IN_PRODUCTION:
      return 'primary';
    case RequestStatus.SHIPPED:
      return 'success';
    case RequestStatus.COMPLETED:
      return 'success';
    case RequestStatus.CANCELLED:
    case RequestStatus.REJECTED:
    default:
      return 'default';
  }
}

export function orderStatusTheme(status: OrderStatus): TagTheme {
  switch (status) {
    case OrderStatus.CONFIRMED:
      return 'warning';
    case OrderStatus.IN_PRODUCTION:
      return 'primary';
    case OrderStatus.SHIPPED:
      return 'primary';
    case OrderStatus.COMPLETED:
      return 'success';
    case OrderStatus.CANCELLED:
    default:
      return 'default';
  }
}

export function quoteStatusTheme(status: QuoteStatus): TagTheme {
  switch (status) {
    case QuoteStatus.ACTIVE:
      return 'success';
    case QuoteStatus.SUPERSEDED:
      return 'default';
    case QuoteStatus.WITHDRAWN:
    default:
      return 'warning';
  }
}

export function templateStatusTheme(status: TemplateStatus): TagTheme {
  switch (status) {
    case TemplateStatus.ACTIVE:
      return 'success';
    case TemplateStatus.DRAFT:
      return 'warning';
    case TemplateStatus.ARCHIVED:
    default:
      return 'default';
  }
}
