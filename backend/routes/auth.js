const express = require('express');
const bcrypt = require('bcryptjs');
const database = require('../utils/database');
const { authenticateToken, requireRoles, generateToken } = require('../middleware/auth');

const router = express.Router();

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    // 验证输入
    if (!email || !password) {
      return res.status(400).json({
        error: '邮箱和密码不能为空'
      });
    }

    // 检查邮箱是否已存在
    const existingUser = await database.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({
        error: '该邮箱已被注册'
      });
    }

    // 加密密码
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 创建用户
    const result = await database.run(
      `INSERT INTO users (email, password_hash, nickname, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      [email, passwordHash, nickname || null]
    );

    // 生成token
    const token = generateToken(result.id);

    res.status(201).json({
      message: '注册成功',
      data: {
        user: {
          id: result.id,
          email,
          nickname: nickname || '',
          role: 'user'
        },
        token
      }
    });

  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      error: '注册失败，请稍后重试'
    });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 验证输入
    if (!email || !password) {
      return res.status(400).json({
        error: '邮箱和密码不能为空'
      });
    }

    // 查找用户
    const users = await database.query(
      'SELECT id, email, password_hash, nickname, role FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: '邮箱或密码错误'
      });
    }

    const user = users[0];

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: '邮箱或密码错误'
      });
    }

    // 生成token
    const token = generateToken(user.id);

    res.json({
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname || '',
          role: user.role || 'user'
        },
        token
      }
    });

  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      error: '登录失败，请稍后重试'
    });
  }
});

// 获取当前用户信息
router.get('/me', authenticateToken, async (req, res) => {
  res.json({ message: '获取用户信息成功', data: req.user });
});

router.put('/me/nickname', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const nickname = String(req.body?.nickname ?? '').trim();

    if (!nickname) {
      return res.status(400).json({ error: '昵称不能为空' });
    }
    if (nickname.length > 30) {
      return res.status(400).json({ error: '昵称长度不能超过30个字符' });
    }

    await database.run(
      `UPDATE users
       SET nickname = ?, updated_at = datetime('now', '+8 hours')
       WHERE id = ?`,
      [nickname, userId]
    );

    const rows = await database.query(
      'SELECT id, email, nickname, role FROM users WHERE id = ?',
      [userId]
    );
    if (!rows?.length) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ message: '修改昵称成功', data: rows[0] });
  } catch (error) {
    console.error('修改昵称错误:', error);
    res.status(500).json({ error: '修改昵称失败，请稍后重试' });
  }
});

router.get('/admin/ping', authenticateToken, requireRoles('admin'), async (req, res) => {
  res.json({ message: 'admin ok' });
});

router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentPassword = String(req.body?.currentPassword || '').trim();
    const newPassword = String(req.body?.newPassword || '').trim();

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '当前密码和新密码不能为空' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6位' });
    }

    const rows = await database.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!rows?.length) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!ok) {
      return res.status(400).json({ error: '当前密码错误' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    await database.run(
      `UPDATE users
       SET password_hash = ?, updated_at = datetime('now', '+8 hours')
       WHERE id = ?`,
      [passwordHash, userId]
    );

    res.json({ message: '修改密码成功' });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({ error: '修改密码失败，请稍后重试' });
  }
});

module.exports = router;
