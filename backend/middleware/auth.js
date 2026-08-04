// =============================================
// 简易 Token 鉴权中间件
// =============================================

// 内存中的有效 token 集合（服务重启后需重新登录）
const validTokens = new Set();

// 预定义的登录密码
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '041105Lyx';

// 生成简单 token
function generateToken() {
  return 'token_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

// 验证密码并发放 token
function login(password) {
  if (password === ADMIN_PASSWORD) {
    const token = generateToken();
    validTokens.add(token);
    return token;
  }
  return null;
}

// Express 中间件：验证 token
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token || !validTokens.has(token)) {
    return res.status(401).json({
      code: 401,
      message: '未登录或登录已过期，请重新登录',
      data: null,
    });
  }
  next();
}

// 登出（清除 token）
function logout(token) {
  validTokens.delete(token);
}

module.exports = { login, logout, authMiddleware };
