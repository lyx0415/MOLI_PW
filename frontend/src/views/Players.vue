<script setup>
// =============================================
// 茉莉陪玩官网 — 主页（陪玩展示）
// =============================================
import { ref, computed, onMounted, watch } from 'vue';
import { getPlayers } from '../api/index.js';

const players = ref([]);
const loading = ref(false);

// 搜索筛选
const filterServiceType = ref('');
const filterGameType = ref('');
const filterKeyword = ref('');

const serviceTypes = ['', '游戏陪玩', '线下健身陪练', '线下娱乐陪玩'];
const serviceLabels = { '': '全部服务', '游戏陪玩': '🎮 游戏陪玩', '线下健身陪练': '💪 健身陪练', '线下娱乐陪玩': '🎤 娱乐陪玩' };
const serviceIcons = { '游戏陪玩': '🎮', '线下健身陪练': '💪', '线下娱乐陪玩': '🎤' };

// 动态游戏列表（从玩家数据中提取）
const allGameTypes = computed(() => {
  const set = new Set();
  players.value.forEach(p => { if (p.game_type) set.add(p.game_type); });
  return ['', ...Array.from(set)];
});

// 统计
const stats = computed(() => ({
  total: players.value.length,
  games: new Set(players.value.filter(p => p.game_type).map(p => p.game_type)).size,
  cities: new Set(players.value.filter(p => p.city).map(p => p.city)).size || '多',
}));

// 加载
const loadPlayers = async () => {
  loading.value = true;
  try {
    const params = {};
    if (filterServiceType.value) params.service_type = filterServiceType.value;
    if (filterGameType.value) params.game_type = filterGameType.value;
    if (filterKeyword.value) params.keyword = filterKeyword.value;
    const res = await getPlayers(params);
    if (res.code === 200) players.value = res.data;
  } catch { /* ignore */ }
  finally { loading.value = false; }
};

// 筛选条件变化时重新加载
watch([filterServiceType, filterGameType, filterKeyword], () => {
  loadPlayers();
});

onMounted(loadPlayers);

// 游戏配色
const gameConfig = {
  '英雄联盟': { icon: '🏟️', color: '#e8c44a' }, '王者荣耀': { icon: '👑', color: '#d44a3a' },
  'CS2': { icon: '🎯', color: '#f0a030' }, '无畏契约': { icon: '⚡', color: '#e04040' },
  '原神': { icon: '✨', color: '#5eb0e5' }, '绝地求生': { icon: '🍗', color: '#f5a623' },
  '永劫无间': { icon: '⚔️', color: '#a0a0a0' }, 'DOTA2': { icon: '🛡️', color: '#c44a20' },
  'Apex英雄': { icon: '🔫', color: '#e04040' }, '守望先锋': { icon: '🦾', color: '#f99e1b' },
  '和平精英': { icon: '🔫', color: '#ffcc00' },
};

const getGame = (g) => gameConfig[g] || { icon: '🎮', color: '#7cb342' };

const serviceColor = (s) => {
  if (s === '游戏陪玩') return '#7cb342';
  if (s === '线下健身陪练') return '#f0a030';
  if (s === '线下娱乐陪玩') return '#e070a0';
  return '#999';
};
</script>

<template>
  <div class="home-page">
    <!-- ====== Hero 搜索区 ====== -->
    <section class="hero-section">
      <div class="hero-bg-deco">
        <span class="deco-flower deco-1">🌸</span>
        <span class="deco-flower deco-2">🌸</span>
        <span class="deco-flower deco-3">🍃</span>
        <span class="deco-flower deco-4">🌸</span>
        <span class="deco-flower deco-5">🍃</span>
      </div>
      <div class="hero-content">
        <p class="hero-tagline">🌸 专业陪玩服务平台</p>
        <h1 class="hero-title">茉莉陪玩</h1>
        <p class="hero-slogan">与君茉莉 · 忘君莫离</p>
        <p class="hero-desc">游戏陪玩 · 健身陪练 · 娱乐陪玩 — 三大服务，为你找到最合适的陪伴</p>

        <!-- 搜索筛选栏 -->
        <div class="search-bar">
          <!-- 服务类别 -->
          <div class="filter-btns">
            <button
              v-for="st in serviceTypes"
              :key="st"
              :class="['filter-btn', { active: filterServiceType === st }]"
              @click="filterServiceType = st"
            >
              {{ serviceLabels[st] }}
            </button>
          </div>
          <div class="filter-row">
            <el-input
              v-model="filterKeyword"
              placeholder="🔍 搜索姓名或关键词..."
              clearable
              size="large"
              class="keyword-input"
            />
            <el-select
              v-model="filterGameType"
              placeholder="按游戏筛选"
              clearable
              size="large"
              style="width: 180px"
              v-if="!filterServiceType || filterServiceType === '游戏陪玩'"
            >
              <el-option
                v-for="g in allGameTypes"
                :key="g"
                :label="g || '全部游戏'"
                :value="g"
              />
            </el-select>
          </div>
        </div>
      </div>
    </section>

    <!-- ====== 统计条 ====== -->
    <section class="stats-section">
      <div class="stats-inner">
        <div class="stat-item">
          <span class="stat-num">{{ stats.total }}</span>
          <span class="stat-label">在职陪玩</span>
        </div>
        <div class="stat-divider" />
        <div class="stat-item">
          <span class="stat-num">{{ stats.games }}</span>
          <span class="stat-label">覆盖游戏</span>
        </div>
        <div class="stat-divider" />
        <div class="stat-item">
          <span class="stat-num">{{ stats.cities }}</span>
          <span class="stat-label">服务城市</span>
        </div>
      </div>
    </section>

    <!-- ====== 卡片网格 ====== -->
    <section class="cards-section">
      <div v-loading="loading" class="card-grid">
        <template v-if="players.length === 0 && !loading">
          <el-empty description="还没有陪玩入驻，快来申请吧 🌸" style="grid-column: 1/-1; padding: 60px 0;" />
        </template>

        <div v-for="player in players" :key="player.id" class="player-card">
          <!-- 顶部色条 -->
          <div class="card-accent" :style="{ background: serviceColor(player.service_type) }" />

          <div class="card-body">
            <!-- 头像区 -->
            <div class="card-top">
              <div class="avatar-circle" :style="{ background: serviceColor(player.service_type) + '22' }">
                <span class="avatar-icon">{{ serviceIcons[player.service_type] || '🌸' }}</span>
              </div>
              <div class="card-names">
                <span class="player-name">{{ player.name }}</span>
                <span class="player-gender" v-if="player.gender">
                  {{ player.gender === '男' ? '🙋' : player.gender === '女' ? '🙋‍♀️' : '' }}
                </span>
              </div>
            </div>

            <!-- 服务标签 -->
            <div class="card-tags">
              <el-tag
                size="default"
                :color="serviceColor(player.service_type) + '20'"
                effect="plain"
                :style="{ borderColor: serviceColor(player.service_type), color: serviceColor(player.service_type) }"
              >
                {{ serviceIcons[player.service_type] || '' }} {{ player.service_type }}
              </el-tag>
              <template v-if="player.service_type === '游戏陪玩' && player.game_type">
                <el-tag size="default" effect="plain" type="info">
                  {{ getGame(player.game_type).icon }} {{ player.game_type }}
                </el-tag>
                <el-tag size="default" effect="plain" type="warning">
                  ⚡ {{ player.rank }}
                </el-tag>
              </template>
            </div>

            <!-- 城市 -->
            <div class="card-city" v-if="player.city">
              <span>📍</span><span>{{ player.city }}</span>
            </div>

            <!-- 简介 -->
            <p class="card-intro">{{ player.intro || '这个陪玩很神秘，什么也没有写...' }}</p>

            <!-- 入职时间 -->
            <div class="card-footer">
              🕐 {{ player.hired_at?.slice(0, 10) }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ====== 底部 CTA ====== -->
    <section class="cta-section">
      <div class="cta-inner">
        <h2>🌸 想加入茉莉陪玩？</h2>
        <p>无论你是游戏高手、健身达人还是娱乐陪伴，茉莉都欢迎你的加入</p>
        <el-button type="primary" size="large" round @click="$router.push('/apply')">
          立即申请入职
        </el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ========== Hero ========== */
.hero-section {
  background: linear-gradient(160deg, #f1f8e9 0%, #faf8f2 30%, #f5f0e3 60%, #e8f5e9 100%);
  padding: 80px 24px 60px;
  position: relative;
  overflow: hidden;
  text-align: center;
}

.hero-bg-deco {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.deco-flower {
  position: absolute;
  font-size: 36px;
  opacity: 0.12;
  animation: drift 20s ease-in-out infinite;
}
.deco-1 { top: 10%; left: 5%; animation-delay: 0s; font-size: 48px; }
.deco-2 { top: 20%; right: 8%; animation-delay: 4s; font-size: 32px; }
.deco-3 { bottom: 25%; left: 10%; animation-delay: 8s; font-size: 40px; }
.deco-4 { bottom: 15%; right: 15%; animation-delay: 12s; }
.deco-5 { top: 50%; left: 50%; animation-delay: 16s; }

@keyframes drift {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  33% { transform: translate(20px, -15px) rotate(5deg); }
  66% { transform: translate(-15px, 10px) rotate(-5deg); }
}

.hero-content {
  position: relative;
  z-index: 1;
  max-width: 900px;
  margin: 0 auto;
}

.hero-tagline {
  font-size: 14px;
  color: #7cb342;
  letter-spacing: 4px;
  margin: 0 0 8px;
  text-transform: uppercase;
}

.hero-title {
  font-size: 52px;
  font-weight: 800;
  background: linear-gradient(135deg, #33691e 0%, #558b2f 40%, #7cb342 70%, #aed581 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 6px;
  letter-spacing: 6px;
}

.hero-slogan {
  font-size: 18px;
  color: #c9a96e;
  font-style: italic;
  letter-spacing: 4px;
  margin: 0 0 16px;
}

.hero-desc {
  font-size: 15px;
  color: #8d8d8d;
  margin: 0 0 36px;
  line-height: 1.6;
}

/* 搜索栏 */
.search-bar {
  background: #fff;
  border-radius: 16px;
  padding: 24px 28px;
  box-shadow: 0 4px 24px rgba(85, 139, 47, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
  margin: 0 auto;
}

.filter-btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.filter-btn {
  padding: 8px 22px;
  border-radius: 24px;
  border: 2px solid #e8e8e8;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.25s;
  color: #666;
  font-weight: 500;
}

.filter-btn:hover {
  border-color: #aed581;
  color: #7cb342;
}

.filter-btn.active {
  background: linear-gradient(135deg, #7cb342, #558b2f);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 10px rgba(124, 179, 66, 0.3);
}

.filter-row {
  display: flex;
  gap: 12px;
}

.keyword-input {
  flex: 1;
}

/* ========== 统计条 ========== */
.stats-section {
  background: #fff;
  border-bottom: 1px solid #eee;
}

.stats-inner {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  gap: 40px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: 30px;
  font-weight: 800;
  color: #558b2f;
}

.stat-label {
  font-size: 13px;
  color: #999;
  margin-top: 2px;
}

.stat-divider {
  width: 1px;
  height: 36px;
  background: #e8e8e8;
}

/* ========== 卡片区 ========== */
.cards-section {
  max-width: 1260px;
  margin: 0 auto;
  padding: 40px 24px 20px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

.player-card {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 16px rgba(0,0,0,0.05);
  transition: transform 0.3s, box-shadow 0.3s;
}

.player-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 10px 36px rgba(85,139,47,0.12);
}

.card-accent { height: 4px; }

.card-body { padding: 20px 22px 18px; display: flex; flex-direction: column; gap: 12px; }

.card-top { display: flex; align-items: center; gap: 14px; }

.avatar-circle {
  width: 56px; height: 56px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 28px; flex-shrink: 0;
}

.card-names { display: flex; align-items: center; gap: 6px; }

.player-name { font-size: 20px; font-weight: 700; color: #303133; }
.player-gender { font-size: 18px; }

.card-tags { display: flex; gap: 8px; flex-wrap: wrap; }
.card-city { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #909399; }
.card-intro {
  color: #606266; font-size: 14px; line-height: 1.8; margin: 0;
  display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  min-height: 38px;
}
.card-footer { font-size: 12px; color: #c0c4cc; }

/* ========== CTA ========== */
.cta-section {
  background: linear-gradient(135deg, #558b2f 0%, #33691e 100%);
  margin-top: 40px;
  padding: 56px 24px;
  text-align: center;
}

.cta-inner {
  max-width: 500px;
  margin: 0 auto;
}

.cta-inner h2 {
  color: #fff;
  margin: 0 0 8px;
  font-size: 26px;
}

.cta-inner p {
  color: rgba(255,255,255,0.75);
  margin: 0 0 24px;
  font-size: 15px;
}

.cta-inner .el-button {
  --el-button-bg-color: #fff;
  --el-button-text-color: #558b2f;
  --el-button-border-color: #fff;
  font-weight: 600;
}
</style>
