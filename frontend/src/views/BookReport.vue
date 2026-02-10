<template>
  <div class="report-container">
    <div class="report-toolbar">
      <div class="report-toolbar-left">
        <el-button size="small" @click="goBack">返回</el-button>
        <div class="report-toolbar-title">分享导出</div>
      </div>
      <div class="report-toolbar-actions">
        <el-popover placement="bottom-end" trigger="click" width="220">
          <template #reference>
            <el-button size="small" :disabled="loading">明细列</el-button>
          </template>
          <div class="detail-column-panel">
            <el-checkbox-group v-model="checkedDetailColumns" class="detail-column-group">
              <el-checkbox v-for="col in detailColumnOptions" :key="col.value" :label="col.value">
                {{ col.label }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
        </el-popover>
        <el-button size="small" :loading="exporting" :disabled="loading" @click="downloadPng">导出长图</el-button>
        <el-button type="primary" size="small" :loading="exporting" :disabled="loading" @click="downloadPdf">
          导出 PDF
        </el-button>
      </div>
    </div>

    <div class="report-scroll">
      <div ref="reportRef" class="report-page">
        <div class="report-header">
          <div class="report-title">{{ book.name || '出行报告' }}</div>
          <div class="report-subtitle">
            <span v-if="dateRangeText">{{ dateRangeText }}</span>
            <span v-if="dateRangeText && createdText" class="report-split">·</span>
            <span v-if="createdText">{{ createdText }}</span>
          </div>
        </div>

        <div class="report-overview">
          <div class="overview-card">
            <div class="overview-label">实付总花销</div>
            <div class="overview-value">¥{{ formatAmount(totalPaidAmount) }}</div>
          </div>
          <div class="overview-card">
            <div class="overview-label">总节省</div>
            <div class="overview-value">¥{{ formatAmount(summary.totalSaved) }}</div>
          </div>
          <div class="overview-card">
            <div class="overview-label">记录数</div>
            <div class="overview-value">{{ summary.totalCount || 0 }}</div>
          </div>
        </div>

        <div class="report-grid">
          <div class="report-section">
            <div class="section-title">分类概览</div>
            <div v-if="summary.byCategory.length" class="stats-list">
              <div v-for="row in summary.byCategory.slice(0, 8)" :key="row.name" class="stats-row">
                <div class="stats-name">{{ categoryLabel(row.name) }}</div>
                <div class="stats-meta">{{ row.count || 0 }} 笔</div>
                <div class="stats-amount">¥{{ formatAmount(netAmount(row.totalAmount, row.savedAmount)) }}</div>
              </div>
            </div>
            <div v-else class="stats-empty">暂无数据</div>
          </div>

          <div class="report-section">
            <div class="section-title">渠道概览</div>
            <div v-if="summary.byPayChannel.length" class="stats-list">
              <div v-for="row in summary.byPayChannel.slice(0, 8)" :key="row.name" class="stats-row">
                <div class="stats-name">{{ payChannelLabel(row.name) }}</div>
                <div class="stats-meta">{{ row.count || 0 }} 笔</div>
                <div class="stats-amount">¥{{ formatAmount(netAmount(row.totalAmount, row.savedAmount)) }}</div>
              </div>
            </div>
            <div v-else class="stats-empty">暂无数据</div>
          </div>
        </div>

        <div class="report-section report-trend">
          <div class="section-title">每日花销趋势</div>
          <div class="trend-chart">
            <svg :viewBox="`0 0 ${trendView.width} ${trendView.height}`" preserveAspectRatio="none">
              <defs>
                <linearGradient id="reportTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#409eff" stop-opacity="0.22" />
                  <stop offset="100%" stop-color="#409eff" stop-opacity="0" />
                </linearGradient>
              </defs>

              <path v-if="trendAreaPath" :d="trendAreaPath" fill="url(#reportTrendFill)" stroke="none" />
              <path v-if="trendLinePath" :d="trendLinePath" fill="none" stroke="#409eff" stroke-width="3" />

              <g v-for="point in trendPoints" :key="point.key">
                <circle :cx="point.x" :cy="point.y" r="4" fill="#ffffff" stroke="#409eff" stroke-width="2" />
              </g>

              <g v-for="tick in trendTicks" :key="tick.key">
                <text :x="tick.x" :y="trendView.height - 10" font-size="12" fill="#909399" text-anchor="middle">
                  {{ tick.label }}
                </text>
              </g>

              <text x="12" y="16" font-size="12" fill="#909399">单位：¥</text>
            </svg>
          </div>
        </div>

        <div v-if="checkedDetailColumns.length" class="report-section report-detail">
          <div class="section-title">账单明细</div>
          <div v-if="detailItems.length" class="detail-table-wrap">
            <table class="detail-table">
              <thead>
                <tr>
                  <th v-for="col in visibleDetailColumns" :key="col.value" :class="`detail-col-${col.value}`">
                    {{ col.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in detailItems" :key="row.id">
                  <td v-for="col in visibleDetailColumns" :key="col.value" :class="`detail-col-${col.value}`">
                    {{ detailCellText(row, col.value) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="stats-empty">暂无数据</div>
        </div>

        <div class="report-section report-summary">
          <div class="section-title">出行总结</div>
          <div v-if="summaryText" class="summary-text">{{ summaryText }}</div>
          <div v-else class="summary-empty">暂无总结</div>
        </div>
      </div>
    </div>

    <el-dialog v-model="errorDialogVisible" title="导出失败" width="520px">
      <div class="error-dialog">{{ errorMessage }}</div>
      <template #footer>
        <el-button size="small" type="primary" @click="errorDialogVisible = false">知道了</el-button>
      </template>
    </el-dialog>

    <div v-loading="loading" class="report-loading" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { booksAPI, statsAPI, paymentChannelsAPI, expensesAPI } from '../utils/api'

const route = useRoute()
const router = useRouter()
const bookId = computed(() => String(route.params.id || '').trim())

const reportRef = ref(null)
const loading = ref(false)
const exporting = ref(false)
const errorDialogVisible = ref(false)
const errorMessage = ref('')

const book = ref({})
const payChannels = ref([])
const summary = ref({
  totalCount: 0,
  totalAmount: 0,
  totalSaved: 0,
  byCategory: [],
  byPayChannel: []
})
const dailyStats = ref([])
const detailItems = ref([])

const detailColumnOptions = [
  { label: '日期', value: 'date' },
  { label: '耗时', value: 'duration' },
  { label: '事项', value: 'title' },
  { label: '实付', value: 'paid' },
  { label: '备注', value: 'remark' }
]
const checkedDetailColumns = ref(detailColumnOptions.map((item) => item.value))
const visibleDetailColumns = computed(() =>
  detailColumnOptions.filter((item) => checkedDetailColumns.value.includes(item.value))
)

const trendView = {
  width: 720,
  height: 240
}

const trendPadding = {
  left: 32,
  right: 14,
  top: 18,
  bottom: 32
}

const netAmount = (totalAmount, savedAmount) => {
  const totalValue = Number(totalAmount || 0)
  const savedValue = Number(savedAmount || 0)
  const raw = totalValue - savedValue
  return raw < 0 ? 0 : raw
}

const formatAmount = (value) => {
  const numberValue = Number(value || 0)
  return numberValue.toFixed(2)
}

const totalPaidAmount = computed(() => netAmount(summary.value.totalAmount, summary.value.totalSaved))

const formatDateTime = (value) => {
  const raw = value ? new Date(value) : null
  if (!raw || Number.isNaN(raw.getTime())) {
    return ''
  }
  return raw.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const dateRangeText = computed(() => {
  const start = String(book.value?.start_date || '').trim()
  const end = String(book.value?.end_date || '').trim()
  if (start && end) {
    return `${start} ~ ${end}`
  }
  if (start) {
    return `开始：${start}`
  }
  if (end) {
    return `结束：${end}`
  }
  return ''
})

const createdText = computed(() => {
  return `生成时间：${formatDateTime(new Date())}`
})

const summaryText = computed(() => String(book.value?.summary ?? '').trim())

const detailCellText = (row, key) => {
  if (!row) {
    return ''
  }
  if (key === 'date') {
    return String(row.date || '')
  }
  if (key === 'duration') {
    const display = String(row.duration_display || '').trim()
    if (display) {
      return display
    }
    const minutes = Number(row.duration_minutes || 0)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return ''
    }
    return `${minutes}分钟`
  }
  if (key === 'title') {
    return String(row.title || '')
  }
  if (key === 'paid') {
    return `¥${formatAmount(netAmount(row.amount, row.discount_amount))}`
  }
  if (key === 'remark') {
    return String(row.remark || '')
  }
  return ''
}

const categoryLabel = (value) => {
  const map = {
    TRANSPORT: '交通',
    HOTEL: '住宿',
    FOOD: '餐饮',
    TICKET: '门票',
    SHOPPING: '购物',
    OTHER: '其他'
  }
  const raw = String(value || '').trim()
  return map[raw] || raw || '其他'
}

const payChannelLabel = (value) => {
  const raw = String(value || '').trim()
  const hit = payChannels.value.find((item) => String(item.value) === raw)
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
  return fallback[raw] || raw || '其他'
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
  const ordered = items.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
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

const goBack = () => {
  router.back()
}

const showError = (message) => {
  errorMessage.value = String(message || '导出失败')
  errorDialogVisible.value = true
}

const fileBaseName = computed(() => {
  const name = String(book.value?.name || '').trim() || '出行报告'
  return name.replace(/[\\/:*?"<>|]/g, '_')
})

const downloadBlob = (blob, filename) => {
  if (!blob) {
    return
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const renderCanvas = async () => {
  await nextTick()
  const node = reportRef.value
  if (!node) {
    throw new Error('报告内容不存在')
  }
  return html2canvas(node, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true
  })
}

const downloadPng = async () => {
  if (exporting.value) {
    return
  }
  exporting.value = true
  try {
    const canvas = await renderCanvas()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    downloadBlob(blob, `${fileBaseName.value}.png`)
    ElMessage.success('长图已导出')
  } catch (error) {
    showError(error?.message || '导出长图失败')
  } finally {
    exporting.value = false
  }
}

const downloadPdf = async () => {
  if (exporting.value) {
    return
  }
  exporting.value = true
  try {
    const canvas = await renderCanvas()
    const imageData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 18
    const contentWidth = pageWidth - margin * 2
    const contentHeight = pageHeight - margin * 2
    const scale = contentWidth / canvas.width
    const drawWidth = contentWidth
    const drawHeight = canvas.height * scale
    const pageCount = Math.max(1, Math.ceil(drawHeight / contentHeight))
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      if (pageIndex > 0) {
        pdf.addPage()
      }
      const y = margin - pageIndex * contentHeight
      pdf.addImage(imageData, 'PNG', margin, y, drawWidth, drawHeight, undefined, 'FAST')
    }
    pdf.save(`${fileBaseName.value}.pdf`)
    ElMessage.success('PDF 已导出')
  } catch (error) {
    showError(error?.message || '导出 PDF 失败')
  } finally {
    exporting.value = false
  }
}

const loadReportData = async () => {
  if (!bookId.value) {
    return
  }
  loading.value = true
  try {
    const [bookRes, payRes, summaryRes, dailyRes, detailRes] = await Promise.all([
      booksAPI.getBook(bookId.value),
      paymentChannelsAPI.getPaymentChannels(),
      statsAPI.getSummary(bookId.value),
      statsAPI.getDaily(bookId.value),
      loadAllExpenses()
    ])
    book.value = bookRes.data || {}
    payChannels.value = Array.isArray(payRes.data) ? payRes.data : []
    summary.value = summaryRes.data || summary.value
    dailyStats.value = Array.isArray(dailyRes.data) ? dailyRes.data : []
    detailItems.value = Array.isArray(detailRes) ? detailRes : []
  } catch (error) {
    showError(error?.message || '加载报告数据失败')
  } finally {
    loading.value = false
  }
}

const loadAllExpenses = async () => {
  const results = []
  let page = 1
  const pageSize = 100
  while (true) {
    const res = await expensesAPI.getExpenses(bookId.value, { page, pageSize })
    const items = res?.data?.items
    const list = Array.isArray(items) ? items : []
    results.push(...list)
    const totalPages = Number(res?.data?.pagination?.totalPages || 1)
    if (!Number.isFinite(totalPages) || page >= totalPages) {
      break
    }
    page += 1
  }
  return results
}

onMounted(() => {
  loadReportData()
})
</script>

<style scoped>
.report-container {
  width: 100%;
}

.report-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.report-toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.report-toolbar-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
}

.report-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.report-scroll {
  overflow-x: auto;
  padding-bottom: 12px;
}

.report-page {
  width: 794px;
  min-height: 1123px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #ebeef5;
  padding: 22px 26px;
  box-sizing: border-box;
}

.report-header {
  margin-bottom: 14px;
}

.report-title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  line-height: 1.25;
}

.report-subtitle {
  margin-top: 6px;
  color: #909399;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.report-split {
  opacity: 0.8;
}

.report-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.overview-card {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fbfcff;
}

.overview-label {
  color: #909399;
  font-size: 12px;
}

.overview-value {
  margin-top: 6px;
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}

.report-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.report-section {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 12px 14px;
  background: #ffffff;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 10px;
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 60px 120px;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fafcff;
}

.stats-name {
  font-size: 13px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-meta {
  text-align: right;
  font-size: 12px;
  color: #909399;
}

.stats-amount {
  text-align: right;
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
}

.stats-empty {
  color: #909399;
  font-size: 13px;
  padding: 18px 0;
  text-align: center;
}

.report-trend {
  margin-bottom: 12px;
}

.trend-chart {
  width: 100%;
  height: 230px;
  border-radius: 10px;
  background: #fafcff;
  overflow: hidden;
}

.trend-chart svg {
  width: 100%;
  height: 100%;
  display: block;
}

.report-detail {
  margin-bottom: 12px;
}

.detail-table-wrap {
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid #ebeef5;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.detail-table th,
.detail-table td {
  border-bottom: 1px solid #ebeef5;
  padding: 8px 10px;
  font-size: 12px;
  color: #303133;
  vertical-align: top;
  word-break: break-word;
}

.detail-table th {
  background: #fafcff;
  font-weight: 600;
}

.detail-table tr:last-child td {
  border-bottom: none;
}

.detail-col-date {
  width: 96px;
}

.detail-col-duration {
  width: 74px;
}

.detail-col-paid {
  width: 86px;
  text-align: right;
  white-space: nowrap;
}

.detail-column-panel {
  padding: 6px 4px;
}

.detail-column-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
}

.summary-text {
  white-space: pre-wrap;
  word-break: break-word;
  color: #303133;
  font-size: 13px;
  line-height: 1.6;
  padding: 8px 10px;
  background: #fafcff;
  border-radius: 10px;
}

.summary-empty {
  color: #909399;
  font-size: 13px;
  padding: 14px 0;
  text-align: center;
}

.report-loading {
  min-height: 1px;
}

.error-dialog {
  color: #303133;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
