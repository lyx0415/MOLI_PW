// =============================================
// 管理员登录接口
// =============================================
const express = require('express');
const router = express.Router();
const { login, logout } = require('../middleware/auth');

// POST /api/auth/login — 管理员登录
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      code: 400,
      message: '请输入管理员密码',
      data: null,
    });
  }

  const token = login(password);
  if (!token) {
    return res.status(403).json({
      code: 403,
      message: '密码错误',
      data: null,
    });
  }

  res.status(200).json({
    code: 200,
    message: '登录成功',
    data: { token },
  });
});

// POST /api/auth/logout — 退出登录
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  logout(token);

  res.status(200).json({
    code: 200,
    message: '已退出登录',
    data: null,
  });
});

module.exports = router;
