// =============================================
// 茉莉陪玩官网 — 后端服务入口
// =============================================
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// 路由模块
const authRoutes = require('./routes/auth');
const applyRoutes = require('./routes/apply');
const adminRoutes = require('./routes/admin');
const playersRoutes = require('./routes/players');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------- 中间件 ---------------
app.use(cors());                          // 跨域支持
app.use(bodyParser.json());               // 解析 JSON 请求体
app.use(bodyParser.urlencoded({ extended: false }));

// --------------- 路由挂载 ---------------
app.use('/api/auth', authRoutes);          // 管理员登录
app.use('/api/apply', applyRoutes);       // 申请入职
app.use('/api/applications', adminRoutes); // 管理审核（需鉴权）
app.use('/api/players', playersRoutes);   // 陪玩展示 + 开除（开除需鉴权）

// --------------- 根路径健康检查 ---------------
app.get('/', (req, res) => {
  res.json({ code: 200, message: '茉莉陪玩官网 API 运行中', data: null });
});

// --------------- 全局 404 ---------------
app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在', data: null });
});

// --------------- 全局错误处理 ---------------
app.use((err, req, res, next) => {
  console.error('未捕获的错误：', err);
  res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
});

// --------------- 启动服务 ---------------
app.listen(PORT, () => {
  console.log(`✅ 茉莉陪玩管理系统 API 服务已启动：http://localhost:${PORT}`);
  console.log(`📋 API 接口列表：`);
  console.log(`   POST  /api/auth/login        — 管理员登录`);
  console.log(`   POST  /api/auth/logout       — 退出登录`);
  console.log(`   POST  /api/apply             — 提交入职申请`);
  console.log(`   GET   /api/applications       — 获取申请列表（需鉴权）`);
  console.log(`   PUT   /api/applications/:id/status — 审核操作（需鉴权）`);
  console.log(`   GET   /api/players            — 获取已入职陪玩列表`);
  console.log(`   DELETE /api/players/:id       — 开除陪玩（需鉴权）`);
});
