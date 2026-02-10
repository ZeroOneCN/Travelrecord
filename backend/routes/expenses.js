const express = require('express');
const database = require('../utils/database');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const attachmentsDir = path.join(__dirname, '..', 'uploads', 'expense_attachments');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const inferImageExtension = (mimeType, originalName) => {
  const nameExt = String(path.extname(originalName || '') || '').toLowerCase();
  const safeExt = nameExt && /^[.][a-z0-9]{1,10}$/.test(nameExt) ? nameExt : '';
  const mime = String(mimeType || '').toLowerCase();
  if (safeExt) {
    return safeExt;
  }
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '.png';
};

const normalizePayChannelValue = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const upper = raw.toUpperCase();
  if (upper === 'MEITUAN') {
    return 'MEITUAN_MONTHLY';
  }
  if (upper === 'DOUYIN') {
    return 'DOUYIN_MONTHLY';
  }
  return upper;
};

const builtInPayChannels = new Set([
  'ALIPAY',
  'WECHAT',
  'UNIONPAY',
  'CASH',
  'DOUYIN_MONTHLY',
  'MEITUAN_MONTHLY',
  'OTHER'
]);

const getPayChannels = async (userId) => {
  try {
    const channels = await database.query(
      'SELECT id, value, label FROM payment_channels WHERE user_id = ? ORDER BY id ASC',
      [userId]
    );
    return Array.isArray(channels) ? channels : [];
  } catch (error) {
    return [];
  }
};

const isPayChannelAllowed = async (userId, value) => {
  const normalized = normalizePayChannelValue(value);
  if (normalized && builtInPayChannels.has(normalized)) {
    return true;
  }
  const channels = await getPayChannels(userId);
  return channels.some((item) => String(item.value) === String(normalized));
};

router.get('/expense-attachments/:fileName', async (req, res) => {
  try {
    const fileName = String(req.params?.fileName || '').trim();
    if (!/^[a-f0-9]{32}(?:\.[a-z0-9]{1,10})$/i.test(fileName)) {
      return res.status(400).json({ error: '文件名不合法' });
    }
    const filePath = path.join(attachmentsDir, fileName);
    const normalized = path.normalize(filePath);
    const base = path.normalize(attachmentsDir + path.sep);
    if (!normalized.startsWith(base)) {
      return res.status(400).json({ error: '文件路径不合法' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    const rows = await database.query(
      'SELECT mime_type as mimeType FROM expense_attachments WHERE file_name = ? LIMIT 1',
      [fileName]
    );
    const mimeType = String(rows?.[0]?.mimeType || '').trim();
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    res.sendFile(filePath);
  } catch (error) {
    console.error('获取附件文件错误:', error);
    res.status(500).json({ error: '获取附件文件失败' });
  }
});

// 获取账本的所有花销记录
router.get('/books/:bookId/expenses', async (req, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.user.id;
    const { page = 1, pageSize = 20, category, pay_channel, date_from, date_to, keyword } = req.query;
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNumber = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    // 验证账本权限
    const book = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [bookId, userId]
    );

    if (book.length === 0) {
      return res.status(404).json({
        error: '账本不存在或无权访问'
      });
    }

    // 构建查询条件
    let whereConditions = ['book_id = ?'];
    let queryParams = [bookId];

    if (category) {
      whereConditions.push('category = ?');
      queryParams.push(category);
    }

    const normalizedQueryPayChannel = normalizePayChannelValue(pay_channel);
    if (normalizedQueryPayChannel) {
      whereConditions.push('pay_channel = ?');
      queryParams.push(normalizedQueryPayChannel);
    }

    if (date_from) {
      whereConditions.push('date >= ?');
      queryParams.push(date_from);
    }

    if (date_to) {
      whereConditions.push('date <= ?');
      queryParams.push(date_to);
    }

    if (keyword) {
      whereConditions.push('(title LIKE ? OR remark LIKE ? OR vehicle_no LIKE ?)');
      const likeKeyword = `%${keyword}%`;
      queryParams.push(likeKeyword, likeKeyword, likeKeyword);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 获取总数
    const totalResult = await database.query(
      `SELECT COUNT(*) as total FROM expense_items ${whereClause}`,
      queryParams
    );

    const total = totalResult[0].total;

    // 获取分页数据
    const offset = (pageNumber - 1) * pageSizeNumber;
    const expenses = await database.query(
      `SELECT * FROM expense_items 
       ${whereClause} 
       ORDER BY 
         date DESC,
         COALESCE(
           time(CASE 
             WHEN time_range IS NOT NULL AND instr(time_range, '-') > 0 THEN substr(time_range, 1, instr(time_range, '-') - 1) 
             ELSE NULL 
           END),
           '00:00'
         ) DESC,
         id DESC 
       LIMIT ? OFFSET ?`,
      [...queryParams, pageSizeNumber, offset]
    );

    res.json({
      message: '获取花销记录成功',
      data: {
        items: expenses,
        pagination: {
          page: pageNumber,
          pageSize: pageSizeNumber,
          total,
          totalPages: Math.ceil(total / pageSizeNumber)
        }
      }
    });

  } catch (error) {
    console.error('获取花销记录错误:', error);
    res.status(500).json({
      error: '获取花销记录失败'
    });
  }
});

// 创建花销记录
router.post('/books/:bookId/expenses', async (req, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.user.id;
    const {
      date,
      time_range,
      duration_minutes,
      duration_display,
      title,
      amount,
      discount_amount,
      discount_note,
      currency = 'CNY',
      vehicle_no,
      pay_channel,
      category,
      remark
    } = req.body;

    const allowedCategories = new Set(['TRANSPORT', 'HOTEL', 'FOOD', 'TICKET', 'SHOPPING', 'OTHER']);
    const discountAmountValue = discount_amount === null || discount_amount === undefined ? 0 : Number(discount_amount);
    const normalizedPayChannel = normalizePayChannelValue(pay_channel);

    // 验证账本权限
    const book = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [bookId, userId]
    );

    if (book.length === 0) {
      return res.status(404).json({
        error: '账本不存在或无权访问'
      });
    }

    // 验证必填字段
    if (!date || !title || amount === undefined) {
      return res.status(400).json({
        error: '日期、项目描述和金额为必填项'
      });
    }

    if (!Number.isFinite(discountAmountValue) || discountAmountValue < 0) {
      return res.status(400).json({ error: '优惠金额不合法' });
    }
    if (Number.isFinite(Number(amount)) && discountAmountValue > Number(amount)) {
      return res.status(400).json({ error: '优惠金额不能大于金额' });
    }

    if (normalizedPayChannel) {
      const allowed = await isPayChannelAllowed(userId, normalizedPayChannel);
      if (!allowed) {
        return res.status(400).json({ error: '支付渠道不合法' });
      }
    }

    if (category && !allowedCategories.has(category)) {
      return res.status(400).json({ error: '分类不合法' });
    }

    const result = await database.run(
      `INSERT INTO expense_items 
       (book_id, date, time_range, duration_minutes, duration_display, title, amount, discount_amount, discount_note, currency, vehicle_no, pay_channel, category, remark, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))`,
      [
        bookId,
        date,
        time_range || null,
        duration_minutes || null,
        duration_display || null,
        title,
        amount,
        discountAmountValue,
        discount_note || null,
        currency,
        vehicle_no || null,
        normalizedPayChannel,
        category || null,
        remark || null
      ]
    );

    // 获取刚创建的花销记录
    const newExpense = await database.query(
      'SELECT * FROM expense_items WHERE id = ?',
      [result.id]
    );

    res.status(201).json({
      message: '创建花销记录成功',
      data: newExpense[0]
    });

  } catch (error) {
    console.error('创建花销记录错误:', error);
    res.status(500).json({
      error: '创建花销记录失败'
    });
  }
});

// 获取单个花销记录详情
router.get('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const expenses = await database.query(
      `SELECT ei.* FROM expense_items ei
       JOIN travel_books tb ON ei.book_id = tb.id
       WHERE ei.id = ? AND tb.user_id = ?`,
      [id, userId]
    );

    if (expenses.length === 0) {
      return res.status(404).json({
        error: '花销记录不存在或无权访问'
      });
    }

    res.json({
      message: '获取花销记录详情成功',
      data: expenses[0]
    });

  } catch (error) {
    console.error('获取花销记录详情错误:', error);
    res.status(500).json({
      error: '获取花销记录详情失败'
    });
  }
});

// 更新花销记录
router.put('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      date,
      time_range,
      duration_minutes,
      duration_display,
      title,
      amount,
      discount_amount,
      discount_note,
      currency,
      vehicle_no,
      pay_channel,
      category,
      remark
    } = req.body;

    const allowedCategories = new Set(['TRANSPORT', 'HOTEL', 'FOOD', 'TICKET', 'SHOPPING', 'OTHER']);
    const discountAmountValue = discount_amount === null || discount_amount === undefined ? 0 : Number(discount_amount);

    // 验证记录存在和权限
    const existingExpense = await database.query(
      `SELECT ei.id FROM expense_items ei
       JOIN travel_books tb ON ei.book_id = tb.id
       WHERE ei.id = ? AND tb.user_id = ?`,
      [id, userId]
    );

    if (existingExpense.length === 0) {
      return res.status(404).json({
        error: '花销记录不存在或无权访问'
      });
    }

    if (!date || !title || amount === undefined) {
      return res.status(400).json({
        error: '日期、项目描述和金额为必填项'
      });
    }

    if (!Number.isFinite(discountAmountValue) || discountAmountValue < 0) {
      return res.status(400).json({ error: '优惠金额不合法' });
    }
    if (Number.isFinite(Number(amount)) && discountAmountValue > Number(amount)) {
      return res.status(400).json({ error: '优惠金额不能大于金额' });
    }

    const normalizedPayChannel = normalizePayChannelValue(pay_channel);
    if (normalizedPayChannel) {
      const allowed = await isPayChannelAllowed(userId, normalizedPayChannel);
      if (!allowed) {
        return res.status(400).json({ error: '支付渠道不合法' });
      }
    }

    if (category && !allowedCategories.has(category)) {
      return res.status(400).json({ error: '分类不合法' });
    }

    await database.run(
      `UPDATE expense_items 
       SET date = ?, time_range = ?, duration_minutes = ?, duration_display = ?, 
           title = ?, amount = ?, discount_amount = ?, discount_note = ?, currency = ?, vehicle_no = ?, pay_channel = ?, 
           category = ?, remark = ?, updated_at = datetime('now', '+8 hours') 
       WHERE id = ?`,
      [
        date,
        time_range,
        duration_minutes,
        duration_display,
        title,
        amount,
        discountAmountValue,
        discount_note || null,
        currency,
        vehicle_no,
        normalizedPayChannel,
        category,
        remark,
        id
      ]
    );

    // 获取更新后的记录
    const updatedExpense = await database.query(
      'SELECT * FROM expense_items WHERE id = ?',
      [id]
    );

    res.json({
      message: '更新花销记录成功',
      data: updatedExpense[0]
    });

  } catch (error) {
    console.error('更新花销记录错误:', error);
    res.status(500).json({
      error: '更新花销记录失败'
    });
  }
});

// 删除花销记录
router.delete('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 验证记录存在和权限
    const existingExpense = await database.query(
      `SELECT ei.id FROM expense_items ei
       JOIN travel_books tb ON ei.book_id = tb.id
       WHERE ei.id = ? AND tb.user_id = ?`,
      [id, userId]
    );

    if (existingExpense.length === 0) {
      return res.status(404).json({
        error: '花销记录不存在或无权访问'
      });
    }

    const attachments = await database.query(
      'SELECT file_name as fileName FROM expense_attachments WHERE expense_id = ?',
      [id]
    );
    for (const item of attachments || []) {
      const fileName = String(item?.fileName || '').trim();
      if (!fileName) {
        continue;
      }
      const filePath = path.join(attachmentsDir, fileName);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (unlinkError) {
        console.error('删除附件文件失败:', unlinkError);
      }
    }

    await database.run(
      'DELETE FROM expense_items WHERE id = ?',
      [id]
    );

    res.json({
      message: '删除花销记录成功'
    });

  } catch (error) {
    console.error('删除花销记录错误:', error);
    res.status(500).json({
      error: '删除花销记录失败'
    });
  }
});

router.get('/expenses/:id/attachments', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const rows = await database.query(
      `SELECT ei.id FROM expense_items ei
       JOIN travel_books tb ON ei.book_id = tb.id
       WHERE ei.id = ? AND tb.user_id = ?`,
      [id, userId]
    );
    if (!rows?.length) {
      return res.status(404).json({ error: '花销记录不存在或无权访问' });
    }

    const attachments = await database.query(
      `SELECT id, file_name as fileName, original_name as originalName, mime_type as mimeType, size_bytes as sizeBytes, created_at as createdAt
       FROM expense_attachments
       WHERE expense_id = ?
       ORDER BY id ASC`,
      [id]
    );
    const items = (attachments || []).map((item) => ({
      id: item.id,
      file_name: item.fileName,
      original_name: item.originalName || '',
      mime_type: item.mimeType || '',
      size_bytes: item.sizeBytes || 0,
      created_at: item.createdAt,
      url: `/api/expense-attachments/${item.fileName}`
    }));
    res.json({ message: '获取附件成功', data: items });
  } catch (error) {
    console.error('获取附件列表错误:', error);
    res.status(500).json({ error: '获取附件列表失败' });
  }
});

router.post('/expenses/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const file = req.file;
    if (!file?.buffer || !file?.mimetype) {
      return res.status(400).json({ error: '请上传图片文件' });
    }
    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({ error: '仅支持图片附件' });
    }

    const rows = await database.query(
      `SELECT ei.id FROM expense_items ei
       JOIN travel_books tb ON ei.book_id = tb.id
       WHERE ei.id = ? AND tb.user_id = ?`,
      [id, userId]
    );
    if (!rows?.length) {
      return res.status(404).json({ error: '花销记录不存在或无权访问' });
    }

    ensureDir(attachmentsDir);
    const ext = inferImageExtension(mimeType, file.originalname);
    const fileName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const filePath = path.join(attachmentsDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const sizeBytes = Number(file.size || file.buffer.length || 0);
    const result = await database.run(
      `INSERT INTO expense_attachments (expense_id, file_name, original_name, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'))`,
      [id, fileName, file.originalname || null, mimeType, sizeBytes]
    );
    const attachmentRows = await database.query(
      `SELECT id, file_name as fileName, original_name as originalName, mime_type as mimeType, size_bytes as sizeBytes, created_at as createdAt
       FROM expense_attachments
       WHERE id = ?`,
      [result.id]
    );
    const item = attachmentRows?.[0];
    res.status(201).json({
      message: '上传附件成功',
      data: {
        id: item?.id,
        file_name: item?.fileName,
        original_name: item?.originalName || '',
        mime_type: item?.mimeType || '',
        size_bytes: item?.sizeBytes || 0,
        created_at: item?.createdAt,
        url: `/api/expense-attachments/${item?.fileName}`
      }
    });
  } catch (error) {
    console.error('上传附件错误:', error);
    res.status(500).json({ error: '上传附件失败' });
  }
});

router.delete('/expenses/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    const userId = req.user.id;
    const rows = await database.query(
      `SELECT ei.id FROM expense_items ei
       JOIN travel_books tb ON ei.book_id = tb.id
       WHERE ei.id = ? AND tb.user_id = ?`,
      [id, userId]
    );
    if (!rows?.length) {
      return res.status(404).json({ error: '花销记录不存在或无权访问' });
    }

    const attachments = await database.query(
      `SELECT id, file_name as fileName
       FROM expense_attachments
       WHERE id = ? AND expense_id = ?`,
      [attachmentId, id]
    );
    if (!attachments?.length) {
      return res.status(404).json({ error: '附件不存在或无权访问' });
    }

    const fileName = String(attachments[0].fileName || '').trim();
    await database.run('DELETE FROM expense_attachments WHERE id = ? AND expense_id = ?', [
      attachmentId,
      id
    ]);

    if (fileName) {
      const filePath = path.join(attachmentsDir, fileName);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (unlinkError) {
        console.error('删除附件文件失败:', unlinkError);
      }
    }

    res.json({ message: '删除附件成功' });
  } catch (error) {
    console.error('删除附件错误:', error);
    res.status(500).json({ error: '删除附件失败' });
  }
});

router.get('/payment-channels', async (req, res) => {
  try {
    const userId = req.user.id;
    const channels = await getPayChannels(userId);
    res.json({ message: '获取支付渠道成功', data: channels });
  } catch (error) {
    console.error('获取支付渠道错误:', error);
    res.status(500).json({ error: '获取支付渠道失败' });
  }
});

router.post('/payment-channels', async (req, res) => {
  try {
    const userId = req.user.id;
    const value = String(req.body?.value || '').trim();
    const label = String(req.body?.label || '').trim();
    if (!value || !label) {
      return res.status(400).json({ error: 'value 和 label 为必填项' });
    }
    if (value.length > 50 || label.length > 100) {
      return res.status(400).json({ error: '字段长度超限' });
    }

    const upperValue = normalizePayChannelValue(value);
    const result = await database.run(
      `INSERT INTO payment_channels (user_id, value, label, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      [userId, upperValue, label]
    );
    const row = await database.query(
      'SELECT id, value, label FROM payment_channels WHERE id = ? AND user_id = ?',
      [result.id, userId]
    );
    res.status(201).json({ message: '新增支付渠道成功', data: row?.[0] });
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: '该渠道标识已存在' });
    }
    console.error('新增支付渠道错误:', error);
    res.status(500).json({ error: '新增支付渠道失败' });
  }
});

router.put('/payment-channels/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const label = String(req.body?.label || '').trim();
    if (!label) {
      return res.status(400).json({ error: 'label 为必填项' });
    }
    if (label.length > 100) {
      return res.status(400).json({ error: '字段长度超限' });
    }

    const exist = await database.query(
      'SELECT id FROM payment_channels WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!exist?.length) {
      return res.status(404).json({ error: '支付渠道不存在或无权访问' });
    }

    await database.run(
      `UPDATE payment_channels
       SET label = ?, updated_at = datetime('now', '+8 hours')
       WHERE id = ? AND user_id = ?`,
      [label, id, userId]
    );
    const row = await database.query(
      'SELECT id, value, label FROM payment_channels WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    res.json({ message: '更新支付渠道成功', data: row?.[0] });
  } catch (error) {
    console.error('更新支付渠道错误:', error);
    res.status(500).json({ error: '更新支付渠道失败' });
  }
});

module.exports = router;
