# 处理日志（可复现性记录）

生成时间: 2026-11-16 00:05:53

### 01_inventory

```
[2026-11-15 21:57:27] newly analyzed: 0; reused from cache: 690
[2026-11-15 22:06:44] perceptual hashes computed: 690
[2026-11-15 22:06:44] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/image_inventory.csv (690 rows)
[2026-11-15 22:06:44] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/inventory_summary.md
[2026-11-15 22:06:44] DONE images=690 exact_dup_groups=0 corrupt=0 lowres=0 size=10.4 GB
[2026-11-15 22:06:44] === stage 01_inventory end (ok=True) ===
[2026-11-15 23:36:43] === stage 01_inventory start ===
[2026-11-15 23:36:43] source images discovered: 690
[2026-11-15 23:36:43] newly analyzed: 0; reused from cache: 690
[2026-11-15 23:36:43] perceptual hashes computed: 0
[2026-11-15 23:36:43] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/image_inventory.csv (690 rows)
[2026-11-15 23:36:44] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/inventory_summary.md
[2026-11-15 23:36:44] DONE images=690 exact_dup_groups=0 corrupt=0 lowres=0 size=10.4 GB
[2026-11-15 23:36:44] === stage 01_inventory end (ok=True) ===
```

### 03_features

```
[2026-11-15 23:38:15] features 100/690
[2026-11-15 23:38:48] features 150/690
[2026-11-15 23:39:22] features 200/690
[2026-11-15 23:39:55] features 250/690
[2026-11-15 23:40:29] features 300/690
[2026-11-15 23:40:59] features 350/690
[2026-11-15 23:41:33] features 400/690
[2026-11-15 23:42:14] features 450/690
[2026-11-15 23:42:56] features 500/690
[2026-11-15 23:43:41] features 550/690
[2026-11-15 23:44:24] features 600/690
[2026-11-15 23:45:11] features 650/690
[2026-11-15 23:45:44] DONE features=690 errors=0
[2026-11-15 23:45:44] === stage 03_features end (ok=True) ===
```

### 03c_border_stats

```
[2026-11-15 23:53:13] === stage 03c_border_stats start ===
[2026-11-15 23:53:13] images=690 to process=690
[2026-11-15 23:54:22] border stats 100/690
[2026-11-15 23:55:31] border stats 200/690
[2026-11-15 23:56:39] border stats 300/690
[2026-11-15 23:57:39] border stats 400/690
[2026-11-15 23:58:42] border stats 500/690
[2026-11-15 23:59:48] border stats 600/690
[2026-11-16 00:00:47] DONE border stats=690 busy_backdrops=252
[2026-11-16 00:00:47] === stage 03c_border_stats end (ok=True) ===
```

### 04b_label

```
[2026-11-15 23:47:02] CLIP model not available - using classical CV labelling
[2026-11-15 23:47:02] roles: [('detail', 371), ('fabric', 120), ('front', 101), ('back', 53), ('other', 45)]
[2026-11-15 23:47:02] categories: [('knitwear', 530), ('clothing', 113), ('shirts', 27), ('scarves', 20)]
[2026-11-15 23:47:02] reviewed images: 690
[2026-11-15 23:47:02] DONE labels=690
[2026-11-15 23:47:02] === stage 04b_label end (ok=True) ===
[2026-11-16 00:01:14] === stage 04b_label start ===
[2026-11-16 00:01:14] visual review overrides loaded: 690 images across 76 products
[2026-11-16 00:01:14] CLIP model not available - using classical CV labelling
[2026-11-16 00:01:14] roles: [('detail', 371), ('fabric', 120), ('front', 101), ('back', 53), ('other', 45)]
[2026-11-16 00:01:14] categories: [('knitwear', 530), ('clothing', 113), ('shirts', 27), ('scarves', 20)]
[2026-11-16 00:01:14] reviewed images: 690
[2026-11-16 00:01:14] DONE labels=690
[2026-11-16 00:01:14] === stage 04b_label end (ok=True) ===
```

### 05_duplicates

```
[2026-11-15 22:18:11] === stage 05_duplicates start ===
[2026-11-15 22:18:12] perceptual near-duplicate candidates: 97
[2026-11-15 22:18:12] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/duplicate_report.csv (97 rows)
[2026-11-15 22:18:12] exact groups=0 near-dup pairs=97 (same source folder: 97)
[2026-11-15 22:18:12] DONE
[2026-11-15 22:18:12] === stage 05_duplicates end (ok=True) ===
```

### 06_cluster

```
[2026-11-15 22:19:11] DONE products=76 uncertain=76
[2026-11-15 22:19:11] === stage 06_cluster end (ok=True) ===
[2026-11-15 23:06:08] === stage 06_cluster start ===
[2026-11-15 23:06:08] images=690 embeddings=0
[2026-11-15 23:06:08] cross-library candidate relations: 0
[2026-11-15 23:06:08] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/uncertain_groups.csv (76 rows)
[2026-11-15 23:06:08] DONE products=76 uncertain=76
[2026-11-15 23:06:08] === stage 06_cluster end (ok=True) ===
[2026-11-15 23:17:35] === stage 06_cluster start ===
[2026-11-15 23:17:35] images=690 embeddings=0
[2026-11-15 23:17:35] cross-library candidate relations: 0
[2026-11-15 23:17:35] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/uncertain_groups.csv (24 rows)
[2026-11-15 23:17:35] DONE products=76 uncertain=24
[2026-11-15 23:17:35] === stage 06_cluster end (ok=True) ===
```

### 06b_crosslib

```
[2026-11-15 23:14:43] === stage 06b_crosslib start ===
[2026-11-15 23:14:43] cross-library perceptual-hash candidates: 3
[2026-11-15 23:14:43] cross-library candidate rows: 24
[2026-11-15 23:14:43] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/cross_library_candidates.csv
[2026-11-15 23:14:43] === stage 06b_crosslib end (ok=True) ===
```

### 07_process

```
[2026-11-15 23:18:28] processed 150/690
[2026-11-15 23:19:48] processed 200/690
[2026-11-15 23:21:02] processed 250/690
[2026-11-15 23:22:21] processed 300/690
[2026-11-15 23:23:31] processed 350/690
[2026-11-15 23:24:49] processed 400/690
[2026-11-15 23:26:11] processed 450/690
[2026-11-15 23:27:34] processed 500/690
[2026-11-15 23:29:01] processed 550/690
[2026-11-15 23:30:29] processed 600/690
[2026-11-15 23:31:59] processed 650/690
[2026-11-15 23:33:10] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/quality_report.csv (690 rows)
[2026-11-15 23:33:10] DONE {'processed': 690, 'thumbnails': 690, 'display': 1140, 'skipped': 0}
[2026-11-15 23:33:10] === stage 07_process end (ok=True) ===
```

### 07_process_report

```
[2026-11-15 23:47:02] === stage 07_process_report start ===
[2026-11-15 23:47:02] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/quality_report.csv (690 rows)
[2026-11-15 23:47:02] DONE {'processed': 0, 'thumbnails': 0, 'display': 0, 'skipped': 0}
[2026-11-15 23:47:02] === stage 07_process_report end (ok=True) ===
[2026-11-16 00:01:15] === stage 07_process_report start ===
[2026-11-16 00:01:15] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/quality_report.csv (690 rows)
[2026-11-16 00:01:15] DONE {'processed': 0, 'thumbnails': 0, 'display': 0, 'skipped': 0}
[2026-11-16 00:01:15] === stage 07_process_report end (ok=True) ===
[2026-11-16 00:02:17] === stage 07_process_report start ===
[2026-11-16 00:02:17] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/quality_report.csv (690 rows)
[2026-11-16 00:02:17] DONE {'processed': 0, 'thumbnails': 0, 'display': 0, 'skipped': 0}
[2026-11-16 00:02:17] === stage 07_process_report end (ok=True) ===
```

### 07b_rename

```
[2026-11-15 23:36:44] === stage 07b_rename start ===
[2026-11-15 23:36:44] renamed 2520 derivative files (missing image_id: 0)
[2026-11-15 23:36:44] === stage 07b_rename end (ok=True) ===
```

### 08_catalog

```
[2026-11-16 00:03:50] === stage 08_catalog start ===
[2026-11-16 00:03:50] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/product_catalog.csv (76 products)
[2026-11-16 00:03:50] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/image_manifest.json (690 images)
[2026-11-16 00:03:50] wrote categories indexes: shirts=3, scarves=5, knitwear=55, clothing=13, accessories=0, unknown=0
[2026-11-16 00:03:50] wrote ai-ready reference index (355 candidates)
[2026-11-16 00:03:50] DONE
[2026-11-16 00:03:50] === stage 08_catalog end (ok=True) ===
[2026-11-16 00:04:37] === stage 08_catalog start ===
[2026-11-16 00:04:38] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/product_catalog.csv (76 products)
[2026-11-16 00:04:38] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/image_manifest.json (690 images)
[2026-11-16 00:04:38] wrote categories indexes: shirts=3, scarves=5, knitwear=55, clothing=13, accessories=0, unknown=0
[2026-11-16 00:04:38] wrote ai-ready reference index (355 candidates)
[2026-11-16 00:04:38] DONE
[2026-11-16 00:04:38] === stage 08_catalog end (ok=True) ===
```

### 09_review_page

```
[2026-11-16 00:02:22] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/review/index.html (497 KB)
[2026-11-16 00:02:57] wrote contact sheets: ['contact_scarves.jpg', 'contact_knitwear.jpg', 'contact_shirts.jpg', 'contact_clothing.jpg']
[2026-11-16 00:02:57] DONE
[2026-11-16 00:02:57] === stage 09_review_page end (ok=True) ===
[2026-11-16 00:03:51] === stage 09_review_page start ===
[2026-11-16 00:03:51] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/review/index.html (501 KB)
[2026-11-16 00:04:23] wrote contact sheets: ['contact_scarves.jpg', 'contact_knitwear.jpg', 'contact_shirts.jpg', 'contact_clothing.jpg']
[2026-11-16 00:04:23] DONE
[2026-11-16 00:04:23] === stage 09_review_page end (ok=True) ===
[2026-11-16 00:04:38] === stage 09_review_page start ===
[2026-11-16 00:04:38] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/review/index.html (500 KB)
[2026-11-16 00:05:09] wrote contact sheets: ['contact_scarves.jpg', 'contact_knitwear.jpg', 'contact_shirts.jpg', 'contact_clothing.jpg']
[2026-11-16 00:05:09] DONE
[2026-11-16 00:05:09] === stage 09_review_page end (ok=True) ===
```

### 10_review_sheets

```
[2026-11-15 23:06:08] === stage 10_review_sheets start ===
[2026-11-15 23:12:35] wrote 76 sheets to /home/kikun/MyProject/clothing-mall-miniapp/catalog/review/product_sheets
[2026-11-15 23:12:35] === stage 10_review_sheets end (ok=True) ===
```

### 11_ai_ready

```
[2026-11-16 00:02:57] DONE suitable_for_ai=51/76
[2026-11-16 00:02:57] === stage 11_ai_ready end (ok=True) ===
[2026-11-16 00:04:24] === stage 11_ai_ready start ===
[2026-11-16 00:04:24] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/ai-ready/ai_readiness.csv (76 products)
[2026-11-16 00:04:24] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/ai-ready/ai_readiness.json
[2026-11-16 00:04:24] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/ai-ready/reference/ai_reference_pool.csv (263 reference images)
[2026-11-16 00:04:24] DONE suitable_for_ai=51/76
[2026-11-16 00:04:24] === stage 11_ai_ready end (ok=True) ===
[2026-11-16 00:05:09] === stage 11_ai_ready start ===
[2026-11-16 00:05:09] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/ai-ready/ai_readiness.csv (76 products)
[2026-11-16 00:05:09] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/ai-ready/ai_readiness.json
[2026-11-16 00:05:09] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/ai-ready/reference/ai_reference_pool.csv (263 reference images)
[2026-11-16 00:05:09] DONE suitable_for_ai=51/76
[2026-11-16 00:05:09] === stage 11_ai_ready end (ok=True) ===
```

### 12_readme

```
[2026-11-16 00:02:57] === stage 12_readme start ===
[2026-11-16 00:02:57] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/README.md
[2026-11-16 00:02:57] wrote processing_log.md
[2026-11-16 00:02:57] === stage 12_readme end (ok=True) ===
[2026-11-16 00:04:24] === stage 12_readme start ===
[2026-11-16 00:04:24] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/README.md
[2026-11-16 00:04:24] wrote processing_log.md
[2026-11-16 00:04:24] === stage 12_readme end (ok=True) ===
[2026-11-16 00:05:10] === stage 12_readme start ===
[2026-11-16 00:05:10] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/README.md
[2026-11-16 00:05:10] wrote processing_log.md
[2026-11-16 00:05:10] === stage 12_readme end (ok=True) ===
[2026-11-16 00:05:53] === stage 12_readme start ===
[2026-11-16 00:05:53] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/README.md
```

### 13_audit

```
[2026-11-16 00:01:52] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/acceptance_check.md: 12/12 PASS
[2026-11-16 00:01:52] === stage 13_audit end (ok=True) ===
[2026-11-16 00:02:57] === stage 13_audit start ===
[2026-11-16 00:02:57] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/acceptance_check.md: 12/12 PASS
[2026-11-16 00:02:57] === stage 13_audit end (ok=True) ===
[2026-11-16 00:04:24] === stage 13_audit start ===
[2026-11-16 00:04:24] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/acceptance_check.md: 12/12 PASS
[2026-11-16 00:04:24] === stage 13_audit end (ok=True) ===
[2026-11-16 00:05:10] === stage 13_audit start ===
[2026-11-16 00:05:10] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/acceptance_check.md: 12/12 PASS
[2026-11-16 00:05:10] === stage 13_audit end (ok=True) ===
[2026-11-16 00:05:32] === stage 13_audit start ===
[2026-11-16 00:05:32] wrote /home/kikun/MyProject/clothing-mall-miniapp/catalog/reports/acceptance_check.md: 12/12 PASS
[2026-11-16 00:05:32] === stage 13_audit end (ok=True) ===
```
