import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 给图文说明页补上行版本列。
 *
 * 背景：
 * 图文说明页是**顾客直接看到**的内容（量体指南 / 洗护说明 / 材质说明），
 * 后台更新此前是「先读后写 → save(整行实体)」。
 * 两个管理员同时编辑同一页时，后写者拿着陈旧快照写回，
 * 会把先写者写好的**整套说明**静默回退，而调用方拿到的是 200，没有任何提示。
 *
 * 处理方式与本仓库既有做法一致（见轮播 / 量体模板 / 定制申请）：
 * **条件更新** `UPDATE ... WHERE id = ? AND version = ?`，
 * 影响行数不为 1 就说明期间被别人改过，应用层翻译成 409，而不是覆盖。
 *
 * 纯新增：存量行统一取默认值 1，不改变任何业务数据。
 */
export class AddGuideVersionColumn1785000006000 implements MigrationInterface {
  name = 'AddGuideVersionColumn1785000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`guide_pages\` ADD COLUMN \`version\` int NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`guide_pages\` DROP COLUMN \`version\``);
  }
}
