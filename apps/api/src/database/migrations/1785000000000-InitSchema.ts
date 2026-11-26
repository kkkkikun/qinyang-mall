import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 初始 schema。禁止在正式配置使用 synchronize，结构只由 migration 演进。
 */
export class InitSchema1785000000000 implements MigrationInterface {
  name = 'InitSchema1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE \`admin_users\` (
      \`id\` varchar(36) NOT NULL,
      \`username\` varchar(64) NOT NULL,
      \`passwordHash\` varchar(120) NOT NULL,
      \`displayName\` varchar(64) NOT NULL,
      \`role\` varchar(16) NOT NULL DEFAULT 'STAFF',
      \`status\` varchar(16) NOT NULL DEFAULT 'ACTIVE',
      \`lastLoginAt\` datetime NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`UQ_admin_users_username\` (\`username\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`customers\` (
      \`id\` varchar(36) NOT NULL,
      \`openid\` varchar(64) NULL,
      \`unionid\` varchar(64) NULL,
      \`nickname\` varchar(64) NOT NULL DEFAULT '琴扬顾客',
      \`phone\` varchar(32) NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`UQ_customers_openid\` (\`openid\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`categories\` (
      \`id\` varchar(36) NOT NULL,
      \`code\` varchar(64) NOT NULL,
      \`name\` varchar(64) NOT NULL,
      \`parentId\` varchar(36) NULL,
      \`level\` tinyint NOT NULL DEFAULT 1,
      \`sortOrder\` int NOT NULL DEFAULT 0,
      \`status\` varchar(16) NOT NULL DEFAULT 'ACTIVE',
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`UQ_categories_code\` (\`code\`),
      INDEX \`IDX_categories_parentId\` (\`parentId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`measurement_templates\` (
      \`id\` varchar(36) NOT NULL,
      \`code\` varchar(64) NOT NULL,
      \`name\` varchar(128) NOT NULL,
      \`version\` int NOT NULL DEFAULT 1,
      \`status\` varchar(16) NOT NULL DEFAULT 'DRAFT',
      \`applicableCategories\` json NULL,
      \`summary\` varchar(512) NULL,
      \`measurementSections\` json NOT NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      INDEX \`IDX_measurement_templates_code\` (\`code\`),
      INDEX \`IDX_measurement_templates_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`products\` (
      \`id\` varchar(36) NOT NULL,
      \`code\` varchar(32) NOT NULL,
      \`name\` varchar(128) NOT NULL,
      \`subtitle\` varchar(255) NULL,
      \`categoryId\` varchar(36) NOT NULL,
      \`pricingMode\` varchar(16) NOT NULL DEFAULT 'QUOTE_ONLY',
      \`priceCents\` int unsigned NULL,
      \`material\` varchar(128) NULL,
      \`description\` text NULL,
      \`careGuide\` text NULL,
      \`measurementTemplateId\` varchar(36) NULL,
      \`sortOrder\` int NOT NULL DEFAULT 0,
      \`status\` varchar(16) NOT NULL DEFAULT 'DRAFT',
      \`createdById\` varchar(36) NULL,
      \`publishedAt\` datetime NULL,
      \`version\` int NOT NULL DEFAULT 1,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`UQ_products_code\` (\`code\`),
      INDEX \`IDX_products_categoryId\` (\`categoryId\`),
      INDEX \`IDX_products_status\` (\`status\`),
      INDEX \`IDX_products_measurementTemplateId\` (\`measurementTemplateId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`product_media\` (
      \`id\` varchar(36) NOT NULL,
      \`productId\` varchar(36) NOT NULL,
      \`role\` varchar(20) NOT NULL DEFAULT 'DETAIL',
      \`storageKey\` varchar(255) NOT NULL,
      \`url\` varchar(512) NOT NULL,
      \`width\` int NOT NULL DEFAULT 0,
      \`height\` int NOT NULL DEFAULT 0,
      \`bytes\` int unsigned NOT NULL DEFAULT 0,
      \`sortOrder\` int NOT NULL DEFAULT 0,
      \`alt\` varchar(255) NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      INDEX \`IDX_product_media_productId\` (\`productId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`banners\` (
      \`id\` varchar(36) NOT NULL,
      \`title\` varchar(128) NOT NULL,
      \`imageUrl\` varchar(512) NOT NULL,
      \`storageKey\` varchar(255) NULL,
      \`linkType\` varchar(16) NOT NULL DEFAULT 'NONE',
      \`linkValue\` varchar(255) NULL,
      \`sortOrder\` int NOT NULL DEFAULT 0,
      \`status\` varchar(16) NOT NULL DEFAULT 'ACTIVE',
      \`startAt\` datetime NULL,
      \`endAt\` datetime NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      INDEX \`IDX_banners_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`customization_requests\` (
      \`id\` varchar(36) NOT NULL,
      \`requestNo\` varchar(32) NOT NULL,
      \`customerId\` varchar(36) NOT NULL,
      \`productId\` varchar(36) NOT NULL,
      \`productSnapshot\` json NOT NULL,
      \`templateId\` varchar(36) NOT NULL,
      \`templateName\` varchar(128) NOT NULL,
      \`templateVersion\` int NOT NULL DEFAULT 1,
      \`measurementSnapshot\` json NOT NULL,
      \`contact\` json NOT NULL,
      \`remark\` varchar(512) NULL,
      \`status\` varchar(20) NOT NULL DEFAULT 'PENDING_REVIEW',
      \`submitId\` varchar(64) NOT NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`UQ_customization_requests_requestNo\` (\`requestNo\`),
      UNIQUE INDEX \`UQ_customization_requests_submitId\` (\`submitId\`),
      INDEX \`IDX_customization_requests_customerId\` (\`customerId\`),
      INDEX \`IDX_customization_requests_productId\` (\`productId\`),
      INDEX \`IDX_customization_requests_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`quotes\` (
      \`id\` varchar(36) NOT NULL,
      \`requestId\` varchar(36) NOT NULL,
      \`version\` int NOT NULL,
      \`status\` varchar(16) NOT NULL DEFAULT 'ACTIVE',
      \`amountCents\` int unsigned NOT NULL,
      \`freightCents\` int unsigned NOT NULL DEFAULT 0,
      \`currency\` varchar(8) NOT NULL DEFAULT 'CNY',
      \`productionDays\` int NOT NULL DEFAULT 0,
      \`validUntil\` datetime NULL,
      \`note\` text NULL,
      \`productSnapshot\` json NOT NULL,
      \`measurementSnapshot\` json NOT NULL,
      \`createdById\` varchar(36) NOT NULL,
      \`createdByName\` varchar(64) NULL,
      \`confirmedAt\` datetime NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      INDEX \`IDX_quotes_requestId\` (\`requestId\`),
      INDEX \`IDX_quotes_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`orders\` (
      \`id\` varchar(36) NOT NULL,
      \`orderNo\` varchar(32) NOT NULL,
      \`requestId\` varchar(36) NOT NULL,
      \`quoteId\` varchar(36) NOT NULL,
      \`quoteVersion\` int NOT NULL,
      \`status\` varchar(16) NOT NULL DEFAULT 'CONFIRMED',
      \`productSnapshot\` json NOT NULL,
      \`measurementSnapshot\` json NOT NULL,
      \`contact\` json NOT NULL,
      \`remark\` varchar(512) NULL,
      \`amountCents\` int unsigned NOT NULL,
      \`freightCents\` int unsigned NOT NULL DEFAULT 0,
      \`totalCents\` int unsigned NOT NULL,
      \`currency\` varchar(8) NOT NULL DEFAULT 'CNY',
      \`productionDays\` int NOT NULL DEFAULT 0,
      \`carrier\` varchar(64) NULL,
      \`trackingNo\` varchar(64) NULL,
      \`shippedAt\` datetime NULL,
      \`completedAt\` datetime NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`UQ_orders_orderNo\` (\`orderNo\`),
      INDEX \`IDX_orders_requestId\` (\`requestId\`),
      INDEX \`IDX_orders_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`order_events\` (
      \`id\` varchar(36) NOT NULL,
      \`orderId\` varchar(36) NOT NULL,
      \`fromStatus\` varchar(16) NULL,
      \`toStatus\` varchar(16) NOT NULL,
      \`operatorId\` varchar(36) NULL,
      \`operatorName\` varchar(64) NULL,
      \`note\` varchar(512) NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      INDEX \`IDX_order_events_orderId\` (\`orderId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`payment_records\` (
      \`id\` varchar(36) NOT NULL,
      \`orderId\` varchar(36) NOT NULL,
      \`provider\` varchar(16) NOT NULL DEFAULT 'DISABLED',
      \`status\` varchar(20) NOT NULL DEFAULT 'DISABLED',
      \`amountCents\` int unsigned NOT NULL,
      \`idempotencyKey\` varchar(64) NOT NULL,
      \`externalTradeId\` varchar(64) NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`UQ_payment_records_idempotencyKey\` (\`idempotencyKey\`),
      INDEX \`IDX_payment_records_orderId\` (\`orderId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE \`audit_logs\` (
      \`id\` varchar(36) NOT NULL,
      \`actorId\` varchar(36) NULL,
      \`actorName\` varchar(64) NULL,
      \`actorRole\` varchar(16) NULL,
      \`action\` varchar(64) NOT NULL,
      \`targetType\` varchar(32) NOT NULL,
      \`targetId\` varchar(64) NULL,
      \`before\` json NULL,
      \`after\` json NULL,
      \`ip\` varchar(64) NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      INDEX \`IDX_audit_logs_actorId\` (\`actorId\`),
      INDEX \`IDX_audit_logs_action\` (\`action\`),
      INDEX \`IDX_audit_logs_targetType\` (\`targetType\`),
      INDEX \`IDX_audit_logs_targetId\` (\`targetId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'audit_logs',
      'payment_records',
      'order_events',
      'orders',
      'quotes',
      'customization_requests',
      'banners',
      'product_media',
      'products',
      'measurement_templates',
      'categories',
      'customers',
      'admin_users',
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
  }
}
