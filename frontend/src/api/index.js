// =============================================
// API 接口封装
// =============================================
import request from './request';

// ---------- 认证 ----------
// 管理员登录
export const login = (password) => request.post('/auth/login', { password });
// 退出登录
export const logout = (token) =>
  request.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } });

// ---------- 申请 ----------
// 提交入职申请
export const submitApply = (data) => request.post('/apply', data);

// ---------- 管理（需鉴权） ----------
// 获取申请列表（支持 status 筛选）
export const getApplications = (status, token) =>
  request.get('/applications', {
    params: { status },
    headers: { Authorization: `Bearer ${token}` },
  });

// 审核操作（通过 / 拒绝）
export const updateApplicationStatus = (id, status, token) =>
  request.put(
    `/applications/${id}/status`,
    { status },
    { headers: { Authorization: `Bearer ${token}` } }
  );

// 开除陪玩
export const firePlayer = (id, token) =>
  request.delete(`/players/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// ---------- 陪玩展示（公开） ----------
// 获取已入职陪玩列表（支持搜索筛选）
export const getPlayers = (params = {}) => request.get('/players', { params });
