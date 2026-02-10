const jwt = require('jsonwebtoken');
const database = require('../utils/database');

// JWT认证中间件
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: '访问被拒绝，请提供有效的token' 
      });
    }

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 检查用户是否存在
    const user = await database.query(
      'SELECT id, email, nickname, role FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (user.length === 0) {
      return res.status(401).json({ 
        error: '用户不存在或token无效' 
      });
    }

    // 将用户信息添加到请求对象中
    req.user = user[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'token已过期，请重新登录' 
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: '无效的token' 
      });
    }
    
    console.error('认证中间件错误:', error);
    res.status(500).json({ 
      error: '服务器内部错误' 
    });
  }
};

const requireRoles = (...roles) => {
  const allowed = new Set((roles || []).map((role) => String(role)));
  return (req, res, next) => {
    const role = String(req.user?.role || '');
    if (!role || !allowed.has(role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
};

// 生成JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // token有效期7天
  );
};

const generatePreviewToken = ({ userId, bookId, secret }) => {
  return jwt.sign(
    { type: 'preview', userId, bookId, secret },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

const verifyPreviewToken = (token, bookId) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (!decoded || decoded.type !== 'preview') {
    throw new Error('invalid preview token');
  }
  if (String(decoded.bookId) !== String(bookId)) {
    throw new Error('preview token mismatch');
  }
  return decoded;
};

module.exports = {
  authenticateToken,
  requireRoles,
  generateToken,
  generatePreviewToken,
  verifyPreviewToken
};
