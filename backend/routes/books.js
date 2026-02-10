const express = require('express');
const database = require('../utils/database');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.use((req, res, next) => {
  const path = String(req.path || '');
  if (path.startsWith('/preview/')) {
    return next();
  }
  return authenticateToken(req, res, next);
});

const createPreviewSecret = () => {
  return crypto
    .randomBytes(18)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const attachmentsDir = path.join(__dirname, '..', 'uploads', 'expense_attachments');

const getPreviewContext = async (req, res, previewId) => {
  const rows = await database.query(
    `SELECT book_id as bookId, user_id as userId
     FROM book_previews
     WHERE secret = ? AND enabled_until > datetime('now', '+8 hours')`,
    [previewId]
  );
  if (!rows?.length) {
    res.status(401).json({ error: '预览未开启或链接无效' });
    return null;
  }
  return { userId: rows[0].userId, bookId: String(rows[0].bookId) };
};

const formatDateYmd = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const cellToString = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return formatDateYmd(value);
  }
  if (typeof value === 'object') {
    if (value.text) {
      return String(value.text);
    }
    if (value.richText && Array.isArray(value.richText)) {
      return value.richText.map((item) => item?.text || '').join('');
    }
    if (value.result !== undefined) {
      return String(value.result ?? '');
    }
  }
  return String(value);
};

const getCellValue = (row, columnIndex) => {
  if (!row || !columnIndex) {
    return null;
  }
  const cell = row.getCell(columnIndex);
  return cell ? cell.value : null;
};

const buildHeaderIndexMap = (headerRow) => {
  const map = new Map();
  if (!headerRow) {
    return map;
  }
  headerRow.eachCell((cell, colNumber) => {
    const key = String(cellToString(cell?.value) || '').trim();
    if (key) {
      map.set(key, colNumber);
    }
  });
  return map;
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

const parseDateCell = (value) => {
  if (!value) {
    return '';
  }
  if (value instanceof Date) {
    return formatDateYmd(value);
  }
  const raw = String(cellToString(value) || '').trim();
  if (!raw) {
    return '';
  }
  const normalized = raw.replace(/\//g, '-').replace(/\./g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return '';
  }
  const yyyy = match[1];
  const mm = String(match[2]).padStart(2, '0');
  const dd = String(match[3]).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseNumberCell = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(cellToString(value) || '').trim();
  if (!raw) {
    return null;
  }
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

const computeDurationMinutes = (timeRange) => {
  const raw = String(timeRange || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return end - start;
};

const findWorksheet = (workbook, preferredNames) => {
  const names = (preferredNames || []).map((name) => String(name || '').trim()).filter(Boolean);
  for (const name of names) {
    const sheet = workbook.getWorksheet(name);
    if (sheet) {
      return sheet;
    }
  }
  return workbook.worksheets?.[0] || null;
};

const normalizeCategory = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const upper = raw.toUpperCase();
  const labelMap = new Map([
    ['交通', 'TRANSPORT'],
    ['住宿', 'HOTEL'],
    ['餐饮', 'FOOD'],
    ['门票', 'TICKET'],
    ['购物', 'SHOPPING'],
    ['其他', 'OTHER']
  ]);
  if (labelMap.has(raw)) {
    return labelMap.get(raw);
  }
  if (labelMap.has(upper)) {
    return labelMap.get(upper);
  }
  const allowed = new Set(['TRANSPORT', 'HOTEL', 'FOOD', 'TICKET', 'SHOPPING', 'OTHER']);
  return allowed.has(upper) ? upper : null;
};

const getPayChannelMappings = async (userId) => {
  const builtIn = new Map([
    ['ALIPAY', '支付宝'],
    ['WECHAT', '微信'],
    ['UNIONPAY', '银联'],
    ['CASH', '现金'],
    ['DOUYIN_MONTHLY', '抖音月付'],
    ['MEITUAN_MONTHLY', '美团月付'],
    ['OTHER', '其他']
  ]);

  const rows = await database.query(
    'SELECT value, label FROM payment_channels WHERE user_id = ?',
    [userId]
  );
  const valueToLabel = new Map(builtIn);
  const labelToValue = new Map();
  for (const [key, label] of builtIn.entries()) {
    labelToValue.set(String(label).trim(), key);
  }
  for (const item of rows || []) {
    const value = String(item.value || '').trim();
    const label = String(item.label || '').trim();
    if (!value || !label) {
      continue;
    }
    valueToLabel.set(value.toUpperCase(), label);
    labelToValue.set(label, value.toUpperCase());
  }
  return { valueToLabel, labelToValue };
};

const normalizePayChannel = (value, mappings) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const upper = normalizePayChannelValue(raw);
  if (mappings?.labelToValue?.has(raw)) {
    return mappings.labelToValue.get(raw);
  }
  if (mappings?.labelToValue?.has(upper)) {
    return mappings.labelToValue.get(upper);
  }
  return upper;
};

// 获取用户的所有账本
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const books = await database.query(
      `SELECT id, name, start_date, end_date, description, created_at, updated_at 
       FROM travel_books 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      message: '获取账本列表成功',
      data: books
    });

  } catch (error) {
    console.error('获取账本列表错误:', error);
    res.status(500).json({
      error: '获取账本列表失败'
    });
  }
});

// 创建新账本
router.post('/', async (req, res) => {
  try {
    const { name, start_date, end_date, description } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({
        error: '账本名称不能为空'
      });
    }

    const result = await database.run(
      `INSERT INTO travel_books (user_id, name, start_date, end_date, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      [userId, name, start_date || null, end_date || null, description || null]
    );

    // 获取刚创建的账本信息
    const newBook = await database.query(
      'SELECT * FROM travel_books WHERE id = ?',
      [result.id]
    );

    res.status(201).json({
      message: '创建账本成功',
      data: newBook[0]
    });

  } catch (error) {
    console.error('创建账本错误:', error);
    res.status(500).json({
      error: '创建账本失败'
    });
  }
});

router.get('/stats/leaderboard', async (req, res) => {
  try {
    const userId = req.user.id;

    const totals = await database.query(
      `SELECT COUNT(ei.id) as totalCount,
              COALESCE(SUM(ei.amount), 0) as totalAmount,
              COALESCE(SUM(ei.discount_amount), 0) as totalSaved
       FROM expense_items ei
       JOIN travel_books tb ON ei.book_id = tb.id
       WHERE tb.user_id = ?`,
      [userId]
    );

    const rows = await database.query(
      `SELECT tb.id as bookId,
              tb.name as bookName,
              COUNT(ei.id) as totalCount,
              COALESCE(SUM(ei.amount), 0) as totalAmount,
              COALESCE(SUM(ei.discount_amount), 0) as totalSaved
       FROM travel_books tb
       LEFT JOIN expense_items ei ON ei.book_id = tb.id
       WHERE tb.user_id = ?
       GROUP BY tb.id
       ORDER BY (COALESCE(SUM(ei.amount), 0) - COALESCE(SUM(ei.discount_amount), 0)) DESC,
                tb.created_at DESC`,
      [userId]
    );

    res.json({
      message: '获取账本排行榜成功',
      data: {
        totals: totals?.[0] || { totalCount: 0, totalAmount: 0, totalSaved: 0 },
        items: rows || []
      }
    });
  } catch (error) {
    console.error('获取账本排行榜错误:', error);
    res.status(500).json({ error: '获取账本排行榜失败' });
  }
});

router.get('/import/template', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'chuxing';
    workbook.created = new Date();

    const helpSheet = workbook.addWorksheet('说明');
    helpSheet.columns = [
      { header: '工作表', key: 'sheet', width: 10 },
      { header: '字段', key: 'field', width: 22 },
      { header: '是否必填', key: 'required', width: 10 },
      { header: '说明', key: 'note', width: 66 }
    ];
    helpSheet.addRow({
      sheet: '账本',
      field: '账本名称*',
      required: '是',
      note: '用于识别/匹配账本；若已存在同名账本，则花销会追加到该账本中'
    });
    helpSheet.addRow({
      sheet: '账本',
      field: '描述',
      required: '否',
      note: '可留空；若导入时填写，则会补全/更新账本描述'
    });
    helpSheet.addRow({
      sheet: '账本',
      field: '开始日期/结束日期',
      required: '否',
      note: '格式 YYYY-MM-DD；可留空；若导入时填写，则会补全/更新账本日期范围'
    });
    helpSheet.addRow({
      sheet: '花销',
      field: '日期*',
      required: '是',
      note: '格式 YYYY-MM-DD'
    });
    helpSheet.addRow({
      sheet: '花销',
      field: '时间段*',
      required: '是',
      note: '格式 HH:mm-HH:mm，结束时间需不早于开始时间；用于自动计算耗时(分钟)'
    });
    helpSheet.addRow({
      sheet: '花销',
      field: '项目描述*',
      required: '是',
      note: '例如：午餐/景区门票/酒店住宿/网约车'
    });
    helpSheet.addRow({
      sheet: '花销',
      field: '金额*',
      required: '是',
      note: '非负数字'
    });
    helpSheet.addRow({
      sheet: '花销',
      field: '分类*',
      required: '是',
      note: '可填中文(交通/住宿/餐饮/门票/购物/其他)或代码(TRANSPORT/HOTEL/FOOD/TICKET/SHOPPING/OTHER)'
    });
    helpSheet.addRow({
      sheet: '花销',
      field: '车次/航班号',
      required: '条件必填',
      note: '当分类为「交通/TRANSPORT」时必填（与网页规则一致）'
    });
    helpSheet.addRow({
      sheet: '花销',
      field: '优惠金额',
      required: '否',
      note: '可留空；若填写需为非负数字且不大于金额'
    });
    helpSheet.addRow({
      sheet: '花销',
      field: '支付渠道',
      required: '否',
      note: '可留空；可填中文(支付宝/微信/银联/现金/抖音月付/美团月付/其他)或代码(ALIPAY/WECHAT/UNIONPAY/CASH/DOUYIN_MONTHLY/MEITUAN_MONTHLY/OTHER)'
    });
    helpSheet.addRow({
      sheet: '导入规则',
      field: '',
      required: '',
      note: '空行会自动忽略；必填缺失或格式不合法会跳过该行并在返回结果中给出行号与原因'
    });
    helpSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const bookSheet = workbook.addWorksheet('账本');
    bookSheet.columns = [
      { header: '账本名称*', key: 'name', width: 24 },
      { header: '描述', key: 'description', width: 40 },
      { header: '开始日期(YYYY-MM-DD)', key: 'start_date', width: 20 },
      { header: '结束日期(YYYY-MM-DD)', key: 'end_date', width: 20 }
    ];
    bookSheet.addRow({
      name: '示例：2026春节出行',
      description: '示例：广州-北京往返，全家出行',
      start_date: '2026-02-10',
      end_date: '2026-02-15'
    });
    bookSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const expenseSheet = workbook.addWorksheet('花销');
    expenseSheet.columns = [
      { header: '日期*(YYYY-MM-DD)', key: 'date', width: 18 },
      { header: '时间段*(HH:mm-HH:mm)', key: 'time_range', width: 22 },
      { header: '耗时(分钟)', key: 'duration_minutes', width: 12 },
      { header: '耗时显示', key: 'duration_display', width: 12 },
      { header: '项目描述*', key: 'title', width: 34 },
      { header: '金额*', key: 'amount', width: 12 },
      { header: '优惠金额', key: 'discount_amount', width: 12 },
      { header: '优惠说明', key: 'discount_note', width: 18 },
      { header: '货币(默认CNY)', key: 'currency', width: 14 },
      { header: '车次/航班号(交通必填)', key: 'vehicle_no', width: 22 },
      { header: '支付渠道(可填中文或代码)', key: 'pay_channel', width: 22 },
      { header: '分类*(可填中文或代码)', key: 'category', width: 22 },
      { header: '备注', key: 'remark', width: 36 }
    ];
    expenseSheet.addRow({
      date: '2026-02-10',
      time_range: '09:10-10:35',
      duration_minutes: 85,
      duration_display: '1h25m',
      title: '高铁票',
      amount: 560,
      discount_amount: 20,
      discount_note: '平台券',
      currency: 'CNY',
      vehicle_no: 'G1234',
      pay_channel: '支付宝',
      category: '交通',
      remark: '二等座'
    });
    expenseSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = '出行花销导入模板.xlsx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  } catch (error) {
    console.error('生成导入模板失败:', error);
    res.status(500).json({ error: '生成导入模板失败' });
  }
});

router.post('/import', upload.single('file'), async (req, res) => {
  const userId = req.user.id;
  if (!req.file?.buffer) {
    res.status(400).json({ error: '请上传xlsx文件' });
    return;
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer);
  } catch (error) {
    res.status(400).json({ error: 'xlsx解析失败，请检查文件格式' });
    return;
  }

  const bookSheet = findWorksheet(workbook, ['账本', 'Book', 'book']);
  const expenseSheet = findWorksheet(workbook, ['花销', '花费', 'Expenses', 'expenses']);
  if (!bookSheet || !expenseSheet) {
    res.status(400).json({ error: '模板不完整，需包含「账本」「花销」两个工作表' });
    return;
  }

  const bookHeaderRow = bookSheet.getRow(1);
  const bookHeaders = buildHeaderIndexMap(bookHeaderRow);
  const bookDataRow = bookSheet.getRow(2);
  const bookNameCell = getCellValue(
    bookDataRow,
    bookHeaders.get('账本名称*') || bookHeaders.get('账本名称') || bookHeaders.get('name')
  );
  const bookName = String(cellToString(bookNameCell) || '').trim();
  const descriptionCell = getCellValue(bookDataRow, bookHeaders.get('描述') || bookHeaders.get('description'));
  const description = String(cellToString(descriptionCell) || '').trim();
  const startDateCell = getCellValue(bookDataRow, bookHeaders.get('开始日期(YYYY-MM-DD)') || bookHeaders.get('start_date'));
  const endDateCell = getCellValue(bookDataRow, bookHeaders.get('结束日期(YYYY-MM-DD)') || bookHeaders.get('end_date'));
  const startDate = parseDateCell(startDateCell);
  const endDate = parseDateCell(endDateCell);

  if (!bookName) {
    res.status(400).json({ error: '账本名称不能为空' });
    return;
  }

  const mappings = await getPayChannelMappings(userId);

  const headerRow = expenseSheet.getRow(1);
  const headers = buildHeaderIndexMap(headerRow);
  const colAny = (...names) => {
    for (const name of names) {
      const index = headers.get(name);
      if (index) {
        return index;
      }
    }
    return null;
  };

  const errors = [];
  let insertedCount = 0;
  let skippedCount = 0;
  let bookId = null;
  let created = false;

  await database.run('BEGIN');
  try {
    const existingBooks = await database.query(
      'SELECT id, description, start_date, end_date FROM travel_books WHERE user_id = ? AND name = ? LIMIT 1',
      [userId, bookName]
    );
    if (!existingBooks?.length) {
      const result = await database.run(
        `INSERT INTO travel_books (user_id, name, start_date, end_date, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
        [userId, bookName, startDate || null, endDate || null, description || null]
      );
      bookId = String(result.id);
      created = true;
    } else {
      bookId = String(existingBooks[0].id);
      const nextDescription = description || existingBooks[0].description || null;
      const nextStart = startDate || existingBooks[0].start_date || null;
      const nextEnd = endDate || existingBooks[0].end_date || null;
      await database.run(
        `UPDATE travel_books
         SET description = ?, start_date = ?, end_date = ?, updated_at = datetime('now', '+8 hours')
         WHERE id = ? AND user_id = ?`,
        [nextDescription, nextStart, nextEnd, bookId, userId]
      );
    }

    const maxRows = expenseSheet.rowCount || 0;
    for (let rowIndex = 2; rowIndex <= maxRows; rowIndex += 1) {
      const row = expenseSheet.getRow(rowIndex);
      const dateValue = getCellValue(row, colAny('日期*(YYYY-MM-DD)', '日期(YYYY-MM-DD)', '日期', 'date'));
      const timeRangeValue = getCellValue(row, colAny('时间段*(HH:mm-HH:mm)', '时间段(HH:mm-HH:mm)', '时间段', 'time_range'));
      const titleValue = getCellValue(row, colAny('项目描述*', '项目描述', '标题', 'title'));
      const amountValue = getCellValue(row, colAny('金额*', '金额', 'amount'));
      const categoryValue = getCellValue(row, colAny('分类*(可填中文或代码)', '分类(可填中文或代码)', '分类', 'category'));

      const rawDate = parseDateCell(dateValue);
      const time_range = String(cellToString(timeRangeValue) || '').trim() || null;
      const title = String(cellToString(titleValue) || '').trim();
      const amount = parseNumberCell(amountValue);
      const categoryNormalized = normalizeCategory(categoryValue ? cellToString(categoryValue) : '');

      const rowHasAnyValue = row.values?.some((v) => v !== null && v !== undefined && String(cellToString(v) || '').trim() !== '');
      if (!rowHasAnyValue) {
        continue;
      }

      if (!rawDate || !time_range || !title || amount === null || !categoryNormalized) {
        skippedCount += 1;
        errors.push({ row: rowIndex, error: '日期/时间段/项目描述/金额/分类为必填项' });
        continue;
      }

      const durationDisplayValue = getCellValue(row, colAny('耗时显示', 'duration_display'));
      const discountAmountValue = getCellValue(row, colAny('优惠金额', 'discount_amount'));
      const discountNoteValue = getCellValue(row, colAny('优惠说明', 'discount_note'));
      const currencyValue = getCellValue(row, colAny('货币(默认CNY)', '货币', 'currency'));
      const vehicleValue = getCellValue(row, colAny('车次/航班号(交通必填)', '车次/航班号', 'vehicle_no'));
      const payChannelValue = getCellValue(row, colAny('支付渠道(可填中文或代码)', '支付渠道', 'pay_channel'));
      const remarkValue = getCellValue(row, colAny('备注', 'remark'));

      const duration_minutes_from_range = computeDurationMinutes(time_range);
      const duration_minutes = duration_minutes_from_range;
      const duration_display = String(cellToString(durationDisplayValue) || '').trim() || null;
      const discount_amount = parseNumberCell(discountAmountValue) ?? 0;
      const discount_note = String(cellToString(discountNoteValue) || '').trim() || null;
      const currency = String(cellToString(currencyValue) || '').trim() || 'CNY';
      const vehicle_no = String(cellToString(vehicleValue) || '').trim() || null;
      const pay_channel = normalizePayChannel(payChannelValue ? cellToString(payChannelValue) : '', mappings);
      const category = categoryNormalized;
      const remark = String(cellToString(remarkValue) || '').trim() || null;

      if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
        skippedCount += 1;
        errors.push({ row: rowIndex, error: '金额不合法' });
        continue;
      }
      if (!Number.isFinite(Number(discount_amount)) || Number(discount_amount) < 0) {
        skippedCount += 1;
        errors.push({ row: rowIndex, error: '优惠金额不合法' });
        continue;
      }
      if (Number(discount_amount) > Number(amount)) {
        skippedCount += 1;
        errors.push({ row: rowIndex, error: '优惠金额不能大于金额' });
        continue;
      }
      if (duration_minutes === null) {
        skippedCount += 1;
        errors.push({ row: rowIndex, error: '时间段格式不合法' });
        continue;
      }
      if (category === 'TRANSPORT' && !vehicle_no) {
        skippedCount += 1;
        errors.push({ row: rowIndex, error: '交通分类需填写车次/航班号' });
        continue;
      }
      if (pay_channel && !mappings?.valueToLabel?.has(String(pay_channel).toUpperCase())) {
        skippedCount += 1;
        errors.push({ row: rowIndex, error: '支付渠道不合法' });
        continue;
      }

      await database.run(
        `INSERT INTO expense_items
         (book_id, date, time_range, duration_minutes, duration_display, title, amount, discount_amount, discount_note, currency, vehicle_no, pay_channel, category, remark, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
        [
          bookId,
          rawDate,
          time_range,
          duration_minutes,
          duration_display,
          title,
          Number(amount),
          Number(discount_amount),
          discount_note,
          currency,
          vehicle_no,
          pay_channel,
          category,
          remark
        ]
      );
      insertedCount += 1;
    }

    await database.run('COMMIT');
  } catch (error) {
    await database.run('ROLLBACK');
    console.error('导入失败:', error);
    res.status(500).json({ error: '导入失败' });
    return;
  }

  res.json({
    message: '导入成功',
    data: {
      bookId,
      bookName,
      created,
      insertedCount,
      skippedCount,
      errors
    }
  });
});

// 获取单个账本详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const books = await database.query(
      `SELECT * FROM travel_books 
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (books.length === 0) {
      return res.status(404).json({
        error: '账本不存在或无权访问'
      });
    }

    res.json({
      message: '获取账本详情成功',
      data: books[0]
    });

  } catch (error) {
    console.error('获取账本详情错误:', error);
    res.status(500).json({
      error: '获取账本详情失败'
    });
  }
});

router.get('/:id/stats/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const books = await database.query(
      `SELECT id FROM travel_books 
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (books.length === 0) {
      return res.status(404).json({
        error: '账本不存在或无权访问'
      });
    }

    const totalResult = await database.query(
      `SELECT COUNT(*) as totalCount, COALESCE(SUM(amount), 0) as totalAmount, COALESCE(SUM(discount_amount), 0) as totalSaved
       FROM expense_items WHERE book_id = ?`,
      [id]
    );

    const categoryResult = await database.query(
      `SELECT category as name, COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount, COALESCE(SUM(discount_amount), 0) as savedAmount
       FROM expense_items WHERE book_id = ?
       GROUP BY category
       ORDER BY totalAmount DESC`,
      [id]
    );

    const payChannelResult = await database.query(
      `SELECT COALESCE(NULLIF(TRIM(pay_channel), ''), 'OTHER') as name, COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount, COALESCE(SUM(discount_amount), 0) as savedAmount
       FROM expense_items WHERE book_id = ?
       GROUP BY COALESCE(NULLIF(TRIM(pay_channel), ''), 'OTHER')
       ORDER BY totalAmount DESC`,
      [id]
    );

    res.json({
      message: '获取统计摘要成功',
      data: {
        totalCount: totalResult[0].totalCount,
        totalAmount: totalResult[0].totalAmount,
        totalSaved: totalResult[0].totalSaved,
        byCategory: categoryResult,
        byPayChannel: payChannelResult
      }
    });
  } catch (error) {
    console.error('获取统计摘要错误:', error);
    res.status(500).json({
      error: '获取统计摘要失败'
    });
  }
});

router.get('/:id/stats/daily', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { start_date, end_date } = req.query;

    const books = await database.query(
      `SELECT id FROM travel_books 
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (books.length === 0) {
      return res.status(404).json({
        error: '账本不存在或无权访问'
      });
    }

    const whereConditions = ['book_id = ?'];
    const queryParams = [id];

    if (start_date) {
      whereConditions.push('date >= ?');
      queryParams.push(start_date);
    }

    if (end_date) {
      whereConditions.push('date <= ?');
      queryParams.push(end_date);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const dailyResult = await database.query(
      `SELECT 
         date, 
         COUNT(*) as count, 
         COALESCE(SUM(amount), 0) as totalAmount,
         COALESCE(SUM(discount_amount), 0) as savedAmount,
         COALESCE(SUM(amount), 0) - COALESCE(SUM(discount_amount), 0) as netAmount
       FROM expense_items
       ${whereClause}
       GROUP BY date
       ORDER BY date DESC`,
      queryParams
    );

    res.json({
      message: '获取每日统计成功',
      data: dailyResult
    });
  } catch (error) {
    console.error('获取每日统计错误:', error);
    res.status(500).json({
      error: '获取每日统计失败'
    });
  }
});

router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const books = await database.query(
      `SELECT id, name FROM travel_books 
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (books.length === 0) {
      return res.status(404).json({
        error: '账本不存在或无权访问'
      });
    }

    const expenses = await database.query(
      `SELECT date, time_range, duration_minutes, duration_display, title, amount, discount_amount, discount_note, currency, vehicle_no, pay_channel, category, remark
       FROM expense_items
       WHERE book_id = ?
       ORDER BY 
         date DESC,
         COALESCE(
           time(CASE 
             WHEN time_range IS NOT NULL AND instr(time_range, '-') > 0 THEN substr(time_range, 1, instr(time_range, '-') - 1) 
             ELSE NULL 
           END),
           '00:00'
         ) DESC,
         id DESC`,
      [id]
    );

    const builtInPayChannelLabels = {
      ALIPAY: '支付宝',
      WECHAT: '微信',
      UNIONPAY: '银联',
      CASH: '现金',
      DOUYIN_MONTHLY: '抖音月付',
      MEITUAN_MONTHLY: '美团月付',
      OTHER: '其他'
    };
    const categoryLabels = {
      TRANSPORT: '交通',
      HOTEL: '住宿',
      FOOD: '餐饮',
      TICKET: '门票',
      SHOPPING: '购物',
      OTHER: '其他'
    };
    const paymentChannels = await database.query(
      'SELECT value, label FROM payment_channels WHERE user_id = ?',
      [userId]
    );
    const paymentChannelLabelMap = new Map();
    for (const item of paymentChannels || []) {
      const key = String(item.value || '').trim();
      const label = String(item.label || '').trim();
      if (key && label) {
        paymentChannelLabelMap.set(key, label);
      }
    }
    const toPayChannelLabel = (value) => {
      const raw = String(value ?? '').trim();
      const normalized = raw ? raw.toUpperCase() : 'OTHER';
      return paymentChannelLabelMap.get(normalized) || builtInPayChannelLabels[normalized] || raw || '其他';
    };
    const toCategoryLabel = (value) => {
      const raw = String(value ?? '').trim();
      const normalized = raw ? raw.toUpperCase() : 'OTHER';
      return categoryLabels[normalized] || raw || '其他';
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'chuxing';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('花销');
    sheet.columns = [
      { header: '日期', key: 'date', width: 14 },
      { header: '时间段', key: 'time_range', width: 16 },
      { header: '耗时(分钟)', key: 'duration_minutes', width: 12 },
      { header: '耗时显示', key: 'duration_display', width: 12 },
      { header: '项目描述', key: 'title', width: 28 },
      { header: '金额', key: 'amount', width: 12 },
      { header: '优惠金额', key: 'discount_amount', width: 12 },
      { header: '优惠说明', key: 'discount_note', width: 16 },
      { header: '货币', key: 'currency', width: 10 },
      { header: '车次/航班号', key: 'vehicle_no', width: 14 },
      { header: '支付渠道', key: 'pay_channel', width: 14 },
      { header: '分类', key: 'category', width: 10 },
      { header: '备注', key: 'remark', width: 24 }
    ];
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const item of expenses || []) {
      sheet.addRow({
        date: item.date,
        time_range: item.time_range || '',
        duration_minutes: item.duration_minutes ?? '',
        duration_display: item.duration_display || '',
        title: item.title,
        amount: Number(item.amount ?? 0),
        discount_amount: Number(item.discount_amount ?? 0),
        discount_note: item.discount_note || '',
        currency: item.currency || 'CNY',
        vehicle_no: item.vehicle_no || '',
        pay_channel: toPayChannelLabel(item.pay_channel),
        category: toCategoryLabel(item.category),
        remark: item.remark || ''
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${books[0].name || 'book'}-export.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  } catch (error) {
    console.error('导出失败:', error);
    res.status(500).json({
      error: '导出失败'
    });
  }
});

// 更新账本
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, start_date, end_date, description, summary } = req.body;
    const userId = req.user.id;

    // 检查账本是否存在
    const existingBook = await database.query(
      'SELECT * FROM travel_books WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (existingBook.length === 0) {
      return res.status(404).json({
        error: '账本不存在或无权访问'
      });
    }

    const current = existingBook[0];
    const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
    const hasStartDate = Object.prototype.hasOwnProperty.call(req.body || {}, 'start_date');
    const hasEndDate = Object.prototype.hasOwnProperty.call(req.body || {}, 'end_date');
    const hasDescription = Object.prototype.hasOwnProperty.call(req.body || {}, 'description');
    const hasSummary = Object.prototype.hasOwnProperty.call(req.body || {}, 'summary');

    const nextName = hasName ? name : current.name;
    if (!nextName) {
      return res.status(400).json({ error: '账本名称不能为空' });
    }
    const nextStartDate = hasStartDate ? start_date : current.start_date;
    const nextEndDate = hasEndDate ? end_date : current.end_date;
    const nextDescription = hasDescription ? description : current.description;
    const nextSummary = hasSummary ? summary : current.summary;

    await database.run(
      `UPDATE travel_books
       SET name = ?, start_date = ?, end_date = ?, description = ?, summary = ?, updated_at = datetime('now', '+8 hours')
       WHERE id = ? AND user_id = ?`,
      [nextName, nextStartDate, nextEndDate, nextDescription, nextSummary, id, userId]
    );

    // 获取更新后的账本信息
    const updatedBook = await database.query(
      'SELECT * FROM travel_books WHERE id = ?',
      [id]
    );

    res.json({
      message: '更新账本成功',
      data: updatedBook[0]
    });

  } catch (error) {
    console.error('更新账本错误:', error);
    res.status(500).json({
      error: '更新账本失败'
    });
  }
});

// 删除账本
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 检查账本是否存在
    const existingBook = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (existingBook.length === 0) {
      return res.status(404).json({
        error: '账本不存在或无权访问'
      });
    }

    await database.run('BEGIN');
    try {
      await database.run('DELETE FROM expense_items WHERE book_id = ?', [id]);
      await database.run('DELETE FROM book_previews WHERE book_id = ? AND user_id = ?', [id, userId]);
      await database.run('DELETE FROM travel_books WHERE id = ? AND user_id = ?', [id, userId]);
      await database.run('COMMIT');
    } catch (error) {
      await database.run('ROLLBACK');
      throw error;
    }

    res.json({
      message: '删除账本成功'
    });

  } catch (error) {
    console.error('删除账本错误:', error);
    res.status(500).json({
      error: '删除账本失败'
    });
  }
});

router.get('/:id/preview-status', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const books = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!books?.length) {
      return res.status(404).json({ error: '账本不存在或无权访问' });
    }

    const rows = await database.query(
      `SELECT enabled_until as enabledUntil,
              secret,
              show_receipts as showReceipts,
              (enabled_until > datetime('now', '+8 hours')) as enabled
       FROM book_previews
       WHERE book_id = ? AND user_id = ?`,
      [id, userId]
    );

    let enabledUntil = rows?.[0]?.enabledUntil || null;
    let previewId = rows?.[0]?.secret || null;
    const enabled = Boolean(rows?.[0]?.enabled);
    const showReceipts = Boolean(rows?.[0]?.showReceipts);

    if (rows?.length && !previewId) {
      previewId = createPreviewSecret();
      await database.run(
        `UPDATE book_previews
         SET secret = ?, updated_at = datetime('now', '+8 hours')
         WHERE book_id = ? AND user_id = ?`,
        [previewId, id, userId]
      );
    }

    res.json({
      message: '获取预览状态成功',
      data: {
        enabled,
        enabled_until: enabled ? enabledUntil : null,
        preview_id: previewId,
        show_receipts: showReceipts
      }
    });
  } catch (error) {
    console.error('获取预览状态错误:', error);
    res.status(500).json({ error: '获取预览状态失败' });
  }
});

router.put('/:id/preview-settings', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const showReceipts = Boolean(req.body?.show_receipts);

    const books = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!books?.length) {
      return res.status(404).json({ error: '账本不存在或无权访问' });
    }

    const rows = await database.query(
      `SELECT book_id as bookId FROM book_previews WHERE book_id = ? AND user_id = ?`,
      [id, userId]
    );

    if (!rows?.length) {
      await database.run(
        `INSERT INTO book_previews (book_id, user_id, enabled_until, show_receipts, secret, created_at, updated_at)
         VALUES (?, ?, datetime('now', '+8 hours', '-1 day'), ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
        [id, userId, showReceipts ? 1 : 0, createPreviewSecret()]
      );
    } else {
      await database.run(
        `UPDATE book_previews
         SET show_receipts = ?, updated_at = datetime('now', '+8 hours')
         WHERE book_id = ? AND user_id = ?`,
        [showReceipts ? 1 : 0, id, userId]
      );
    }

    res.json({ message: '更新预览设置成功', data: { show_receipts: showReceipts } });
  } catch (error) {
    console.error('更新预览设置错误:', error);
    res.status(500).json({ error: '更新预览设置失败' });
  }
});

router.put('/:id/preview-status', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const enabled = Boolean(req.body?.enabled);

    const books = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!books?.length) {
      return res.status(404).json({ error: '账本不存在或无权访问' });
    }

    if (!enabled) {
      const rows = await database.query(
        `SELECT secret FROM book_previews WHERE book_id = ? AND user_id = ?`,
        [id, userId]
      );
      const previewId = rows?.[0]?.secret || null;

      if (rows?.length) {
        await database.run(
          `UPDATE book_previews
           SET enabled_until = datetime('now', '+8 hours', '-1 day'), updated_at = datetime('now', '+8 hours')
           WHERE book_id = ? AND user_id = ?`,
          [id, userId]
        );
      }

      return res.json({
        message: '预览已关闭',
        data: { enabled: false, enabled_until: null, preview_id: previewId }
      });
    }

    const secret = createPreviewSecret();
    await database.run(
      `INSERT INTO book_previews (book_id, user_id, enabled_until, secret, created_at, updated_at)
       VALUES (?, ?, datetime('now', '+8 hours', '+30 days'), ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
       ON CONFLICT(book_id) DO UPDATE SET
         user_id = excluded.user_id,
         enabled_until = excluded.enabled_until,
         secret = COALESCE(book_previews.secret, excluded.secret),
         updated_at = datetime('now', '+8 hours')`,
      [id, userId, secret]
    );

    const rows = await database.query(
      `SELECT enabled_until as enabledUntil, secret
       FROM book_previews
       WHERE book_id = ? AND user_id = ?`,
      [id, userId]
    );

    res.json({
      message: '预览已开启',
      data: { enabled: true, enabled_until: rows?.[0]?.enabledUntil || null, preview_id: rows?.[0]?.secret || null }
    });
  } catch (error) {
    console.error('更新预览状态错误:', error);
    res.status(500).json({ error: '更新预览状态失败' });
  }
});

router.get('/:id/preview-token', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const books = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!books?.length) {
      return res.status(404).json({ error: '账本不存在或无权访问' });
    }

    await database.run(
      `INSERT INTO book_previews (book_id, user_id, enabled_until, secret, created_at, updated_at)
       VALUES (?, ?, datetime('now', '+8 hours', '-1 day'), ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
       ON CONFLICT(book_id) DO UPDATE SET
         user_id = excluded.user_id,
         secret = COALESCE(book_previews.secret, excluded.secret),
         updated_at = datetime('now', '+8 hours')`,
      [id, userId, createPreviewSecret()]
    );

    const rows = await database.query(
      `SELECT secret FROM book_previews WHERE book_id = ? AND user_id = ?`,
      [id, userId]
    );

    res.json({ message: '获取预览链接成功', data: { preview_id: rows?.[0]?.secret || null } });
  } catch (error) {
    console.error('获取预览token错误:', error);
    res.status(500).json({ error: '获取预览链接失败' });
  }
});

router.get('/preview/books/:previewId', async (req, res) => {
  try {
    const { previewId } = req.params;
    const ctx = await getPreviewContext(req, res, previewId);
    if (!ctx) {
      return;
    }
    const books = await database.query(
      'SELECT * FROM travel_books WHERE id = ? AND user_id = ?',
      [ctx.bookId, ctx.userId]
    );
    if (!books?.length) {
      return res.status(404).json({ error: '账本不存在或无权访问' });
    }
    const previewSettings = await database.query(
      'SELECT show_receipts as showReceipts FROM book_previews WHERE book_id = ? AND user_id = ?',
      [ctx.bookId, ctx.userId]
    );
    res.json({
      message: '获取账本详情成功',
      data: { ...books[0], show_receipts: Boolean(previewSettings?.[0]?.showReceipts) }
    });
  } catch (error) {
    console.error('预览获取账本详情错误:', error);
    res.status(500).json({ error: '获取账本详情失败' });
  }
});

router.get('/preview/books/:previewId/stats/summary', async (req, res) => {
  try {
    const { previewId } = req.params;
    const ctx = await getPreviewContext(req, res, previewId);
    if (!ctx) {
      return;
    }

    const books = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [ctx.bookId, ctx.userId]
    );
    if (!books?.length) {
      return res.status(404).json({ error: '账本不存在或无权访问' });
    }

    const totalResult = await database.query(
      `SELECT COUNT(*) as totalCount, COALESCE(SUM(amount), 0) as totalAmount, COALESCE(SUM(discount_amount), 0) as totalSaved
       FROM expense_items WHERE book_id = ?`,
      [ctx.bookId]
    );

    const categoryResult = await database.query(
      `SELECT category as name, COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount, COALESCE(SUM(discount_amount), 0) as savedAmount
       FROM expense_items WHERE book_id = ?
       GROUP BY category
       ORDER BY totalAmount DESC`,
      [ctx.bookId]
    );

    const payChannelResult = await database.query(
      `SELECT COALESCE(NULLIF(TRIM(pay_channel), ''), 'OTHER') as name, COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount, COALESCE(SUM(discount_amount), 0) as savedAmount
       FROM expense_items WHERE book_id = ?
       GROUP BY COALESCE(NULLIF(TRIM(pay_channel), ''), 'OTHER')
       ORDER BY totalAmount DESC`,
      [ctx.bookId]
    );

    res.json({
      message: '获取统计摘要成功',
      data: {
        totalCount: totalResult[0].totalCount,
        totalAmount: totalResult[0].totalAmount,
        totalSaved: totalResult[0].totalSaved,
        byCategory: categoryResult,
        byPayChannel: payChannelResult
      }
    });
  } catch (error) {
    console.error('预览获取统计摘要错误:', error);
    res.status(500).json({ error: '获取统计摘要失败' });
  }
});

router.get('/preview/books/:previewId/stats/daily', async (req, res) => {
  try {
    const { previewId } = req.params;
    const ctx = await getPreviewContext(req, res, previewId);
    if (!ctx) {
      return;
    }
    const { start_date, end_date } = req.query;

    const books = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [ctx.bookId, ctx.userId]
    );
    if (!books?.length) {
      return res.status(404).json({ error: '账本不存在或无权访问' });
    }

    const whereConditions = ['book_id = ?'];
    const queryParams = [ctx.bookId];

    if (start_date) {
      whereConditions.push('date >= ?');
      queryParams.push(start_date);
    }
    if (end_date) {
      whereConditions.push('date <= ?');
      queryParams.push(end_date);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    const dailyResult = await database.query(
      `SELECT 
         date, 
         COUNT(*) as count, 
         COALESCE(SUM(amount), 0) as totalAmount,
         COALESCE(SUM(discount_amount), 0) as savedAmount,
         COALESCE(SUM(amount), 0) - COALESCE(SUM(discount_amount), 0) as netAmount
       FROM expense_items
       ${whereClause}
       GROUP BY date
       ORDER BY date DESC`,
      queryParams
    );

    res.json({ message: '获取每日统计成功', data: dailyResult });
  } catch (error) {
    console.error('预览获取每日统计错误:', error);
    res.status(500).json({ error: '获取每日统计失败' });
  }
});

router.get('/preview/books/:previewId/expenses', async (req, res) => {
  try {
    const { previewId } = req.params;
    const ctx = await getPreviewContext(req, res, previewId);
    if (!ctx) {
      return;
    }

    const { page = 1, pageSize = 20, category, pay_channel, date_from, date_to, keyword } = req.query;
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNumber = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    const books = await database.query(
      'SELECT id FROM travel_books WHERE id = ? AND user_id = ?',
      [ctx.bookId, ctx.userId]
    );
    if (!books?.length) {
      return res.status(404).json({ error: '账本不存在或无权访问' });
    }

    const whereConditions = ['book_id = ?'];
    const queryParams = [ctx.bookId];

    if (category) {
      whereConditions.push('category = ?');
      queryParams.push(category);
    }

    const normalizedQueryPayChannel = String(pay_channel ?? '').trim() || null;
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

    const totalResult = await database.query(
      `SELECT COUNT(*) as total FROM expense_items ${whereClause}`,
      queryParams
    );
    const total = totalResult?.[0]?.total || 0;

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
    console.error('预览获取花销记录错误:', error);
    res.status(500).json({ error: '获取花销记录失败' });
  }
});

router.get('/preview/books/:previewId/expenses/:expenseId/attachments', async (req, res) => {
  try {
    const { previewId, expenseId } = req.params;
    const ctx = await getPreviewContext(req, res, previewId);
    if (!ctx) {
      return;
    }

    const previewSettings = await database.query(
      `SELECT show_receipts as showReceipts FROM book_previews WHERE book_id = ? AND user_id = ?`,
      [ctx.bookId, ctx.userId]
    );
    if (!previewSettings?.[0]?.showReceipts) {
      return res.json({ message: '获取附件成功', data: [] });
    }

    const expenses = await database.query(
      'SELECT id FROM expense_items WHERE id = ? AND book_id = ?',
      [expenseId, ctx.bookId]
    );
    if (!expenses?.length) {
      return res.status(404).json({ error: '花销记录不存在或无权访问' });
    }

    const attachments = await database.query(
      `SELECT id, file_name as fileName, original_name as originalName, mime_type as mimeType, size_bytes as sizeBytes, created_at as createdAt
       FROM expense_attachments
       WHERE expense_id = ?
       ORDER BY id ASC`,
      [expenseId]
    );
    const items = (attachments || []).map((item) => ({
      id: item.id,
      file_name: item.fileName,
      original_name: item.originalName || '',
      mime_type: item.mimeType || '',
      size_bytes: item.sizeBytes || 0,
      created_at: item.createdAt,
      url: `/api/books/preview/books/${previewId}/expense-attachments/${item.fileName}`
    }));
    res.json({ message: '获取附件成功', data: items });
  } catch (error) {
    console.error('预览获取附件列表错误:', error);
    res.status(500).json({ error: '获取附件列表失败' });
  }
});

router.get('/preview/books/:previewId/expense-attachments/:fileName', async (req, res) => {
  try {
    const { previewId } = req.params;
    const fileName = String(req.params?.fileName || '').trim();
    if (!/^[a-f0-9]{32}(?:\.[a-z0-9]{1,10})$/i.test(fileName)) {
      return res.status(400).json({ error: '文件名不合法' });
    }

    const ctx = await getPreviewContext(req, res, previewId);
    if (!ctx) {
      return;
    }

    const previewSettings = await database.query(
      `SELECT show_receipts as showReceipts FROM book_previews WHERE book_id = ? AND user_id = ?`,
      [ctx.bookId, ctx.userId]
    );
    if (!previewSettings?.[0]?.showReceipts) {
      return res.status(403).json({ error: '票据预览未开启' });
    }

    const rows = await database.query(
      `SELECT ea.mime_type as mimeType
       FROM expense_attachments ea
       JOIN expense_items ei ON ei.id = ea.expense_id
       WHERE ea.file_name = ? AND ei.book_id = ?
       LIMIT 1`,
      [fileName, ctx.bookId]
    );
    if (!rows?.length) {
      return res.status(404).json({ error: '文件不存在或无权访问' });
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

    const mimeType = String(rows?.[0]?.mimeType || '').trim();
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    res.sendFile(filePath);
  } catch (error) {
    console.error('预览获取附件文件错误:', error);
    res.status(500).json({ error: '获取附件文件失败' });
  }
});

module.exports = router;
