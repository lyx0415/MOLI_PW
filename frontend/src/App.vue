<script setup>
// =============================================
// 根组件 — 茉莉陪玩 品牌导航
// =============================================
import { useRoute } from 'vue-router';
import { computed } from 'vue';

const route = useRoute();

const navItems = [
  { path: '/players', label: '🌸 陪玩展示', desc: '精英阵容' },
  { path: '/apply', label: '📝 申请入职', desc: '加入我们' },
  { path: '/admin', label: '⚙️ 后台管理', desc: '系统管理' },
];

const activePath = computed(() => route.path);
</script>

<template>
  <div class="app-container">
    <!-- 顶部品牌导航 -->
    <header class="app-header">
      <div class="header-inner">
        <!-- 左侧品牌 -->
        <router-link to="/" class="brand-area">
          <span class="brand-icon">🌸</span>
          <span class="brand-name">茉莉陪玩</span>
        </router-link>

        <!-- 中间标语 -->
        <div class="slogan-area">
          <span class="slogan-text">与君茉莉</span>
          <span class="slogan-divider">·</span>
          <span class="slogan-text">忘君莫离</span>
        </div>

        <!-- 右侧导航 -->
        <nav class="nav-links">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: activePath === item.path }"
          >
            <span class="nav-label">{{ item.label }}</span>
            <span class="nav-desc">{{ item.desc }}</span>
          </router-link>
        </nav>
      </div>
    </header>

    <!-- 主体内容 -->
    <main class="app-main">
      <router-view />
    </main>

    <!-- 页脚 -->
    <footer class="app-footer">
      <div class="footer-inner">
        <span class="footer-brand">🌸 茉莉陪玩</span>
        <span class="footer-slogan">与君茉莉 · 忘君莫离</span>
        <span class="footer-copy">© 2024 茉莉陪玩官网 · 游戏陪玩 | 健身陪练 | 娱乐陪玩</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ========== 顶部导航 ========== */
.app-header {
  background: linear-gradient(135deg, #ffffff 0%, #faf8f2 100%);
  box-shadow: 0 2px 16px rgba(85, 139, 47, 0.08);
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 2px solid #e8f5e9;
}

.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

/* -- 品牌 -- */
.brand-area {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  flex-shrink: 0;
}

.brand-icon {
  font-size: 32px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.brand-name {
  font-size: 22px;
  font-weight: 700;
  color: #558b2f;
  letter-spacing: 2px;
}

/* -- 标语 -- */
.slogan-area {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.slogan-text {
  font-size: 14px;
  color: #8d8d8d;
  font-style: italic;
  letter-spacing: 2px;
}

.slogan-divider {
  color: #c9a96e;
  font-weight: bold;
}

/* -- 导航 -- */
.nav-links {
  display: flex;
  gap: 8px;
}

.nav-item {
  text-decoration: none;
  color: #606266;
  padding: 8px 16px;
  border-radius: 10px;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.3;
}

.nav-label {
  font-size: 14px;
  font-weight: 600;
}

.nav-desc {
  font-size: 11px;
  color: #b0b0b0;
  transition: color 0.3s;
}

.nav-item:hover {
  background: #f1f8e9;
  color: #7cb342;
}

.nav-item:hover .nav-desc {
  color: #aed581;
}

.nav-item.active {
  background: linear-gradient(135deg, #7cb342, #558b2f);
  color: #fff;
  box-shadow: 0 4px 12px rgba(124, 179, 66, 0.3);
}

.nav-item.active .nav-desc {
  color: rgba(255, 255, 255, 0.8);
}

/* ========== 主体 ========== */
.app-main {
  flex: 1;
}

/* ========== 页脚 ========== */
.app-footer {
  background: linear-gradient(135deg, #3e4e2e 0%, #2d3a1f 100%);
  margin-top: 60px;
}

.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
  color: #c5c8b6;
  font-size: 13px;
}

.footer-brand {
  font-weight: 700;
  color: #aed581;
  font-size: 15px;
}

.footer-slogan {
  font-style: italic;
  letter-spacing: 2px;
}

.footer-copy {
  opacity: 0.7;
}
</style>
