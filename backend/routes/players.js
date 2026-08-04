// =============================================
// 陪玩展示相关接口
// =============================================
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// GET /api/players — 获取已入职陪玩列表（公开，支持搜索筛选）
router.get('/', async (req, res) => {
  try {
    const { service_type, game_type, keyword } = req.query;

    let sql = 'SELECT * FROM players WHERE 1=1';
    const params = [];

    // 按服务类别筛选
    if (service_type) {
      sql += ' AND service_type = ?';
      params.push(service_type);
    }

    // 按擅长游戏筛选
    if (game_type) {
      sql += ' AND game_type = ?';
      params.push(game_type);
    }

    // 按姓名或简介关键词搜索
    if (keyword) {
      sql += ' AND (name LIKE ? OR intro LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY hired_at DESC';

    const [rows] = await pool.execute(sql, params);

    res.status(200).json({
      code: 200,
      message: '查询成功',
      data: rows,
    });
  } catch (err) {
    console.error('查询陪玩列表失败：', err);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null,
    });
  }
});

// DELETE /api/players/:id — 开除陪玩（需登录鉴权）
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM players WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        code: 404,
        message: '未找到该陪玩记录',
        data: null,
      });
    }

    res.status(200).json({
      code: 200,
      message: '该陪玩已被开除',
      data: null,
    });
  } catch (err) {
    console.error('开除陪玩失败：', err);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null,
    });
  }
});

module.exports = router;
