/**
 * 量体模板本地兜底数据（由 tools/build_measure_templates.py 从 prototype/data 生成）。
 *
 * 用途：图文指南页在接口未返回内容时，仍能展示量体字段与测量说明；
 * 字段结构与 packages/contracts 的 MeasurementTemplateDto 一致。
 */
import { MeasurementTemplateDto, MeasurementType, TemplateStatus } from '../types/contracts';

export const MEASURE_TEMPLATES: MeasurementTemplateDto[] = [
  {
    "id": "TPL-KNIT-TOPS",
    "code": "TPL-KNIT-TOPS",
    "name": "针织上装 / 衬衫量体模板",
    "version": 1,
    "rowVersion": 1,
    "status": TemplateStatus.ACTIVE,
    "applicableCategories": [
      "knitwear",
      "shirts"
    ],
    "summary": "先量身体三围（胸围 / 身高 / 体重），再量一件合身上衣的肩宽、胸宽与衣长，取两组数据的参考组合下单制作。",
    "measurementSections": [
      {
        "sectionId": "body",
        "title": "身体测量",
        "measurementType": MeasurementType.BODY,
        "description": "穿贴身衣物、赤脚或着薄鞋测量，数据最接近真实身体状态。",
        "measurementFields": [
          {
            "fieldCode": "chest_bust",
            "fieldName": "胸围",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": true,
            "instruction": "围量胸部最丰满处一周。软尺保持水平，贴合身体但不要勒紧；自然站立、双手自然下垂，平静呼吸后读数。",
            "tips": [
              "软尺不要扭转",
              "建议测量两次取平均",
              "穿过外套测量会偏大"
            ],
            "illustration": "chest.svg",
            "min": 60,
            "max": 140,
            "step": 0.5
          },
          {
            "fieldCode": "height",
            "fieldName": "身高",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": true,
            "instruction": "脱鞋背靠墙壁站直，双脚并拢自然站立，眼睛平视前方。软尺垂直测量从地面到头顶的距离。",
            "tips": [
              "不要踮脚",
              "墙面要平整",
              "头发蓬松时按压头顶测量"
            ],
            "illustration": "height.svg",
            "min": 140,
            "max": 200,
            "step": 0.5
          },
          {
            "fieldCode": "weight",
            "fieldName": "体重",
            "measurementType": MeasurementType.BODY,
            "unit": "kg",
            "required": true,
            "instruction": "穿日常穿着的衣物称重，空腹或餐后同一时间测量更稳定。体重用于核对尺码与版型。",
            "tips": [
              "同一台体重秤测量",
              "保留一位小数"
            ],
            "illustration": "weight.svg",
            "min": 30,
            "max": 150,
            "step": 0.1
          },
          {
            "fieldCode": "shoulder_body",
            "fieldName": "肩宽（身体）",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": false,
            "instruction": "自然垂手，测量两侧肩峰最外点之间的水平距离。肩型较特殊时建议同时提供合身衣物的肩宽。",
            "tips": [
              "不要耸肩",
              "与颈部测量保持同一水平线"
            ],
            "illustration": "shoulder_body.svg",
            "min": 30,
            "max": 60,
            "step": 0.5
          }
        ]
      },
      {
        "sectionId": "garment_flat",
        "title": "合身衣物平铺测量",
        "measurementType": MeasurementType.GARMENT_FLAT,
        "description": "准备一件穿着合身、款式相近的上衣，平铺后量取实际尺寸，比单量身体更贴近想要的合身度。",
        "measurementFields": [
          {
            "fieldCode": "shoulder_flat",
            "fieldName": "肩宽",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": true,
            "instruction": "选择一件合身的上衣，自然平铺，不要拉伸衣身。肩宽从两侧肩缝端点平直量取。",
            "tips": [
              "不要抻拉衣服",
              "肩缝端点到肩缝端点",
              "使用软尺沿肩线走直"
            ],
            "illustration": "shoulder_flat.svg",
            "min": 30,
            "max": 60,
            "step": 0.5
          },
          {
            "fieldCode": "chest_flat",
            "fieldName": "胸宽（平铺）",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": true,
            "instruction": "衣服平铺，测量两侧腋下点之间的水平直线距离（即胸围的一半），再乘以 2 得到胸围。",
            "tips": [
              "平铺后不要用手拉平",
              "腋下点取缝线交点",
              "结果 ×2 即为胸围"
            ],
            "illustration": "chest_flat.svg",
            "min": 40,
            "max": 80,
            "step": 0.5
          },
          {
            "fieldCode": "length_flat",
            "fieldName": "衣长",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": true,
            "instruction": "衣服自然平铺，从肩缝端点垂直量到下摆边缘的长度。",
            "tips": [
              "从肩缝端点起量",
              "下摆自然铺平",
              "开衫量单片长度并注明"
            ],
            "illustration": "length.svg",
            "min": 40,
            "max": 110,
            "step": 0.5
          },
          {
            "fieldCode": "sleeve_flat",
            "fieldName": "袖长",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": false,
            "instruction": "衣服平铺，从肩缝端点沿袖子外侧量至袖口边缘。",
            "tips": [
              "沿袖外侧走线",
              "无袖款式可跳过"
            ],
            "illustration": "sleeve.svg",
            "min": 20,
            "max": 75,
            "step": 0.5
          }
        ]
      }
    ],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  },
  {
    "id": "TPL-BOTTOM",
    "code": "TPL-BOTTOM",
    "name": "裤装 / 裙装量体模板",
    "version": 1,
    "rowVersion": 1,
    "status": TemplateStatus.ACTIVE,
    "applicableCategories": [
      "clothing"
    ],
    "summary": "下装以腰臀数据为关键，建议同时提供一条合身裤装或裙装做平铺对照。",
    "measurementSections": [
      {
        "sectionId": "body",
        "title": "身体测量",
        "measurementType": MeasurementType.BODY,
        "description": "测量腰部与臀部最丰满处，穿着贴身衣物测量。",
        "measurementFields": [
          {
            "fieldCode": "waist",
            "fieldName": "腰围",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": true,
            "instruction": "软尺水平环绕身体最细处（腰部）一周，保持贴合不勒紧，平静呼吸后读数。",
            "tips": [
              "不要把软尺勒紧",
              "保持水平",
              "在肚脐上方最细处测量"
            ],
            "illustration": "waist.svg",
            "min": 50,
            "max": 130,
            "step": 0.5
          },
          {
            "fieldCode": "hip",
            "fieldName": "臀围",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": true,
            "instruction": "软尺水平环绕臀部最丰满处一周，贴合但不要勒紧。",
            "tips": [
              "双腿并拢站立",
              "不要勒紧软尺",
              "经臀最丰满处测量"
            ],
            "illustration": "hip.svg",
            "min": 60,
            "max": 140,
            "step": 0.5
          },
          {
            "fieldCode": "height",
            "fieldName": "身高",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": true,
            "instruction": "脱鞋靠墙站直，软尺垂直测量从地面到头顶的距离。",
            "tips": [
              "不要踮脚"
            ],
            "illustration": "height.svg",
            "min": 140,
            "max": 200,
            "step": 0.5
          },
          {
            "fieldCode": "weight",
            "fieldName": "体重",
            "measurementType": MeasurementType.BODY,
            "unit": "kg",
            "required": true,
            "instruction": "穿日常衣物称重，用于核对版型松量。",
            "tips": [
              "同一台秤测量"
            ],
            "illustration": "weight.svg",
            "min": 30,
            "max": 150,
            "step": 0.1
          }
        ]
      },
      {
        "sectionId": "garment_flat",
        "title": "合身衣物平铺测量",
        "measurementType": MeasurementType.GARMENT_FLAT,
        "description": "平铺一条穿着合身的裤装或裙装，量取腰围、臀围与长度。",
        "measurementFields": [
          {
            "fieldCode": "waist_flat",
            "fieldName": "腰围（平铺）",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": false,
            "instruction": "衣物平铺后沿腰部边缘水平绕量一周，或量腰头平直宽度后 ×2。",
            "tips": [
              "不要拉伸腰头",
              "松紧腰标注弹性腰"
            ],
            "illustration": "waist_flat.svg",
            "min": 50,
            "max": 130,
            "step": 0.5
          },
          {
            "fieldCode": "hip_flat",
            "fieldName": "臀围（平铺）",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": false,
            "instruction": "衣物平铺，量臀部最宽处横向水平距离 ×2。",
            "tips": [
              "平铺后不要抻拉"
            ],
            "illustration": "hip_flat.svg",
            "min": 60,
            "max": 140,
            "step": 0.5
          },
          {
            "fieldCode": "length_flat",
            "fieldName": "裤长 / 裙长",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": true,
            "instruction": "衣物自然平铺，从腰头上沿垂直量至下摆边缘。",
            "tips": [
              "腰头含不含按客户要求注明"
            ],
            "illustration": "length.svg",
            "min": 40,
            "max": 120,
            "step": 0.5
          }
        ]
      }
    ],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  },
  {
    "id": "TPL-OUTER",
    "code": "TPL-OUTER",
    "name": "外套 / 卫衣量体模板",
    "version": 1,
    "rowVersion": 1,
    "status": TemplateStatus.ACTIVE,
    "applicableCategories": [
      "clothing"
    ],
    "summary": "外套类以胸围、肩宽与衣长为主，建议提供一件合身外套做平铺对照。",
    "measurementSections": [
      {
        "sectionId": "body",
        "title": "身体测量",
        "measurementType": MeasurementType.BODY,
        "description": "测量胸围与身高体重，用于确定基础版型。",
        "measurementFields": [
          {
            "fieldCode": "chest_bust",
            "fieldName": "胸围",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": true,
            "instruction": "围量胸部最丰满处一周，软尺保持水平，贴合但不要勒紧。",
            "tips": [
              "不要勒紧"
            ],
            "illustration": "chest.svg",
            "min": 60,
            "max": 140,
            "step": 0.5
          },
          {
            "fieldCode": "height",
            "fieldName": "身高",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": true,
            "instruction": "脱鞋靠墙站直，垂直测量头顶到地面的距离。",
            "tips": [
              "不要踮脚"
            ],
            "illustration": "height.svg",
            "min": 140,
            "max": 200,
            "step": 0.5
          },
          {
            "fieldCode": "weight",
            "fieldName": "体重",
            "measurementType": MeasurementType.BODY,
            "unit": "kg",
            "required": true,
            "instruction": "称量日常体重，用于版型松量核对。",
            "tips": [
              "同一台秤"
            ],
            "illustration": "weight.svg",
            "min": 30,
            "max": 150,
            "step": 0.1
          }
        ]
      },
      {
        "sectionId": "garment_flat",
        "title": "合身衣物平铺测量",
        "measurementType": MeasurementType.GARMENT_FLAT,
        "description": "平铺一件合身外套或卫衣，量取肩宽、胸宽与衣长。",
        "measurementFields": [
          {
            "fieldCode": "shoulder_flat",
            "fieldName": "肩宽",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": true,
            "instruction": "选择一件合身的上衣，自然平铺，不要拉伸衣身。肩宽从两侧肩缝端点平直量取。",
            "tips": [
              "不要抻拉衣服",
              "肩缝端点到肩缝端点"
            ],
            "illustration": "shoulder_flat.svg",
            "min": 30,
            "max": 60,
            "step": 0.5
          },
          {
            "fieldCode": "chest_flat",
            "fieldName": "胸宽（平铺）",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": true,
            "instruction": "衣服平铺，量两侧腋下点之间的水平距离 ×2 得到胸围。",
            "tips": [
              "平铺后不要用手拉平"
            ],
            "illustration": "chest_flat.svg",
            "min": 40,
            "max": 90,
            "step": 0.5
          },
          {
            "fieldCode": "length_flat",
            "fieldName": "衣长",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": true,
            "instruction": "自然平铺，从肩缝端点垂直量到下摆边缘。",
            "tips": [
              "肩缝端点起量"
            ],
            "illustration": "length.svg",
            "min": 50,
            "max": 120,
            "step": 0.5
          },
          {
            "fieldCode": "sleeve_flat",
            "fieldName": "袖长",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": false,
            "instruction": "平铺后从肩缝端点沿袖外侧量至袖口。",
            "tips": [
              "无袖款式可跳过"
            ],
            "illustration": "sleeve.svg",
            "min": 20,
            "max": 80,
            "step": 0.5
          }
        ]
      }
    ],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  },
  {
    "id": "TPL-SCARF",
    "code": "TPL-SCARF",
    "name": "围巾 / 披肩量体模板",
    "version": 1,
    "rowVersion": 1,
    "status": TemplateStatus.ACTIVE,
    "applicableCategories": [
      "scarves"
    ],
    "summary": "围巾以颈围和成品尺寸为主，量体需求相对简单。",
    "measurementSections": [
      {
        "sectionId": "body",
        "title": "身体测量",
        "measurementType": MeasurementType.BODY,
        "description": "测量颈部尺寸。",
        "measurementFields": [
          {
            "fieldCode": "neck",
            "fieldName": "颈围",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": true,
            "instruction": "软尺水平环绕颈部最细处一周，保持贴合，能插入一指为宜，不要勒紧。",
            "tips": [
              "保持水平",
              "留一指间隙"
            ],
            "illustration": "neck.svg",
            "min": 28,
            "max": 60,
            "step": 0.5
          }
        ]
      },
      {
        "sectionId": "garment_flat",
        "title": "合身衣物平铺测量",
        "measurementType": MeasurementType.GARMENT_FLAT,
        "description": "如需与既有围巾等长，请平铺后量取实际尺寸。",
        "measurementFields": [
          {
            "fieldCode": "length_flat",
            "fieldName": "长度",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": false,
            "instruction": "围巾自然平铺，量取长边两端之间的距离。",
            "tips": [
              "不要抻拉",
              "含流苏请注明"
            ],
            "illustration": "scarf_length.svg",
            "min": 100,
            "max": 250,
            "step": 0.5
          },
          {
            "fieldCode": "width_flat",
            "fieldName": "宽度",
            "measurementType": MeasurementType.GARMENT_FLAT,
            "unit": "cm",
            "required": false,
            "instruction": "平铺后量取宽度方向的距离。",
            "tips": [
              "平铺后测量"
            ],
            "illustration": "scarf_width.svg",
            "min": 20,
            "max": 90,
            "step": 0.5
          }
        ]
      }
    ],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  },
  {
    "id": "TPL-GENERIC",
    "code": "TPL-GENERIC",
    "name": "通用量体模板",
    "version": 1,
    "rowVersion": 1,
    "status": TemplateStatus.ACTIVE,
    "applicableCategories": [
      "accessories",
      "unknown"
    ],
    "summary": "配饰类通常无需量体，可直接下单；以下字段全部选填。",
    "measurementSections": [
      {
        "sectionId": "body",
        "title": "身体测量（选填）",
        "measurementType": MeasurementType.BODY,
        "description": "如需更贴合的尺寸，可补充以下数据。",
        "measurementFields": [
          {
            "fieldCode": "height",
            "fieldName": "身高",
            "measurementType": MeasurementType.BODY,
            "unit": "cm",
            "required": false,
            "instruction": "脱鞋靠墙站直，垂直测量头顶到地面的距离。",
            "tips": [
              "不要踮脚"
            ],
            "illustration": "height.svg",
            "min": 140,
            "max": 200,
            "step": 0.5
          },
          {
            "fieldCode": "weight",
            "fieldName": "体重",
            "measurementType": MeasurementType.BODY,
            "unit": "kg",
            "required": false,
            "instruction": "称量日常体重。",
            "tips": [],
            "illustration": "weight.svg",
            "min": 30,
            "max": 150,
            "step": 0.1
          }
        ]
      }
    ],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
];
