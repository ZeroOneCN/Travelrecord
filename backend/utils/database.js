const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'database', 'travel_expense.db');
    this.init();
  }

  init() {
    // 确保数据库目录存在
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('数据库连接失败:', err.message);
      } else {
        this.db.run('PRAGMA foreign_keys = ON');
        console.log('✅ 成功连接到SQLite数据库');
        this.createTables();
      }
    });
  }

  createTables() {
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // 执行SQL文件中的所有语句
      this.db.exec(schema, (err) => {
        if (err) {
          console.error('创建表失败:', err.message);
        } else {
          console.log('✅ 数据库表结构初始化完成');
          this.migrate().catch((migrateErr) => {
            console.error('数据库迁移失败:', migrateErr.message);
          });
        }
      });
    } else {
      console.warn('⚠️  未找到schema.sql文件，跳过表创建');
    }
  }

  async migrate() {
    const tables = await this.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_items'"
    );
    if (!tables?.length) {
      return;
    }

    await this.ensurePaymentChannelsTable();
    await this.ensureBookPreviewsTable();
    await this.ensureExpenseAttachmentsTable();
    await this.migrateExpenseItemsPayChannel();
    await this.normalizePayChannelValues();

    const columns = await this.query('PRAGMA table_info(expense_items)');
    const columnNames = new Set((columns || []).map((col) => col.name));

    if (!columnNames.has('discount_amount')) {
      await this.run('ALTER TABLE expense_items ADD COLUMN discount_amount DECIMAL(10, 2) DEFAULT 0');
    }
    if (!columnNames.has('discount_note')) {
      await this.run('ALTER TABLE expense_items ADD COLUMN discount_note TEXT');
    }

    const bookColumns = await this.query('PRAGMA table_info(travel_books)');
    const bookColumnNames = new Set((bookColumns || []).map((col) => col.name));
    if (!bookColumnNames.has('summary')) {
      await this.run('ALTER TABLE travel_books ADD COLUMN summary TEXT');
    }
  }

  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async ensurePaymentChannelsTable() {
    await this.run(
      `CREATE TABLE IF NOT EXISTS payment_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        value VARCHAR(50) NOT NULL,
        label VARCHAR(100) NOT NULL,
        created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+8 hours')),
        UNIQUE(user_id, value),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );
  }

  async ensureBookPreviewsTable() {
    await this.run(
      `CREATE TABLE IF NOT EXISTS book_previews (
        book_id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        enabled_until DATETIME NOT NULL,
        show_receipts INTEGER DEFAULT 0,
        secret TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+8 hours')),
        FOREIGN KEY (book_id) REFERENCES travel_books(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );
    await this.run('CREATE INDEX IF NOT EXISTS idx_book_previews_user_id ON book_previews(user_id)');

    const columns = await this.query('PRAGMA table_info(book_previews)');
    const columnNames = new Set((columns || []).map((col) => col.name));
    if (!columnNames.has('show_receipts')) {
      await this.run('ALTER TABLE book_previews ADD COLUMN show_receipts INTEGER DEFAULT 0');
    }
    if (!columnNames.has('secret')) {
      await this.run('ALTER TABLE book_previews ADD COLUMN secret TEXT');
    }
  }

  async ensureExpenseAttachmentsTable() {
    await this.run(
      `CREATE TABLE IF NOT EXISTS expense_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT,
        size_bytes INTEGER,
        created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
        FOREIGN KEY (expense_id) REFERENCES expense_items(id) ON DELETE CASCADE
      )`
    );
    await this.run('CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense_id ON expense_attachments(expense_id)');

    const columns = await this.query('PRAGMA table_info(expense_attachments)');
    const columnNames = new Set((columns || []).map((col) => col.name));
    if (!columnNames.has('file_name')) {
      await this.run('ALTER TABLE expense_attachments ADD COLUMN file_name TEXT');
    }
    if (!columnNames.has('original_name')) {
      await this.run('ALTER TABLE expense_attachments ADD COLUMN original_name TEXT');
    }
    if (!columnNames.has('mime_type')) {
      await this.run('ALTER TABLE expense_attachments ADD COLUMN mime_type TEXT');
    }
    if (!columnNames.has('size_bytes')) {
      await this.run('ALTER TABLE expense_attachments ADD COLUMN size_bytes INTEGER');
    }
    if (!columnNames.has('created_at')) {
      await this.run("ALTER TABLE expense_attachments ADD COLUMN created_at DATETIME DEFAULT (datetime('now', '+8 hours'))");
    }
  }

  async normalizePayChannelValues() {
    const mappings = [
      { from: 'MEITUAN', to: 'MEITUAN_MONTHLY' },
      { from: 'DOUYIN', to: 'DOUYIN_MONTHLY' }
    ];

    await this.run('BEGIN');
    try {
      for (const mapping of mappings) {
        await this.run(
          'UPDATE expense_items SET pay_channel = ? WHERE UPPER(TRIM(pay_channel)) = ?',
          [mapping.to, mapping.from]
        );

        await this.run(
          `DELETE FROM payment_channels
           WHERE value = ?
             AND user_id IN (SELECT user_id FROM payment_channels WHERE value = ?)`,
          [mapping.from, mapping.to]
        );

        await this.run('UPDATE payment_channels SET value = ? WHERE value = ?', [mapping.to, mapping.from]);
      }
      await this.run('COMMIT');
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  async migrateExpenseItemsPayChannel() {
    const rows = await this.query(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='expense_items'"
    );
    const createSql = rows?.[0]?.sql ? String(rows[0].sql) : '';
    if (!createSql || !/CHECK\s*\(\s*pay_channel\s+IN\s*\(/i.test(createSql)) {
      return;
    }

    const safeCreateSql = createSql.replace(
      /pay_channel\s+[^,]*CHECK\s*\(\s*pay_channel\s+IN\s*\([^)]+\)\s*\)/i,
      'pay_channel VARCHAR(50)'
    );

    await this.run('BEGIN');
    try {
      await this.run('ALTER TABLE expense_items RENAME TO expense_items_old');
      await this.run(safeCreateSql);

      const oldColumns = await this.query('PRAGMA table_info(expense_items_old)');
      const newColumns = await this.query('PRAGMA table_info(expense_items)');
      const newColumnNames = new Set((newColumns || []).map((col) => col.name));
      const commonColumns = (oldColumns || [])
        .map((col) => col.name)
        .filter((name) => newColumnNames.has(name));

      if (commonColumns.length) {
        const columnList = commonColumns.map((name) => `"${name}"`).join(', ');
        await this.run(
          `INSERT INTO expense_items (${columnList}) SELECT ${columnList} FROM expense_items_old`
        );
      }

      await this.run('DROP TABLE expense_items_old');

      const indexNames = [
        'idx_expense_items_book_id',
        'idx_expense_items_date',
        'idx_expense_items_category',
        'idx_expense_items_pay_channel'
      ];
      for (const indexName of indexNames) {
        await this.run(`DROP INDEX IF EXISTS ${indexName}`);
      }
      await this.run('CREATE INDEX IF NOT EXISTS idx_expense_items_book_id ON expense_items(book_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_expense_items_date ON expense_items(date)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_expense_items_category ON expense_items(category)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_expense_items_pay_channel ON expense_items(pay_channel)');

      await this.run('COMMIT');
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  getDB() {
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('关闭数据库连接失败:', err.message);
        } else {
          console.log('✅ 数据库连接已关闭');
        }
      });
    }
  }

  // 通用查询方法
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 执行单条SQL语句
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }
}

// 创建全局数据库实例
const database = new Database();

// 优雅关闭
process.on('SIGINT', () => {
  database.close();
  process.exit(0);
});

module.exports = database;
