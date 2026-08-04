<script setup>
// =============================================
// 申请入职页 — 茉莉陪玩
// =============================================
import { reactive, ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { submitApply } from '../api/index.js';

const formRef = ref(null);
const submitting = ref(false);

const form = reactive({
  name: '',
  phone: '',
  gender: '',
  city: '',
  service_type: '',
  game_type: '',
  rank: '',
  intro: '',
});

// 是否选择了游戏陪玩
const isGaming = computed(() => form.service_type === '游戏陪玩');

const serviceCards = [
  { value: '游戏陪玩', icon: '🎮', title: '游戏陪玩', desc: '英雄联盟、王者荣耀、CS2...', color: '#7cb342' },
  { value: '线下健身陪练', icon: '💪', title: '健身陪练', desc: '线下健身指导、运动陪练', color: '#f0a030' },
  { value: '线下娱乐陪玩', icon: '🎤', title: '娱乐陪玩', desc: 'K歌、逛街、桌游、聚会...', color: '#e070a0' },
];

const rules = computed(() => {
  const base = {
    name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
    phone: [{ required: true, message: '请输入联系方式', trigger: 'blur' }],
    service_type: [{ required: true, message: '请选择服务类别', trigger: 'change' }],
  };
  if (isGaming.value) {
    return {
      ...base,
      game_type: [{ required: true, message: '请选择或输入擅长游戏', trigger: 'change' }],
      rank: [{ required: true, message: '请选择或输入段位', trigger: 'change' }],
    };
  }
  return base;
});

const gameOptions = [
  '英雄联盟', '王者荣耀', 'CS2', '无畏契约', '原神', '绝地求生',
  '永劫无间', 'DOTA2', 'Apex英雄', '守望先锋', '和平精英',
  '崩坏：星穹铁道', '魔兽世界', '炉石传说', '其他',
];

const rankOptions = [
  '青铜', '白银', '黄金', '铂金', '钻石', '大师', '宗师', '王者', '无畏战神',
  '新锐', '精英', '专家', '传说', '神话',
];

const handleSubmit = async () => {
  if (!formRef.value) return;
  try { await formRef.value.validate(); } catch { return; }

  submitting.value = true;
  try {
    const res = await submitApply(form);
    if (res.code === 200) {
      ElMessage.success({ message: '🌸 ' + res.message, duration: 3000, center: true });
      formRef.value.resetFields();
      form.intro = '';
      form.service_type = '';
    } else {
      ElMessage.error(res.message);
    }
  } catch {
    ElMessage.error('提交失败，请检查网络连接');
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div class="apply-page">
    <!-- Hero -->
    <div class="page-hero">
      <h1 class="hero-title">🌸 加入茉莉陪玩</h1>
      <p class="hero-sub">选择你的服务方向，成为茉莉大家庭的一员</p>
    </div>

    <!-- 表单卡片 -->
    <div class="form-card">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
        size="large"
        style="max-width: 620px; margin: 0 auto;"
      >
        <!-- ===== 基本信息 ===== -->
        <div class="form-section-title">📌 基本信息</div>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="form.name" placeholder="你的称呼" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系方式" prop="phone">
              <el-input v-model="form.phone" placeholder="手机号 / 微信" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="性别">
              <el-radio-group v-model="form.gender">
                <el-radio-button value="男">🙋 男</el-radio-button>
                <el-radio-button value="女">🙋‍♀️ 女</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="常居地址">
              <el-input v-model="form.city" placeholder="如：上海" clearable />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- ===== 服务类别 ===== -->
        <div class="form-section-title">🎯 服务类别</div>

        <el-form-item prop="service_type" label-width="0" style="margin-bottom: 22px;">
          <div class="service-card-row">
            <div
              v-for="sc in serviceCards"
              :key="sc.value"
              :class="['service-card', { selected: form.service_type === sc.value }]"
              :style="form.service_type === sc.value ? { borderColor: sc.color, background: sc.color + '0a' } : {}"
              @click="form.service_type = sc.value"
            >
              <span class="sc-icon">{{ sc.icon }}</span>
              <span class="sc-title">{{ sc.title }}</span>
              <span class="sc-desc">{{ sc.desc }}</span>
            </div>
          </div>
        </el-form-item>

        <!-- ===== 游戏信息（仅游戏陪玩时显示）===== -->
        <template v-if="isGaming">
          <div class="form-section-title">🎮 游戏信息</div>

          <el-form-item label="擅长游戏" prop="game_type">
            <el-select
              v-model="form.game_type"
              placeholder="选择或输入你最擅长的游戏"
              filterable allow-create default-first-option
              style="width: 100%"
            >
              <el-option v-for="g in gameOptions" :key="g" :label="g" :value="g" />
            </el-select>
          </el-form-item>

          <el-form-item label="段位" prop="rank">
            <el-select
              v-model="form.rank"
              placeholder="选择或输入当前段位"
              filterable allow-create default-first-option
              style="width: 100%"
            >
              <el-option v-for="r in rankOptions" :key="r" :label="r" :value="r" />
            </el-select>
          </el-form-item>
        </template>

        <!-- ===== 自我介绍 ===== -->
        <div class="form-section-title">✨ 自我介绍</div>

        <el-form-item label-width="0">
          <el-input
            v-model="form.intro"
            type="textarea"
            :rows="5"
            placeholder="介绍一下自己的特长、风格和优势……让老板一眼相中你！"
            maxlength="500" show-word-limit
          />
        </el-form-item>

        <!-- 提交 -->
        <el-form-item label-width="0" style="margin-top: 8px;">
          <el-button
            type="primary"
            :loading="submitting"
            @click="handleSubmit"
            size="large" round
            style="width: 100%; height: 50px; font-size: 17px; letter-spacing: 3px;"
          >
            🌸 {{ submitting ? '提交中...' : '提交申请，加入茉莉' }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.apply-page {
  padding: 36px 20px 60px;
}

/* Hero */
.page-hero {
  text-align: center;
  margin-bottom: 30px;
}

.hero-title {
  font-size: 30px; font-weight: 700;
  background: linear-gradient(135deg, #558b2f, #7cb342);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  margin: 0 0 8px; letter-spacing: 2px;
}

.hero-sub {
  color: #9b9b9b; font-size: 15px; margin: 0;
}

/* 表单卡片 */
.form-card {
  background: #fff; border-radius: 16px; padding: 40px 36px;
  box-shadow: 0 4px 28px rgba(85,139,47,0.08); width: 100%; max-width: 700px;
  margin: 0 auto; border: 1px solid #e8f5e9;
}

.form-section-title {
  font-size: 14px; font-weight: 700; color: #558b2f;
  margin-bottom: 16px; padding-bottom: 10px; border-bottom: 2px dashed #e8f5e9;
  letter-spacing: 2px;
}

/* 服务类别卡片 */
.service-card-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  width: 100%;
}

.service-card {
  display: flex; flex-direction: column; align-items: center;
  padding: 18px 10px; border-radius: 12px; border: 2px solid #e8e8e8;
  cursor: pointer; transition: all 0.25s; text-align: center; gap: 4px;
}

.service-card:hover {
  border-color: #aed581; background: #f9fef5;
}

.service-card.selected {
  border-width: 2px;
}

.sc-icon { font-size: 30px; }
.sc-title { font-size: 15px; font-weight: 700; color: #303133; }
.sc-desc { font-size: 12px; color: #999; }

</style>
