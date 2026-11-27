import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 量体模板的版本唯一性与审计日志索引。
 *
 * 背景（本轮数据一致性审计）：
 *
 * 1. `measurement_templates` 没有 `(code, version)` 唯一约束，
 *    而版本号是「现有最大版本 + 1」算出来的 ——
 *    两个店员同时点「发布」，会算出**同一个版本号**，
 *    于是出现两条同版本记录，甚至同时有两条 ACTIVE。
 *    顾客端按 `version DESC` 取当前模板，**胜者不确定**：
 *    同一件衣服可能按 A 模板的量体表提交、按 B 模板的量体表制作。
 * 2. 「同一模板 code 同时只有一个 ACTIVE」此前只靠应用层
 *    `archiveActive()` 先归档再新建 —— 两步之间失败，
 *    就会**一个 ACTIVE 都不剩**，顾客端立刻无法提交定制申请。
 * 3. `audit_logs` 没有 `createdAt` 索引，而审计列表是按时间倒序排的
 *    → 每次翻页都要全表扫描 + filesort。
 *
 * 处理方式与报价一致（见 AddConcurrencyConstraints）：
 * - 唯一性下沉到数据库，用**生成列**实现「同一 code 只有一个 ACTIVE」
 *   （MySQL 不支持部分唯一索引；唯一索引允许多个 NULL，
 *   因此非 ACTIVE 的行不参与约束）；
 * - 迁移前先去重，**不删历史**；
 * - 补 `audit_logs.createdAt` 索引。
 */
export class AddTemplateConstraints1785000003000 implements MigrationInterface {
  name = 'AddTemplateConstraints1785000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 去重：同一 code 只保留一个 ACTIVE（版本最高的）
    await queryRunner.query(
      `UPDATE \`measurement_templates\` SET \`status\` = 'ARCHIVED' WHERE \`id\` IN (
         SELECT \`id\` FROM (
           SELECT \`id\`,
                  ROW_NUMBER() OVER (PARTITION BY \`code\` ORDER BY \`version\` DESC, \`createdAt\` DESC, \`id\` DESC) AS rn
           FROM \`measurement_templates\` WHERE \`status\` = 'ACTIVE'
         ) t WHERE t.rn > 1
       )`,
    );

    // 2) 去重：同 code 同版本只保留最新一条（其余归档，不删除）
    await queryRunner.query(
      `UPDATE \`measurement_templates\` SET \`status\` = 'ARCHIVED' WHERE \`id\` IN (
         SELECT \`id\` FROM (
           SELECT \`id\`,
                  ROW_NUMBER() OVER (PARTITION BY \`code\`, \`version\` ORDER BY \`createdAt\` DESC, \`id\` DESC) AS rn
           FROM \`measurement_templates\`
         ) t WHERE t.rn > 1
       )`,
    );

    // 3) 同一模板 code 的同一版本号只有一条
    await queryRunner.query(
      `ALTER TABLE \`measurement_templates\`
         ADD UNIQUE INDEX \`UQ_measurement_templates_code_version\` (\`code\`, \`version\`)`,
    );

    // 4) 同一模板 code 同时只有一个 ACTIVE（生成列 + 唯一索引）
    await queryRunner.query(
      `ALTER TABLE \`measurement_templates\`
         ADD COLUMN \`activeCode\` varchar(64)
         GENERATED ALWAYS AS (CASE WHEN \`status\` = 'ACTIVE' THEN \`code\` ELSE NULL END) STORED`,
    );
    await queryRunner.query(
      `ALTER TABLE \`measurement_templates\`
         ADD UNIQUE INDEX \`UQ_measurement_templates_activeCode\` (\`activeCode\`)`,
    );

    // 5) 审计列表按时间倒序：补索引
    await queryRunner.query(
      `ALTER TABLE \`audit_logs\` ADD INDEX \`IDX_audit_logs_createdAt\` (\`createdAt\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`audit_logs\` DROP INDEX \`IDX_audit_logs_createdAt\``);
    await queryRunner.query(`ALTER TABLE \`measurement_templates\` DROP INDEX \`UQ_measurement_templates_activeCode\``);
    await queryRunner.query(`ALTER TABLE \`measurement_templates\` DROP COLUMN \`activeCode\``);
    await queryRunner.query(`ALTER TABLE \`measurement_templates\` DROP INDEX \`UQ_measurement_templates_code_version\``);
  }
}
