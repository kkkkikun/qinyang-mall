import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 给轮播与量体模板补上乐观锁（行版本）列。
 *
 * 背景：
 * 这两张表此前**没有**版本列，管理端更新是「先读后写 → save(整行实体)」。
 * 两个管理员同时编辑同一条轮播/同一份模板时，后写者拿着**陈旧快照**写回，
 * 会把先写者的修改（轮播文案、图片、投放时间；模板的量体字段）**静默覆盖**，
 * 而调用方拿到的是 200，没有任何提示。
 *
 * 处理方式与本仓库既有做法一致（见 `customization.service.ts` 的申请审核、
 * `products` 实体的 `@VersionColumn()`）：状态流转一律**条件更新**，
 * `UPDATE ... WHERE id = ? AND version = ?`，影响行数不为 1 就说明期间被别人改过，
 * 应用层翻译成 409，而不是覆盖。
 *
 * 列名说明（重要）：
 * - `banners` 此前没有任何 version 列，直接用 `version`；
 * - `measurement_templates` **已有**一个 `version` 列，但它是**业务版本号**
 *   （模板是第几个发布版本，由发布动作递增，并参与唯一索引
 *   `UQ_measurement_templates_code_version`），语义与行版本完全不同：
 *   编辑草稿不应该改变发布版本号。因此行版本另起一列 `rowVersion`，
 *   避免与既有唯一索引语义冲突。
 *
 * 两列都是纯新增：存量行统一取默认值 1，不改变任何业务数据。
 */
export class AddVersionColumns1785000005000 implements MigrationInterface {
  name = 'AddVersionColumns1785000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 轮播：新增行版本列（此前完全没有）
    await queryRunner.query(`ALTER TABLE \`banners\` ADD COLUMN \`version\` int NOT NULL DEFAULT 1`);

    // 2) 量体模板：行版本单独用 rowVersion，避免与业务列 version 抢同一个名字
    await queryRunner.query(
      `ALTER TABLE \`measurement_templates\` ADD COLUMN \`rowVersion\` int NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`measurement_templates\` DROP COLUMN \`rowVersion\``);
    await queryRunner.query(`ALTER TABLE \`banners\` DROP COLUMN \`version\``);
  }
}
