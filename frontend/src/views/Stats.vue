<template>
  <div class="stats-container">
    <div class="header">
      <div>
        <h2 class="page-title">统计分析</h2>
        <div class="page-subtitle">查看账本花销统计与趋势</div>
      </div>
      <div class="header-actions">
        <el-select v-model="selectedBookId" placeholder="请选择账本" size="large" style="width: 360px" @change="handleBookChange">
          <el-option
            v-for="book in books"
            :key="book.id"
            :label="book.name"
          :value="String(book.id)"
          />
        </el-select>
        <el-button size="large" @click="showPayChannelDialog = true">
          渠道管理
        </el-button>
        <el-button type="primary" size="large" :disabled="!selectedBookId" @click="handleExport">
          导出数据
        </el-button>
      </div>
    </div>

    <div class="summary-grid">
      <el-card class="summary-card" shadow="never">
        <div class="summary-label">实付总花销</div>
        <div class="summary-value">¥{{ formatAmount(totalPaidAmount) }}</div>
      </el-card>
      <el-card class="summary-card" shadow="never">
        <div class="summary-label">总节省</div>
        <div class="summary-value">¥{{ formatAmount(summary.totalSaved) }}</div>
      </el-card>
      <el-card class="summary-card" shadow="never">
        <div class="summary-label">记录数</div>
        <div class="summary-value">{{ summary.totalCount || 0 }}</div>
      </el-card>
      <el-card class="summary-card" shadow="never">
        <div class="summary-label">最大分类</div>
        <div class="summary-value">{{ topCategoryName }}</div>
      </el-card>
      <el-card class="summary-card" shadow="never">
        <div class="summary-label">最大渠道</div>
        <div class="summary-value">{{ topPayChannelName }}</div>
      </el-card>
    </div>

    <el-row :gutter="20" class="detail-row">
      <el-col :span="12">
        <el-card class="content-card" shadow="never">
          <div class="card-title">按分类统计</div>
          <el-table :data="summary.byCategory" size="default" style="width: 100%">
            <el-table-column prop="name" label="分类" min-width="120">
              <template #default="{ row }">
                {{ categoryLabel(row.name) }}
              </template>
            </el-table-column>
            <el-table-column prop="count" label="记录数" width="96" align="right" />
            <el-table-column label="金额" min-width="220" align="right">
              <template #default="{ row }">
                <div class="stats-amount-main">¥{{ formatAmount(netAmount(row.totalAmount, row.savedAmount)) }}</div>
                <div class="stats-amount-sub">
                  <span>原价 ¥{{ formatAmount(row.totalAmount) }}</span>
                  <span class="stats-amount-split">·</span>
                  <span>节省 ¥{{ formatAmount(row.savedAmount) }}</span>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="content-card" shadow="never">
          <div class="card-title">按支付渠道统计</div>
          <el-table :data="summary.byPayChannel" size="default" style="width: 100%">
            <el-table-column prop="name" label="渠道" min-width="120">
              <template #default="{ row }">
                {{ payChannelLabel(row.name) }}
              </template>
            </el-table-column>
            <el-table-column prop="count" label="记录数" width="96" align="right" />
            <el-table-column label="金额" min-width="220" align="right">
              <template #default="{ row }">
                <div class="stats-amount-main">¥{{ formatAmount(netAmount(row.totalAmount, row.savedAmount)) }}</div>
                <div class="stats-amount-sub">
                  <span>原价 ¥{{ formatAmount(row.totalAmount) }}</span>
                  <span class="stats-amount-split">·</span>
                  <span>节省 ¥{{ formatAmount(row.savedAmount) }}</span>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="content-card" shadow="never">
      <div class="card-title">每日花销趋势</div>
      <div class="trend-chart">
        <svg
          ref="trendSvgRef"
          :viewBox="`0 0 ${trendView.width} ${trendView.height}`"
          preserveAspectRatio="none"
          @mousemove="handleTrendMouseMove"
          @mouseleave="handleTrendMouseLeave"
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#409eff" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#409eff" stop-opacity="0" />
            </linearGradient>
          </defs>

          <path v-if="trendAreaPath" :d="trendAreaPath" fill="url(#trendFill)" stroke="none" />
          <path v-if="trendLinePath" :d="trendLinePath" fill="none" stroke="#409eff" stroke-width="3" />

          <g v-for="point in trendPoints" :key="point.key">
            <circle :cx="point.x" :cy="point.y" r="4" fill="#ffffff" stroke="#409eff" stroke-width="2" />
          </g>

          <g v-for="point in trendLabelPoints" :key="point.key">
            <text
              :x="point.x"
              :y="Math.max(14, point.y - 10)"
              class="trend-point-label"
              text-anchor="middle"
            >
              ¥{{ formatAmount(point.value) }}
            </text>
          </g>

          <g v-if="activeTrendPoint">
            <line
              :x1="activeTrendPoint.x"
              :x2="activeTrendPoint.x"
              :y1="trendPadding.top"
              :y2="trendView.height - trendPadding.bottom"
              stroke="#c0c4cc"
              stroke-width="1"
              stroke-dasharray="4 4"
            />
            <circle
              :cx="activeTrendPoint.x"
              :cy="activeTrendPoint.y"
              r="6"
              fill="#ffffff"
              stroke="#409eff"
              stroke-width="2"
            />
            <g :transform="`translate(${tooltipPosition.x}, ${tooltipPosition.y})`">
              <rect
                :width="tooltipSize.width"
                :height="tooltipSize.height"
                rx="8"
                ry="8"
                fill="#ffffff"
                stroke="#dcdfe6"
              />
              <text x="12" y="18" font-size="12" fill="#303133">
                {{ activeTrendPoint.label }}
              </text>
              <text x="12" y="38" font-size="14" fill="#409eff" font-weight="600">
                ¥{{ formatAmount(activeTrendPoint.value) }}
              </text>
            </g>
          </g>

          <g v-for="tick in trendTicks" :key="tick.key">
            <text :x="tick.x" :y="trendView.height - 10" font-size="12" fill="#909399" text-anchor="middle">
              {{ tick.label }}
            </text>
          </g>

          <text x="14" y="18" font-size="12" fill="#909399">
            单位：¥
          </text>
        </svg>
      </div>
    </el-card>

    <el-dialog v-model="showPayChannelDialog" title="支付渠道管理" width="640px">
      <div class="pay-channel-create">
        <el-input v-model="payChannelCreate.value" placeholder="渠道标识（例如：CREDIT_CARD）" />
        <el-input v-model="payChannelCreate.label" placeholder="显示名称（例如：信用卡）" />
        <el-button type="primary" @click="handleCreatePayChannel">新增</el-button>
      </div>

      <el-table :data="payChannels" size="default" style="width: 100%">
        <el-table-column prop="value" label="标识" width="220" />
        <el-table-column label="名称" min-width="220">
          <template #default="{ row }">
            <el-input v-if="editingPayChannelId === row.id" v-model="editingPayChannelLabel" />
            <span v-else>{{ row.label }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center">
          <template #default="{ row }">
            <el-button
              v-if="editingPayChannelId !== row.id"
              size="small"
              type="primary"
              plain
              @click="startEditPayChannel(row)"
            >
              编辑
            </el-button>
            <el-button
              v-else
              size="small"
              type="primary"
              @click="saveEditPayChannel(row)"
            >
              保存
            </el-button>
            <el-button v-if="editingPayChannelId === row.id" size="small" @click="cancelEditPayChannel">
              取消
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { booksAPI, statsAPI, paymentChannelsAPI } from '../utils/api'

const route = useRoute()
const router = useRouter()
const books = ref([])
const selectedBookId = ref('')
const trendSvgRef = ref(null)
const activeTrendKey = ref('')
const showPayChannelDialog = ref(false)
const payChannels = ref([])
const payChannelCreate = ref({ value: '', label: '' })
const editingPayChannelId = ref(null)
const editingPayChannelLabel = ref('')
const summary = ref({
  totalCount: 0,
  totalAmount: 0,
  totalSaved: 0,
  byCategory: [],
  byPayChannel: []
})
const dailyStats = ref([])

const trendView = {
  width: 1000,
  height: 320
}

const trendPadding = {
  left: 40,
  right: 18,
  top: 24,
  bottom: 38
}

const totalPaidAmount = computed(() => {
  return netAmount(summary.value.totalAmount, summary.value.totalSaved)
})

const netAmount = (totalAmount, savedAmount) => {
  const totalValue = Number(totalAmount || 0)
  const savedValue = Number(savedAmount || 0)
  const raw = totalValue - savedValue
  return raw < 0 ? 0 : raw
}

const formatDateLabel = (value) => {
  const raw = String(value || '')
  const parts = raw.split('-')
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[2] || ''}`.replace(/\/$/, '')
  }
  return raw
}

const trendData = computed(() => {
  const items = Array.isArray(dailyStats.value) ? dailyStats.value : []
  const ordered = items
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  return ordered.slice(Math.max(0, ordered.length - 30))
})

const trendPoints = computed(() => {
  const width = trendView.width - trendPadding.left - trendPadding.right
  const height = trendView.height - trendPadding.top - trendPadding.bottom
  const items = trendData.value
  if (!items.length) {
    return []
  }
  const values = items.map((item) => netAmount(item.totalAmount, item.savedAmount))
  const maxValue = Math.max(1, ...values)
  const step = items.length === 1 ? 0 : width / (items.length - 1)
  return items.map((item, index) => {
    const value = netAmount(item.totalAmount, item.savedAmount)
    const ratio = value / maxValue
    return {
      key: String(item.date || index),
      label: formatDateLabel(item.date),
      value,
      x: trendPadding.left + step * index,
      y: trendPadding.top + (1 - ratio) * height
    }
  })
})

const buildSmoothPath = (points) => {
  if (!points.length) {
    return ''
  }
  if (points.length === 1) {
    const only = points[0]
    return `M ${only.x} ${only.y}`
  }
  const path = [`M ${points[0].x} ${points[0].y}`]
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    path.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`)
  }
  return path.join(' ')
}

const trendLinePath = computed(() => buildSmoothPath(trendPoints.value))

const trendAreaPath = computed(() => {
  const points = trendPoints.value
  if (!points.length) {
    return ''
  }
  const baselineY = trendView.height - trendPadding.bottom
  const linePath = buildSmoothPath(points)
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`
})

const trendLabelPoints = computed(() => {
  const points = trendPoints.value
  if (points.length <= 10) {
    return points
  }
  const maxPoints = 8
  const step = Math.ceil(points.length / maxPoints)
  const picked = new Map()
  picked.set(points[0].key, points[0])
  picked.set(points[points.length - 1].key, points[points.length - 1])
  for (let i = 0; i < points.length; i += step) {
    picked.set(points[i].key, points[i])
  }
  const list = Array.from(picked.values()).sort((a, b) => a.x - b.x)
  return list
})

const activeTrendPoint = computed(() => {
  if (!activeTrendKey.value) {
    return null
  }
  return trendPoints.value.find((point) => point.key === activeTrendKey.value) || null
})

const tooltipSize = computed(() => {
  if (!activeTrendPoint.value) {
    return { width: 0, height: 0 }
  }
  const label = String(activeTrendPoint.value.label || '')
  const width = Math.max(92, label.length * 7 + 40)
  return { width, height: 52 }
})

const tooltipPosition = computed(() => {
  if (!activeTrendPoint.value) {
    return { x: 0, y: 0 }
  }
  const point = activeTrendPoint.value
  const gap = 12
  const y = Math.max(trendPadding.top, point.y - tooltipSize.value.height - gap)
  let x = point.x + gap
  if (x + tooltipSize.value.width > trendView.width - trendPadding.right) {
    x = point.x - tooltipSize.value.width - gap
  }
  x = Math.max(trendPadding.left, Math.min(x, trendView.width - trendPadding.right - tooltipSize.value.width))
  return { x, y }
})

const handleTrendMouseMove = (event) => {
  const svgEl = trendSvgRef.value
  if (!svgEl || !trendPoints.value.length) {
    activeTrendKey.value = ''
    return
  }
  const rect = svgEl.getBoundingClientRect()
  const ratioX = rect.width ? (event.clientX - rect.left) / rect.width : 0
  const xInView = Math.max(0, Math.min(1, ratioX)) * trendView.width
  let nearest = trendPoints.value[0]
  let minDistance = Math.abs(nearest.x - xInView)
  for (const point of trendPoints.value) {
    const distance = Math.abs(point.x - xInView)
    if (distance < minDistance) {
      minDistance = distance
      nearest = point
    }
  }
  activeTrendKey.value = nearest?.key || ''
}

const handleTrendMouseLeave = () => {
  activeTrendKey.value = ''
}

const trendTicks = computed(() => {
  const points = trendPoints.value
  if (points.length <= 1) {
    return points.map((point) => ({ key: point.key, x: point.x, label: point.label }))
  }
  const tickCount = Math.min(6, points.length)
  const step = Math.max(1, Math.floor((points.length - 1) / (tickCount - 1)))
  const ticks = []
  for (let i = 0; i < points.length; i += step) {
    ticks.push(points[i])
  }
  if (ticks[ticks.length - 1]?.key !== points[points.length - 1]?.key) {
    ticks.push(points[points.length - 1])
  }
  return ticks.map((point) => ({ key: point.key, x: point.x, label: point.label }))
})

const categoryLabel = (value) => {
  const map = {
    TRANSPORT: '交通',
    HOTEL: '住宿',
    FOOD: '餐饮',
    TICKET: '门票',
    SHOPPING: '购物',
    OTHER: '其他'
  }
  return map[value] || value || '其他'
}

const payChannelLabel = (value) => {
  const hit = payChannels.value.find((item) => String(item.value) === String(value))
  if (hit) {
    return hit.label
  }
  const fallback = {
    ALIPAY: '支付宝',
    WECHAT: '微信',
    UNIONPAY: '银联',
    CASH: '现金',
    DOUYIN_MONTHLY: '抖音月付',
    MEITUAN_MONTHLY: '美团月付',
    OTHER: '其他'
  }
  return fallback[value] || value || '其他'
}

const topCategoryName = computed(() => {
  if (!summary.value.byCategory?.length) {
    return '暂无'
  }
  return categoryLabel(summary.value.byCategory[0].name)
})

const topPayChannelName = computed(() => {
  if (!summary.value.byPayChannel?.length) {
    return '暂无'
  }
  return payChannelLabel(summary.value.byPayChannel[0].name)
})

const formatAmount = (value) => {
  const numberValue = Number(value || 0)
  return numberValue.toFixed(2)
}

const loadBooks = async () => {
  try {
    const response = await booksAPI.getBooks()
    books.value = response.data || []
    const queryBookId = route.query.bookId
    const lastBookId = localStorage.getItem('last_book_id')
    const fallbackId = books.value[0]?.id
    selectedBookId.value = queryBookId || lastBookId || (fallbackId ? String(fallbackId) : '')
  } catch (error) {
    ElMessage.error('加载账本失败')
  }
}

const loadPayChannels = async () => {
  try {
    const response = await paymentChannelsAPI.getPaymentChannels()
    payChannels.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    payChannels.value = []
  }
}

const handleCreatePayChannel = async () => {
  const value = String(payChannelCreate.value.value || '').trim()
  const label = String(payChannelCreate.value.label || '').trim()
  if (!value || !label) {
    ElMessage.warning('请填写渠道标识与名称')
    return
  }
  try {
    await paymentChannelsAPI.createPaymentChannel({ value, label })
    payChannelCreate.value = { value: '', label: '' }
    await loadPayChannels()
    ElMessage.success('新增成功')
  } catch (error) {
    ElMessage.error(error?.message || '新增失败')
  }
}

const startEditPayChannel = (row) => {
  editingPayChannelId.value = row.id
  editingPayChannelLabel.value = row.label
}

const cancelEditPayChannel = () => {
  editingPayChannelId.value = null
  editingPayChannelLabel.value = ''
}

const saveEditPayChannel = async (row) => {
  const label = String(editingPayChannelLabel.value || '').trim()
  if (!label) {
    ElMessage.warning('请填写名称')
    return
  }
  try {
    await paymentChannelsAPI.updatePaymentChannel(row.id, { label })
    await loadPayChannels()
    cancelEditPayChannel()
    ElMessage.success('保存成功')
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  }
}

const loadStats = async () => {
  if (!selectedBookId.value) {
    summary.value = { totalCount: 0, totalAmount: 0, totalSaved: 0, byCategory: [], byPayChannel: [] }
    dailyStats.value = []
    return
  }
  try {
    const [summaryRes, dailyRes] = await Promise.all([
      statsAPI.getSummary(selectedBookId.value),
      statsAPI.getDaily(selectedBookId.value)
    ])
    summary.value = summaryRes.data || summary.value
    dailyStats.value = dailyRes.data || []
  } catch (error) {
    ElMessage.error('加载统计数据失败')
  }
}

const handleBookChange = (value) => {
  localStorage.setItem('last_book_id', String(value || ''))
  router.replace({ name: 'Stats', query: value ? { bookId: value } : {} })
}

const handleExport = async () => {
  if (!selectedBookId.value) {
    ElMessage.warning('请先选择账本')
    return
  }
  try {
    const response = await statsAPI.exportBook(selectedBookId.value)
    const blob =
      response instanceof Blob
        ? response
        : new Blob([response], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const bookName = books.value.find((item) => String(item.id) === String(selectedBookId.value))?.name || 'book'
    link.download = `${bookName}-export.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

watch(selectedBookId, () => {
  loadStats()
})

onMounted(async () => {
  await loadBooks()
  await loadPayChannels()
  await loadStats()
})
</script>

<style scoped>
.stats-container {
  max-width: var(--app-page-max-width);
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  color: #303133;
  font-size: 22px;
  font-weight: 600;
}

.page-subtitle {
  margin-top: 6px;
  color: #909399;
  font-size: 14px;
}

.summary-row {
  margin-bottom: 20px;
}

.summary-grid {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.summary-card {
  border-radius: 12px;
  padding: 16px;
  flex: 1;
  min-width: 220px;
}

.summary-label {
  color: #909399;
  font-size: 14px;
  margin-bottom: 8px;
}

.summary-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.detail-row {
  margin-bottom: 20px;
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

.trend-chart {
  width: 100%;
  height: 320px;
}

.trend-chart svg {
  width: 100%;
  height: 320px;
  display: block;
}

.trend-point-label {
  font-size: 12px;
  fill: #303133;
  paint-order: stroke;
  stroke: #ffffff;
  stroke-width: 3px;
  stroke-linejoin: round;
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

.pay-channel-create {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
</style>
