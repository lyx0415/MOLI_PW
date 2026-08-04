// =============================================
// 申请入职相关接口
// =============================================
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// POST /api/apply — 提交入职申请
router.post('/', async (req, res) => {
  try {
    const { name, phone, gender, city, service_type, game_type, rank, intro } = req.body;

    // 通用必填字段校验
    if (!name || !phone || !service_type) {
      return res.status(400).json({
        code: 400,
        message: '请填写所有必填字段（姓名、联系方式、服务类别）',
        data: null,
      });
    }

    // 若选择游戏陪玩，则游戏和段位为必填
    const isGaming = service_type === '游戏陪玩';
    if (isGaming && (!game_type || !rank)) {
      return res.status(400).json({
        code: 400,
        message: '游戏陪玩服务必须填写擅长游戏和段位',
        data: null,
      });
    }

    // 插入申请表，状态默认 0（待审核）
    const sql = `
      INSERT INTO applications (name, phone, gender, city, service_type, game_type, \`rank\`, intro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.execute(sql, [
      name.trim(),
      phone.trim(),
      (gender || '').trim(),
      (city || '').trim(),
      service_type.trim(),
      isGaming ? game_type.trim() : '',
      isGaming ? rank.trim() : '',
      (intro || '').trim(),
    ]);

    res.status(200).json({
      code: 200,
      message: '申请提交成功，请等待审核',
      data: { id: result.insertId },
    });
  } catch (err) {
    console.error('提交申请失败：', err);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误，请稍后再试',
      data: null,
    });
  }
});

module.exports = router;
