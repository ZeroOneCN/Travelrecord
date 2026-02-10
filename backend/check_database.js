const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'database', 'travel_expense.db');

console.log('正在连接数据库:', dbPath);

// 连接数据库
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ 数据库连接失败:', err.message);
    return;
  }
  
  console.log('✅ 成功连接到SQLite数据库');
  
  // 查看所有表
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error('❌ 查询表失败:', err.message);
      db.close();
      return;
    }
    
    console.log('\n📊 数据库中的表:');
    tables.forEach((table, index) => {
      console.log(`${index + 1}. ${table.name}`);
    });
    
    // 查看每个表的数据
    if (tables.length > 0) {
      console.log('\n📈 表数据预览:');
      checkTableData(tables, 0);
    } else {
      console.log('\n⚠️  数据库中没有表');
      db.close();
    }
  });
});

function checkTableData(tables, index) {
  if (index >= tables.length) {
    console.log('\n✅ 数据库检查完成');
    db.close();
    return;
  }
  
  const tableName = tables[index].name;
  
  // 查看表结构
  db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
    if (err) {
      console.error(`❌ 查询表 ${tableName} 结构失败:`, err.message);
      checkTableData(tables, index + 1);
      return;
    }
    
    console.log(`\n📋 表 ${tableName} 结构:`);
    columns.forEach(col => {
      console.log(`   ${col.name} (${col.type})${col.pk ? ' PRIMARY KEY' : ''}`);
    });
    
    // 查看表数据（限制前5条）
    db.all(`SELECT * FROM ${tableName} LIMIT 5`, (err, rows) => {
      if (err) {
        console.error(`❌ 查询表 ${tableName} 数据失败:`, err.message);
        checkTableData(tables, index + 1);
        return;
      }
      
      console.log(`\n📝 表 ${tableName} 数据 (前${rows.length}条):`);
      if (rows.length > 0) {
        rows.forEach((row, rowIndex) => {
          console.log(`   ${rowIndex + 1}. ${JSON.stringify(row)}`);
        });
      } else {
        console.log('   暂无数据');
      }
      
      checkTableData(tables, index + 1);
    });
  });
}