import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 并发一致性约束。
 *
 * 背景（本轮可靠性审计）：
 * 此前三处「唯一性」只靠**应用层先查后写**保证，在并发下必然失效：
 *
 * 1. `orders.requestId` —— 建单前先查「该申请是否已有订单」，
 *    两个店员同时点「创建订单」会双双通过检查 → 同一申请产生**两张订单**，
 *    顾客看到两条订单、商家还要人工对账。
 * 2. `quotes` 的「同一申请同时只有一个 ACTIVE 版本」—— 报价时先查旧版本、
 *    把 ACTIVE 置为 SUPERSEDED、再插入新的。两个并发报价会各插一条 ACTIVE，
 *    且版本号可能相同 → 顾客端出现两份「当前报价」。
 * 3. `quotes` 的「同一申请同一版本只有一条」—— 版本号是「现有最大版本 +1」，
 *    并发下会算出相同版本号。
 *
 * 这里把三条约束下沉到**数据库**：
 * - 唯一索引由数据库裁决，并发写入时后者必然失败，而不是静默产生重复；
 * - 应用层再把重复键错误翻译成 409 冲突，让商家看到「状态冲突」而不是 500。
 *
 * 迁移前先做去重，保证已有数据能通过约束：
 * - 同一申请多个 ACTIVE 报价 → 保留版本最高的，其余置 SUPERSEDED；
 * - 同申请同版本重复 → 保留最新创建的，其余置 SUPERSEDED（不删除，保留历史）。
 */
export class AddConcurrencyConstraints1785000002000 implements MigrationInterface {
  name = 'AddConcurrencyConstraints1785000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 去重：同一申请只保留一个 ACTIVE 报价
    await queryRunner.query(
      `UPDATE \`quotes\` SET \`status\` = 'SUPERSEDED' WHERE \`id\` IN (
         SELECT \`id\` FROM (
           SELECT \`id\`,
                  ROW_NUMBER() OVER (PARTITION BY \`requestId\` ORDER BY \`version\` DESC, \`createdAt\` DESC, \`id\` DESC) AS rn
           FROM \`quotes\` WHERE \`status\` = 'ACTIVE'
         ) t WHERE t.rn > 1
       )`,
    );

    // 2) 去重：同申请同版本只保留最新一条
    await queryRunner.query(
      `UPDATE \`quotes\` SET \`status\` = 'SUPERSEDED' WHERE \`id\` IN (
         SELECT \`id\` FROM (
           SELECT \`id\`,
                  ROW_NUMBER() OVER (PARTITION BY \`requestId\`, \`version\` ORDER BY \`createdAt\` DESC, \`id\` DESC) AS rn
           FROM \`quotes\`
         ) t WHERE t.rn > 1
       )`,
    );

    // 3) 一个定制申请只能有一张订单
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP INDEX \`IDX_orders_requestId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD UNIQUE INDEX \`UQ_orders_requestId\` (\`requestId\`)`,
    );

    // 4) 同一申请的同一版本号只有一条报价
    await queryRunner.query(
      `ALTER TABLE \`quotes\` ADD UNIQUE INDEX \`UQ_quotes_requestId_version\` (\`requestId\`, \`version\`)`,
    );

    // 5) 同一申请同时只有一个 ACTIVE 报价
    //    MySQL 不支持部分唯一索引，用生成列实现：
    //    非 ACTIVE 时取 NULL —— 唯一索引允许多个 NULL，因此只有 ACTIVE 那条参与约束。
    await queryRunner.query(
      `ALTER TABLE \`quotes\`
         ADD COLUMN \`activeRequestId\` varchar(36)
         GENERATED ALWAYS AS (CASE WHEN \`status\` = 'ACTIVE' THEN \`requestId\` ELSE NULL END) STORED`,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotes\` ADD UNIQUE INDEX \`UQ_quotes_activeRequestId\` (\`activeRequestId\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`quotes\` DROP INDEX \`UQ_quotes_activeRequestId\``,
    );
    await queryRunner.query(`ALTER TABLE \`quotes\` DROP COLUMN \`activeRequestId\``);
    await queryRunner.query(
      `ALTER TABLE \`quotes\` DROP INDEX \`UQ_quotes_requestId_version\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP INDEX \`UQ_orders_requestId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD INDEX \`IDX_orders_requestId\` (\`requestId\`)`,
    );
  }
}
