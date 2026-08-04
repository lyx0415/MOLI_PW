// =============================================
// 管理审核相关接口（需登录鉴权）
// =============================================
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// 所有管理接口均需登录
router.use(authMiddleware);

// GET /api/applications — 获取申请列表（支持按 status 筛选）
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    let sql = 'SELECT * FROM applications';
    const params = [];

    if (status !== undefined && status !== '') {
      sql += ' WHERE status = ?';
      params.push(Number(status));
    }

    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(sql, params);

    res.status(200).json({
      code: 200,
      message: '查询成功',
      data: rows,
    });
  } catch (err) {
    console.error('查询申请列表失败：', err);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null,
    });
  }
});

// PUT /api/applications/:id/status — 更新申请状态（审核操作）
router.put('/:id/status', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status === undefined || ![0, 1, 2].includes(Number(status))) {
      return res.status(400).json({
        code: 400,
        message: '无效的审核状态值',
        data: null,
      });
    }

    const [apps] = await connection.execute(
      'SELECT * FROM applications WHERE id = ?',
      [id]
    );
    if (apps.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '未找到该申请记录',
        data: null,
      });
    }

    const app = apps[0];

    await connection.beginTransaction();

    try {
      // 审核通过时插入 players 表
      if (Number(status) === 1) {
        const insertSql = `
          INSERT INTO players (name, gender, city, service_type, game_type, \`rank\`, intro, hired_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        await connection.execute(insertSql, [
          app.name,
          app.gender || '',
          app.city || '',
          app.service_type || '游戏陪玩',
          app.game_type || '',
          app.rank || '',
          app.intro,
        ]);
      }

      await connection.execute(
        'UPDATE applications SET status = ? WHERE id = ?',
        [Number(status), id]
      );

      await connection.commit();

      res.status(200).json({
        code: 200,
        message: Number(status) === 1 ? '已通过并录入陪玩信息' : '状态已更新',
        data: null,
      });
    } catch (innerErr) {
      await connection.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('审核操作失败：', err);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null,
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
