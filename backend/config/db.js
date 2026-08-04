// =============================================
// 数据库连接池配置
// =============================================
const mysql = require('mysql2/promise');

// 数据库连接参数（密码请根据实际环境修改）
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '041105Lyx',
  database: process.env.DB_NAME || 'peiwang_db',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const pool = mysql.createPool(DB_CONFIG);

module.exports = pool;
