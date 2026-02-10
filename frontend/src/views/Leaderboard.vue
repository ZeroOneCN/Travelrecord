<template>
  <div class="leaderboard-container">
    <div class="header">
      <div>
        <h2 class="page-title">花销排行榜</h2>
        <div class="page-subtitle">汇总所有账本花销，并按实付金额排行</div>
      </div>
      <div class="header-actions">
        <el-button size="large" :loading="loading" @click="loadData">刷新</el-button>
      </div>
    </div>

    <div class="summary-grid">
      <el-card class="summary-card summary-card--highlight" shadow="never">
        <div class="summary-label">全部账本实付总花销</div>
        <div class="summary-value summary-value--highlight">¥{{ formatAmount(totalPaidAmount) }}</div>
        <div class="summary-sub">
          <span>原价 ¥{{ formatAmount(totals.totalAmount) }}</span>
          <span class="summary-split">·</span>
          <span>节省 ¥{{ formatAmount(totals.totalSaved) }}</span>
        </div>
      </el-card>
      <el-card class="summary-card" shadow="never">
        <div class="summary-label">全部记录数</div>
        <div class="summary-value">{{ totals.totalCount || 0 }}</div>
      </el-card>
      <el-card class="summary-card" shadow="never">
        <div class="summary-label">账本数量</div>
        <div class="summary-value">{{ items.length }}</div>
      </el-card>
    </div>

    <el-card class="content-card" shadow="never">
      <div class="card-title">账本花销排行</div>
      <el-table :data="rankedItems" size="default" style="width: 100%">
        <el-table-column label="#" width="66" align="right">
          <template #default="{ $index }">
            <span class="rank-index">{{ $index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="bookName" label="账本" min-width="220" />
        <el-table-column label="实付" min-width="220" align="right" sortable :sort-method="sortByPaid">
          <template #default="{ row }">
            <div class="stats-amount-main">¥{{ formatAmount(netAmount(row.totalAmount, row.totalSaved)) }}</div>
            <div class="stats-amount-sub">
              <span>原价 ¥{{ formatAmount(row.totalAmount) }}</span>
              <span class="stats-amount-split">·</span>
              <span>节省 ¥{{ formatAmount(row.totalSaved) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="totalCount" label="记录数" width="110" align="right" sortable />
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="goBook(row.bookId)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { statsAPI } from '../utils/api'

const router = useRouter()
const loading = ref(false)
const totals = ref({ totalCount: 0, totalAmount: 0, totalSaved: 0 })
const items = ref([])

const netAmount = (totalAmount, savedAmount) => {
  const totalValue = Number(totalAmount || 0)
  const savedValue = Number(savedAmount || 0)
  const raw = totalValue - savedValue
  return raw < 0 ? 0 : raw
}

const totalPaidAmount = computed(() => {
  return netAmount(totals.value.totalAmount, totals.value.totalSaved)
})

const rankedItems = computed(() => {
  const list = Array.isArray(items.value) ? items.value : []
  return list
    .slice()
    .sort((a, b) => netAmount(b.totalAmount, b.totalSaved) - netAmount(a.totalAmount, a.totalSaved))
})

const formatAmount = (value) => {
  const numberValue = Number(value || 0)
  if (!Number.isFinite(numberValue)) {
    return '0.00'
  }
  return numberValue.toFixed(2)
}

const goBook = (bookId) => {
  if (!bookId) {
    return
  }
  router.push(`/books/${bookId}`)
}

const sortByPaid = (a, b) => {
  return netAmount(a.totalAmount, a.totalSaved) - netAmount(b.totalAmount, b.totalSaved)
}

const loadData = async () => {
  if (loading.value) {
    return
  }
  try {
    loading.value = true
    const response = await statsAPI.getLeaderboard()
    const data = response.data || {}
    totals.value = data.totals || { totalCount: 0, totalAmount: 0, totalSaved: 0 }
    items.value = Array.isArray(data.items) ? data.items : []
  } catch (error) {
    ElMessage.error(error?.message || '加载排行榜失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.leaderboard-container {
  max-width: var(--app-page-max-width);
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.page-subtitle {
  margin-top: 6px;
  font-size: 14px;
  color: #909399;
}

.summary-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.summary-card {
  border-radius: 12px;
}

.summary-card--highlight {
  border-color: rgba(64, 158, 255, 0.35);
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.12), rgba(64, 158, 255, 0));
}

.summary-label {
  font-size: 14px;
  color: #909399;
}

.summary-value {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  line-height: 34px;
}

.summary-value--highlight {
  font-size: 36px;
  line-height: 44px;
  color: #409eff;
}

.summary-sub {
  margin-top: 10px;
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}

.summary-split {
  margin: 0 6px;
  color: #c0c4cc;
}

.content-card {
  border-radius: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.rank-index {
  font-weight: 700;
  color: #303133;
}

.stats-amount-main {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  line-height: 18px;
}

.stats-amount-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 16px;
  white-space: nowrap;
}

.stats-amount-split {
  margin: 0 6px;
}

@media (max-width: 960px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
