-- 出行花销记录应用数据库表结构
-- 创建时间：2026-01-28

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

-- 账本表
CREATE TABLE IF NOT EXISTS travel_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    start_date DATE,
    end_date DATE,
    description TEXT,
    summary TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 花销记录表
CREATE TABLE IF NOT EXISTS expense_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    date DATE NOT NULL,
    time_range VARCHAR(50),
    duration_minutes INTEGER,
    duration_display VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    discount_note TEXT,
    currency VARCHAR(3) DEFAULT 'CNY',
    vehicle_no VARCHAR(100),
    pay_channel VARCHAR(50),
    category VARCHAR(20) CHECK(category IN ('TRANSPORT', 'HOTEL', 'FOOD', 'TICKET', 'SHOPPING', 'OTHER')),
    remark TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (book_id) REFERENCES travel_books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    value VARCHAR(50) NOT NULL,
    label VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    UNIQUE(user_id, value),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS book_previews (
    book_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    enabled_until DATETIME NOT NULL,
    show_receipts INTEGER DEFAULT 0,
    secret TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (book_id) REFERENCES travel_books(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expense_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (expense_id) REFERENCES expense_items(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_travel_books_user_id ON travel_books(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_book_id ON expense_items(book_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_date ON expense_items(date);
CREATE INDEX IF NOT EXISTS idx_expense_items_category ON expense_items(category);
CREATE INDEX IF NOT EXISTS idx_expense_items_pay_channel ON expense_items(pay_channel);
CREATE INDEX IF NOT EXISTS idx_payment_channels_user_id ON payment_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_book_previews_user_id ON book_previews(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense_id ON expense_attachments(expense_id);
