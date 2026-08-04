<script setup>
// =============================================
// 后台管理页 — 需登录鉴权，可取消返回
// =============================================
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  login, logout,
  getApplications, updateApplicationStatus,
  getPlayers, firePlayer,
} from '../api/index.js';

const router = useRouter();

// ---------- 登录状态 ----------
const token = ref('');
const loginVisible = ref(true);
const loginPassword = ref('');
const loginLoading = ref(false);

onMounted(() => {
  const cached = sessionStorage.getItem('admin_token');
  if (cached) {
    token.value = cached;
    loginVisible.value = false;
    loadAll();
  }
});

const handleLogin = async () => {
  if (!loginPassword.value) { ElMessage.warning('请输入管理员密码'); return; }
  loginLoading.value = true;
  try {
    const res = await login(loginPassword.value);
    if (res.code === 200) {
      token.value = res.data.token;
      sessionStorage.setItem('admin_token', token.value);
      loginVisible.value = false;
      ElMessage.success('🌸 欢迎回来，管理员');
      loadAll();
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error('登录失败，请检查网络');
  } finally { loginLoading.value = false; }
};

// 取消登录 → 回到主页
const handleCancelLogin = () => {
  loginVisible.value = false;
  loginPassword.value = '';
  router.push('/players');
};

const handleLogout = async () => {
  try { await logout(token.value); } catch { /* ignore */ }
  token.value = '';
  sessionStorage.removeItem('admin_token');
  loginVisible.value = true;
  applications.value = [];
  players.value = [];
  ElMessage.info('已退出登录');
};

// ---------- 申请审核 ----------
const applications = ref([]);
const filterStatus = ref('');
const loadingApps = ref(false);

const loadApplications = async () => {
  loadingApps.value = true;
  try {
    const res = await getApplications(filterStatus.value, token.value);
    if (res.code === 200) applications.value = res.data;
    else if (res.code === 401) forceLogout();
  } catch { /* ignore */ }
  finally { loadingApps.value = false; }
};

const statusMap = {
  0: { text: '待审核', type: 'warning' },
  1: { text: '已通过', type: 'success' },
  2: { text: '已拒绝', type: 'danger' },
};

const serviceTypeMap = {
  '游戏陪玩': '🎮', '线下健身陪练': '💪', '线下娱乐陪玩': '🎤',
};

const handleReview = async (row, newStatus) => {
  const label = newStatus === 1 ? '通过' : '拒绝';
  const ok = await ElMessageBox.confirm(
    `确认${label}「${row.name}」的申请吗？`,
    '审核确认',
    { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
  ).catch(() => false);
  if (!ok) return;
  try {
    const res = await updateApplicationStatus(row.id, newStatus, token.value);
    if (res.code === 200) {
      ElMessage.success(res.message);
      loadApplications();
      loadPlayers();
    } else if (res.code === 401) { forceLogout(); }
    else { ElMessage.error(res.message); }
  } catch { ElMessage.error('操作失败'); }
};

const onFilterChange = () => loadApplications();

// ---------- 陪玩管理 ----------
const players = ref([]);
const loadingPlayers = ref(false);

const loadPlayers = async () => {
  loadingPlayers.value = true;
  try {
    const res = await getPlayers();
    if (res.code === 200) players.value = res.data;
  } catch { /* ignore */ }
  finally { loadingPlayers.value = false; }
};

const handleFire = async (player) => {
  const ok = await ElMessageBox.confirm(
    `确定开除「${player.name}」吗？此操作不可撤销。`,
    '开除确认',
    { confirmButtonText: '确认开除', cancelButtonText: '取消', type: 'error' }
  ).catch(() => false);
  if (!ok) return;
  try {
    const res = await firePlayer(player.id, token.value);
    if (res.code === 200) { ElMessage.success(`${player.name} 已被开除`); loadPlayers(); }
    else if (res.code === 401) { forceLogout(); }
    else { ElMessage.error(res.message); }
  } catch { ElMessage.error('操作失败'); }
};

const forceLogout = () => {
  token.value = '';
  sessionStorage.removeItem('admin_token');
  loginVisible.value = true;
  ElMessage.warning('登录已过期，请重新登录');
};

const loadAll = () => { loadApplications(); loadPlayers(); };
const activeTab = ref('applications');
</script>

<template>
  <div class="admin-page">
    <!-- ====== 登录弹窗（可取消）====== -->
    <el-dialog
      v-model="loginVisible"
      title="🔐 管理员登录"
      width="400px"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
      :show-close="true"
      @close="handleCancelLogin"
      center
    >
      <div class="login-dialog">
        <p class="login-tip">请输入管理员密码以进入后台</p>
        <el-input
          v-model="loginPassword"
          type="password"
          placeholder="管理员密码"
          show-password
          size="large"
          @keyup.enter="handleLogin"
        />
        <div class="login-actions">
          <el-button @click="handleCancelLogin" size="large" style="flex:1">
            取消
          </el-button>
          <el-button type="primary" :loading="loginLoading" @click="handleLogin" size="large" style="flex:1">
            {{ loginLoading ? '验证中...' : '登录' }}
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- ====== 已登录主界面 ====== -->
    <template v-if="!loginVisible">
      <div class="admin-header">
        <h2 class="admin-title">⚙️ 后台管理中心</h2>
        <el-button @click="handleLogout" text type="danger" size="small">退出登录</el-button>
      </div>

      <el-tabs v-model="activeTab" type="border-card" class="admin-tabs">
        <!-- Tab 1：申请审核 -->
        <el-tab-pane label="📋 申请审核" name="applications">
          <div class="tab-toolbar">
            <span class="tab-count">共 {{ applications.length }} 条</span>
            <el-select v-model="filterStatus" placeholder="筛选状态" clearable @change="onFilterChange" style="width:150px">
              <el-option label="全部" value="" />
              <el-option label="待审核" :value="0" />
              <el-option label="已通过" :value="1" />
              <el-option label="已拒绝" :value="2" />
            </el-select>
          </div>

          <el-table :data="applications" v-loading="loadingApps" border stripe empty-text="暂无申请记录">
            <el-table-column prop="id" label="ID" width="50" />
            <el-table-column prop="name" label="姓名" width="85" />
            <el-table-column prop="gender" label="性别" width="55" />
            <el-table-column prop="phone" label="联系方式" width="125" />
            <el-table-column label="服务类别" width="110">
              <template #default="{ row }">
                {{ serviceTypeMap[row.service_type] || '' }} {{ row.service_type }}
              </template>
            </el-table-column>
            <el-table-column prop="game_type" label="擅长游戏" width="100" />
            <el-table-column prop="rank" label="段位" width="75" />
            <el-table-column prop="city" label="常居地址" width="90" />
            <el-table-column prop="intro" label="自我介绍" min-width="150" show-overflow-tooltip />
            <el-table-column label="状态" width="85" align="center">
              <template #default="{ row }">
                <el-tag :type="statusMap[row.status].type" size="small">{{ statusMap[row.status].text }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="申请时间" width="155" />
            <el-table-column label="操作" width="170" align="center" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 0">
                  <el-button type="success" size="small" @click="handleReview(row, 1)">通过</el-button>
                  <el-button type="danger" size="small" @click="handleReview(row, 2)">拒绝</el-button>
                </template>
                <span v-else style="color:#c0c4cc;font-size:12px">已处理</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- Tab 2：在职陪玩 -->
        <el-tab-pane label="👥 在职陪玩" name="players">
          <div class="tab-toolbar">
            <span class="tab-count">共 {{ players.length }} 名在职</span>
          </div>

          <el-table :data="players" v-loading="loadingPlayers" border stripe empty-text="还没有陪玩入职">
            <el-table-column prop="id" label="ID" width="50" />
            <el-table-column prop="name" label="姓名" width="90" />
            <el-table-column prop="gender" label="性别" width="55" />
            <el-table-column label="服务类别" width="110">
              <template #default="{ row }">
                {{ serviceTypeMap[row.service_type] || '' }} {{ row.service_type }}
              </template>
            </el-table-column>
            <el-table-column prop="game_type" label="擅长游戏" width="100" />
            <el-table-column prop="rank" label="段位" width="75" />
            <el-table-column prop="city" label="常居地址" width="90" />
            <el-table-column prop="intro" label="自我介绍" min-width="160" show-overflow-tooltip />
            <el-table-column prop="hired_at" label="入职时间" width="155" />
            <el-table-column label="操作" width="90" align="center" fixed="right">
              <template #default="{ row }">
                <el-popconfirm
                  :title="`开除「${row.name}」？`"
                  confirm-button-text="确认"
                  cancel-button-text="取消"
                  @confirm="handleFire(row)"
                >
                  <template #reference>
                    <el-button type="danger" size="small" plain>开除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<style scoped>
.admin-page { padding: 30px 24px; max-width: 1400px; margin: 0 auto; }

/* 登录弹窗 */
.login-dialog { padding: 10px 0; }
.login-tip { text-align: center; color: #909399; margin: 0 0 16px; font-size: 14px; }
.login-actions { display: flex; gap: 12px; margin-top: 20px; }

/* 顶栏 */
.admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.admin-title { margin: 0; font-size: 24px; color: #303133; }

/* 标签页 */
.admin-tabs { box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tab-count { color: #909399; font-size: 14px; }

:deep(.el-table) { min-width: 950px; }
</style>
