const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// 加载环境变量
dotenv.config({ override: true });

// 初始化数据库
require('./utils/database');

const app = express();
const PORT = process.env.PORT || 9505;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 确保数据库目录存在
const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 路由导入
const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const expenseRoutes = require('./routes/expenses');
const { authenticateToken } = require('./middleware/auth');

// 使用路由
app.use('/api', (req, res, next) => {
  const pathname = req.path || '';
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/health') ||
    pathname.startsWith('/preview') ||
    pathname.startsWith('/books/preview') ||
    pathname.startsWith('/expense-attachments')
  ) {
    next();
    return;
  }
  authenticateToken(req, res, next);
});
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api', expenseRoutes);

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: '出行花销记录API服务正常运行',
    timestamp: new Date().toISOString()
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ 
    error: '接口不存在',
    path: req.originalUrl 
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ 
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : '内部服务器错误'
  });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚗 出行花销记录后端服务启动成功！`);
  console.log(`📍 服务地址: http://0.0.0.0:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`🌱 环境: ${process.env.NODE_ENV}`);
});

module.exports = app;
