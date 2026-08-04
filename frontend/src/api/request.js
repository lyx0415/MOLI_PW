// =============================================
// Axios 封装 — 统一请求实例
// =============================================
import axios from 'axios';

const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 响应拦截器：统一提取 data
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('请求失败：', error);
    return Promise.reject(error);
  }
);

export default request;
