<template>
  <div class="book-detail-container">
    <!-- 账本信息头部 -->
    <div class="book-header">
      <div class="book-info">
        <h2 class="page-title">{{ book.name }}</h2>
        <p class="book-description">{{ book.description || '暂无描述' }}</p>
        <p class="book-meta">
          创建时间: {{ formatDate(book.created_at) }} |
          更新时间: {{ formatDate(book.updated_at || book.created_at) }}
        </p>
        <p class="book-meta book-meta-amounts">
          实付总花销: <span class="total-amount">¥{{ totalAmount.toFixed(2) }}</span> |
          总节省: <span class="total-saved">¥{{ totalSaved.toFixed(2) }}</span>
        </p>
      </div>
      <div class="header-actions">
        <el-tag v-if="isReadOnly" type="info" effect="plain">预览模式</el-tag>
        <el-button v-if="!isReadOnly" size="small" type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          添加花销
        </el-button>
        <div v-if="!isReadOnly" class="header-toggle">
          <span class="header-toggle-label">预览</span>
          <el-switch
            v-model="previewEnabled"
            :loading="previewStatusLoading"
            inline-prompt
            active-text="开"
            inactive-text="关"
            @change="handlePreviewToggle"
          />
        </div>
        <div v-if="!isReadOnly" class="header-toggle">
          <span class="header-toggle-label">票据</span>
          <el-switch
            v-model="previewShowReceipts"
            :loading="previewSettingsLoading"
            inline-prompt
            active-text="开"
            inactive-text="关"
            @change="handlePreviewReceiptsToggle"
          />
        </div>
        <el-tooltip content="预览链接有效期 30 天，过期后重新开启预览即可继续访问" placement="top">
          <el-button v-if="!isReadOnly" size="small" :disabled="!previewEnabled" @click="copyPreviewLink">
            预览链接
          </el-button>
        </el-tooltip>
        <el-button v-if="!isReadOnly" size="small" @click="goReport">
          分享导出
        </el-button>
        <el-button v-if="!isReadOnly" size="small" @click="goStats">
          查看统计
        </el-button>
      </div>
    </div>

    <el-card class="content-card summary-card" shadow="never">
      <div class="book-summary">
        <div class="book-summary-title">出行总结</div>
        <div v-if="isReadOnly" class="book-summary-preview">
          <div v-if="summaryDisplay" class="book-summary-text">{{ summaryDisplay }}</div>
          <div v-else class="book-summary-empty">暂无总结</div>
        </div>
        <div v-else class="book-summary-editor">
          <el-input
            v-model="summaryDraft"
            type="textarea"
            :rows="4"
            placeholder="记录这次出行的复盘：哪些地方做得好/哪些地方可以优化/下次的行动清单…"
            resize="vertical"
          />
          <div class="book-summary-actions">
            <el-button size="small" type="primary" :loading="summarySaving" @click="saveSummary">保存总结</el-button>
            <el-button size="small" :disabled="summarySaving" @click="resetSummaryDraft">重置</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 花销记录表格 -->
    <el-card class="content-card" shadow="never">
      <div class="table-filters">
        <el-input
          v-model="expenseFilters.keyword"
          size="small"
          placeholder="搜索：事项/备注/交通信息"
          clearable
          class="filter-item filter-keyword"
          @keyup.enter="applyExpenseFilters"
        />
        <el-date-picker
          v-model="expenseFilters.dateRange"
          size="small"
          type="daterange"
          range-separator="~"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          clearable
          class="filter-item filter-date"
        />
        <el-select v-model="expenseFilters.category" size="small" placeholder="分类" clearable class="filter-item filter-select">
          <el-option v-for="option in categoryOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-select v-model="expenseFilters.pay_channel" size="small" placeholder="支付方式" clearable class="filter-item filter-select">
          <el-option v-for="option in payChannelOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <div class="filter-actions">
          <el-button size="small" type="primary" @click="applyExpenseFilters">搜索</el-button>
          <el-button size="small" @click="resetExpenseFilters">重置</el-button>
        </div>
      </div>
      <div class="table-scroll-area">
        <el-scrollbar ref="topScrollbarRef" class="table-top-scroll">
          <div ref="topScrollInnerRef" class="table-top-scroll-inner" />
        </el-scrollbar>
        <el-table ref="tableRef" :data="expenses" size="large" style="width: 100%" v-loading="loading">
      <el-table-column prop="date" label="日期" width="120">
        <template #default="{ row }">
          {{ formatDate(row.date).split(' ')[0] }}
        </template>
      </el-table-column>
      <el-table-column prop="time_range" label="时间段" width="140" />
      <el-table-column prop="duration_minutes" label="耗时" width="120">
        <template #default="{ row }">
          {{ formatDurationDisplay(row.duration_minutes, row.duration_display) }}
        </template>
      </el-table-column>
      <el-table-column prop="category" label="分类" width="72" show-overflow-tooltip>
        <template #default="{ row }">
          {{ categoryLabel(row.category) }}
        </template>
      </el-table-column>
      <el-table-column prop="project" label="事项/项目" min-width="180" />
      <el-table-column prop="original_cost" label="原价" width="100">
        <template #default="{ row }">
          ¥{{ row.original_cost.toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="cost" label="实付" width="100">
        <template #default="{ row }">
          ¥{{ row.cost.toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="discount" label="优惠" width="100">
        <template #default="{ row }">
          ¥{{ row.discount.toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="discount_note" label="优惠说明" width="140" show-overflow-tooltip />
      <el-table-column prop="vehicle" label="交通信息" width="140" />
      <el-table-column prop="platform" label="支付方式" width="120">
        <template #default="{ row }">
          {{ payChannelLabel(row.platform) }}
        </template>
      </el-table-column>
      <el-table-column prop="remarks" label="备注" min-width="200" />
      <el-table-column v-if="!isReadOnly || previewShowReceipts" label="票据" width="72" fixed="right">
        <template #default="{ row }">
          <el-tooltip content="票据" placement="top">
            <el-button size="small" plain circle @click="openAttachments(row)">
              <el-icon><Picture /></el-icon>
            </el-button>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column v-if="!isReadOnly" label="操作" width="96" fixed="right">
        <template #default="{ row }">
          <div class="action-buttons">
            <el-tooltip content="编辑" placement="top">
              <el-button size="small" type="primary" plain circle @click="editExpense(row)">
                <el-icon><Edit /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button size="small" type="danger" plain circle @click="deleteExpense(row)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
        </el-table>
      </div>
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="totalCount"
          layout="prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="showAttachmentsDialog" title="票据附件" width="720px" @closed="resetAttachmentsDialog">
      <div v-loading="attachmentsLoading" class="attachments-dialog">
        <div v-if="activeExpenseForAttachments" class="attachments-header">
          <div class="attachments-expense-title">{{ activeExpenseForAttachments.project }}</div>
          <div class="attachments-expense-subtitle">
            {{ formatDate(activeExpenseForAttachments.date).split(' ')[0] }} · ¥{{ activeExpenseForAttachments.cost.toFixed(2) }}
          </div>
        </div>
        <div v-if="attachments.length" class="attachments-grid">
          <div v-for="item in attachments" :key="item.id" class="attachment-item">
            <el-image
              :src="item.url"
              :preview-src-list="attachmentsPreviewUrls"
              :initial-index="attachments.findIndex((row) => row.id === item.id)"
              fit="cover"
              class="attachment-image"
            />
            <div class="attachment-meta">
              <div class="attachment-name" :title="item.original_name || item.file_name">
                {{ item.original_name || item.file_name }}
              </div>
              <div class="attachment-size">{{ formatBytes(item.size_bytes) }}</div>
            </div>
            <el-button
              v-if="!isReadOnly"
              size="small"
              type="danger"
              plain
              @click="deleteAttachment(item)"
            >
              删除
            </el-button>
          </div>
        </div>
        <el-empty v-else description="暂无票据附件" />
      </div>
      <template #footer>
        <div class="attachments-footer">
          <el-upload v-if="!isReadOnly" :show-file-list="false" :before-upload="handleAttachmentSelect">
            <el-button type="primary" :loading="uploadingAttachment">上传票据</el-button>
          </el-upload>
          <el-button @click="showAttachmentsDialog = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 添加/编辑花销对话框 -->
    <el-dialog 
      v-if="!isReadOnly"
      v-model="showCreateDialog" 
      :title="isEditing ? '编辑花销记录' : '添加花销记录'" 
      width="720px"
      @closed="handleDialogClose"
    >
      <el-form :model="expenseForm" :rules="formRules" ref="expenseFormRef" label-width="110px">
        <el-form-item label="日期" prop="date">
          <el-date-picker
            v-model="expenseForm.date"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        
        <el-form-item label="时间段" prop="timeStart">
          <div class="time-range-input">
            <el-time-picker
              v-model="expenseForm.timeStart"
              placeholder="开始时间"
              format="HH:mm"
              value-format="HH:mm"
              @change="validateTimeRangeField"
              style="flex: 1"
            />
            <span class="time-range-separator">-</span>
            <el-time-picker
              v-model="expenseForm.timeEnd"
              placeholder="结束时间"
              format="HH:mm"
              value-format="HH:mm"
              @change="validateTimeRangeField"
              style="flex: 1"
            />
          </div>
        </el-form-item>
        
        <el-form-item label="时长(分钟)" prop="duration_minutes">
          <el-input-number 
            v-model="expenseForm.duration_minutes" 
            :min="0" 
            :step="1" 
            :precision="0"
            :disabled="true"
            style="width: 100%"
          />
        </el-form-item>
        
        <el-form-item label="分类" prop="category">
          <el-select v-model="expenseForm.category" placeholder="请选择分类" style="width: 100%">
            <el-option v-for="option in categoryOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="事项/项目" prop="project">
          <el-input v-model="expenseForm.project" placeholder="例如：午餐/景区门票/酒店住宿/网约车" />
        </el-form-item>
        
        <el-form-item label="费用" prop="cost">
          <el-input-number 
            v-model="expenseForm.cost" 
            :min="0" 
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="优惠(节省)" prop="discount_amount">
          <el-input-number
            v-model="expenseForm.discount_amount"
            :min="0"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="优惠说明" prop="discount_note">
          <el-input v-model="expenseForm.discount_note" placeholder="例如：积分兑换/满减/支付立减" />
        </el-form-item>
        
        <el-form-item v-if="expenseForm.category === 'TRANSPORT'" label="交通信息" prop="vehicle">
          <el-input v-model="expenseForm.vehicle" placeholder="例如：地铁2号线/网约车/航班MU1234/车牌" />
        </el-form-item>
        
        <el-form-item label="支付方式" prop="platform">
          <el-select v-model="expenseForm.platform" placeholder="请选择支付方式" style="width: 100%">
            <el-option v-for="option in payChannelOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="备注" prop="remarks">
          <el-input 
            v-model="expenseForm.remarks" 
            type="textarea" 
            :rows="3" 
            placeholder="请输入备注信息"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showCreateDialog = false">取消</el-button>
          <el-button type="primary" @click="submitExpense">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Back, Edit, Delete, Picture } from '@element-plus/icons-vue'
import { booksAPI, expensesAPI, statsAPI, paymentChannelsAPI, previewBooksAPI } from '../utils/api'

const route = useRoute()
const router = useRouter()
const bookId = route.params.id
const isReadOnly = computed(() => Boolean(route.meta?.readOnly))

const book = ref({})
const expenses = ref([])
const loading = ref(false)
const showCreateDialog = ref(false)
const isEditing = ref(false)
const previewEnabled = ref(false)
const previewStatusLoading = ref(false)
const previewShowReceipts = ref(false)
const previewSettingsLoading = ref(false)
const previewId = ref('')
const expenseFormRef = ref()
const tableRef = ref()
const topScrollbarRef = ref()
const topScrollInnerRef = ref()
const pageSize = 10
const currentPage = ref(1)
const totalCount = ref(0)
const summary = ref({ totalAmount: 0, totalSaved: 0 })
const summaryDraft = ref('')
const summarySaving = ref(false)
const summaryDisplay = computed(() => String(book.value?.summary ?? '').trim())
const showAttachmentsDialog = ref(false)
const activeExpenseForAttachments = ref(null)
const attachmentsLoading = ref(false)
const uploadingAttachment = ref(false)
const attachments = ref([])
const attachmentsPreviewUrls = computed(() => attachments.value.map((item) => item.url).filter(Boolean))
const expenseFilters = reactive({
  keyword: '',
  dateRange: [],
  category: '',
  pay_channel: ''
})
let tableWrapEl = null
let topWrapEl = null
let syncingScroll = false
let scrollSyncAttached = false
let handleBottomScroll = null
let handleTopScroll = null
const builtInPayChannelOptions = [
  { label: '支付宝', value: 'ALIPAY' },
  { label: '微信', value: 'WECHAT' },
  { label: '银联', value: 'UNIONPAY' },
  { label: '现金', value: 'CASH' },
  { label: '抖音月付', value: 'DOUYIN_MONTHLY' },
  { label: '美团月付', value: 'MEITUAN_MONTHLY' },
  { label: '其他', value: 'OTHER' }
]
const payChannelOptions = ref([...builtInPayChannelOptions])
const categoryOptions = [
  { label: '交通', value: 'TRANSPORT' },
  { label: '住宿', value: 'HOTEL' },
  { label: '餐饮', value: 'FOOD' },
  { label: '门票', value: 'TICKET' },
  { label: '购物', value: 'SHOPPING' },
  { label: '其他', value: 'OTHER' }
]

const expenseForm = reactive({
  date: '',
  timeStart: '',
  timeEnd: '',
  duration_minutes: 0,
  duration_display: '',
  category: '',
  project: '',
  cost: 0,
  discount_amount: 0,
  discount_note: '',
  vehicle: '',
  platform: '',
  remarks: ''
})

const validateTimeRange = (rule, value, callback) => {
  if (!expenseForm.timeStart || !expenseForm.timeEnd) {
    callback(new Error('请选择开始与结束时间'))
    return
  }
  callback()
}

const validateVehicle = (rule, value, callback) => {
  if (expenseForm.category === 'TRANSPORT' && !value) {
    callback(new Error('交通类花销需要填写交通信息'))
    return
  }
  callback()
}

const validateDiscountAmount = (rule, value, callback) => {
  if (value === null || value === undefined || value === '') {
    callback()
    return
  }
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    callback(new Error('优惠金额需为非负数字'))
    return
  }
  const amountValue = Number(expenseForm.cost || 0)
  if (Number.isFinite(amountValue) && numberValue > amountValue) {
    callback(new Error('优惠金额不能大于原价'))
    return
  }
  callback()
}

const formRules = {
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  timeStart: [{ validator: validateTimeRange, trigger: 'change' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  project: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
  cost: [{ required: true, message: '请输入费用', trigger: 'blur' }],
  discount_amount: [{ validator: validateDiscountAmount, trigger: 'blur' }],
  vehicle: [{ validator: validateVehicle, trigger: 'blur' }]
}

const totalAmount = computed(() => {
  const originalValue = Number(summary.value.totalAmount || 0)
  const savedValue = Number(summary.value.totalSaved || 0)
  const paid = originalValue - savedValue
  return paid < 0 ? 0 : paid
})

const totalSaved = computed(() => Number(summary.value.totalSaved || 0))

const payChannelLabel = (value) => {
  const option = payChannelOptions.value.find((item) => item.value === value)
  return option ? option.label : value || '其他'
}

const categoryLabel = (value) => {
  const option = categoryOptions.find((item) => item.value === value)
  return option ? option.label : value || '其他'
}

const parseTime = (value) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return null
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }
  return hour * 60 + minute
}

const parseTimeRange = (value) => {
  const raw = String(value || '')
  const parts = raw.split('-').map((item) => item.trim())
  if (parts.length !== 2) {
    return []
  }
  return [parts[0], parts[1]]
}

const formatDurationDisplay = (durationMinutes, durationDisplay) => {
  const minutesValue = Number(durationMinutes)
  if (Number.isFinite(minutesValue) && minutesValue > 0) {
    const hours = Math.floor(minutesValue / 60)
    const restMinutes = minutesValue % 60
    if (hours > 0 && restMinutes > 0) {
      return `${hours}h${restMinutes}min`
    }
    if (hours > 0) {
      return `${hours}h`
    }
    return `${minutesValue}min`
  }
  return durationDisplay || '0min'
}

const recalcDurationFromTimeRange = () => {
  const start = parseTime(expenseForm.timeStart)
  const end = parseTime(expenseForm.timeEnd)
  if (start === null || end === null) {
    expenseForm.duration_minutes = 0
    expenseForm.duration_display = ''
    return
  }
  let diff = end - start
  if (diff < 0) {
    diff += 24 * 60
  }
  expenseForm.duration_minutes = diff
  expenseForm.duration_display = formatDurationDisplay(diff, '')
}

const mapExpenseFromApi = (item) => ({
  id: item.id,
  date: item.date || '',
  time_range: item.time_range || '',
  duration_minutes: item.duration_minutes || 0,
  duration_display: item.duration_display || '',
  category: item.category || '',
  project: item.title || '',
  original_cost: Number(item.amount || 0),
  discount: Number(item.discount_amount || 0),
  cost: Math.max(0, Number(item.amount || 0) - Number(item.discount_amount || 0)),
  discount_note: item.discount_note || '',
  vehicle: item.vehicle_no || '',
  platform: item.pay_channel || '',
  remarks: item.remark || ''
})

const mapExpenseToApi = (form) => {
  const timeRangeString = form.timeStart && form.timeEnd ? `${form.timeStart}-${form.timeEnd}` : null
  const durationMinutesValue = Number(form.duration_minutes || 0)
  const discountAmountValue = form.discount_amount === null || form.discount_amount === undefined ? 0 : Number(form.discount_amount)
  return {
    date: form.date,
    time_range: timeRangeString,
    duration_minutes: durationMinutesValue || null,
    duration_display: durationMinutesValue ? formatDurationDisplay(durationMinutesValue, '') : null,
    title: form.project,
    amount: form.cost,
    discount_amount: Number.isFinite(discountAmountValue) ? discountAmountValue : 0,
    discount_note: form.discount_note || null,
    currency: 'CNY',
    vehicle_no: form.vehicle || null,
    pay_channel: form.platform || null,
    category: form.category || null,
    remark: form.remarks || null
  }
}

const validateTimeRangeField = () => {
  expenseFormRef.value?.validateField('timeStart')
}

const loadSummary = async () => {
  try {
    const summaryRes = isReadOnly.value
      ? await previewBooksAPI.getSummary(bookId)
      : await statsAPI.getSummary(bookId)
    const data = summaryRes.data || {}
    summary.value = {
      totalAmount: Number(data.totalAmount || 0),
      totalSaved: Number(data.totalSaved || 0)
    }
    totalCount.value = Number(data.totalCount || 0)
  } catch (error) {
    summary.value = { totalAmount: 0, totalSaved: 0 }
    totalCount.value = 0
  }
}

const loadExpenses = async () => {
  const range = Array.isArray(expenseFilters.dateRange) ? expenseFilters.dateRange : []
  const dateFrom = range?.[0] || null
  const dateTo = range?.[1] || null
  const params = {
    page: currentPage.value,
    pageSize,
    keyword: String(expenseFilters.keyword || '').trim() || undefined,
    category: expenseFilters.category || undefined,
    pay_channel: expenseFilters.pay_channel || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined
  }
  const response = isReadOnly.value
    ? await previewBooksAPI.getExpenses(bookId, params)
    : await expensesAPI.getExpenses(bookId, params)
  const items = response.data?.items || []
  const pagination = response.data?.pagination || {}
  totalCount.value = Number(pagination.total || totalCount.value || 0)
  expenses.value = items.map(mapExpenseFromApi)
}

const loadAttachments = async (expenseId) => {
  attachmentsLoading.value = true
  try {
    const response = isReadOnly.value
      ? await previewBooksAPI.getAttachments(bookId, expenseId)
      : await expensesAPI.getAttachments(expenseId)
    attachments.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    attachments.value = []
    ElMessage.error(error?.message || '加载附件失败')
  } finally {
    attachmentsLoading.value = false
  }
}

const openAttachments = async (row) => {
  activeExpenseForAttachments.value = row
  showAttachmentsDialog.value = true
  await loadAttachments(row.id)
}

const resetAttachmentsDialog = () => {
  activeExpenseForAttachments.value = null
  attachments.value = []
  attachmentsLoading.value = false
  uploadingAttachment.value = false
}

const handleAttachmentSelect = async (file) => {
  if (isReadOnly.value) {
    return false
  }
  const expenseId = activeExpenseForAttachments.value?.id
  if (!expenseId || uploadingAttachment.value) {
    return false
  }
  uploadingAttachment.value = true
  try {
    await expensesAPI.uploadAttachment(expenseId, file)
    await loadAttachments(expenseId)
    ElMessage.success('上传成功')
  } catch (error) {
    ElMessage.error(error?.message || '上传失败')
  } finally {
    uploadingAttachment.value = false
  }
  return false
}

const deleteAttachment = async (attachment) => {
  if (isReadOnly.value) {
    return
  }
  const expenseId = activeExpenseForAttachments.value?.id
  if (!expenseId || !attachment?.id) {
    return
  }
  try {
    await ElMessageBox.confirm('确认删除该附件吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await expensesAPI.deleteAttachment(expenseId, attachment.id)
    await loadAttachments(expenseId)
    ElMessage.success('删除成功')
  } catch (error) {
    if (error === 'cancel') {
      return
    }
    ElMessage.error(error?.message || '删除失败')
  }
}

const loadPayChannels = async () => {
  if (isReadOnly.value) {
    payChannelOptions.value = builtInPayChannelOptions.slice()
    return
  }
  try {
    const response = await paymentChannelsAPI.getPaymentChannels()
    const channels = Array.isArray(response.data) ? response.data : []
    const defaults = builtInPayChannelOptions.slice()
    if (!channels.length) {
      payChannelOptions.value = defaults
      return
    }
    const map = new Map(defaults.map((item) => [String(item.value), { ...item }]))
    for (const item of channels) {
      if (!item?.value) {
        continue
      }
      map.set(String(item.value), { label: item.label || String(item.value), value: String(item.value) })
    }
    payChannelOptions.value = Array.from(map.values())
  } catch (error) {
    payChannelOptions.value = payChannelOptions.value
  }
}

const syncTopScrollWidth = () => {
  if (!tableWrapEl || !topScrollInnerRef.value) {
    return
  }
  const width = tableWrapEl.scrollWidth
  topScrollInnerRef.value.style.width = `${width}px`
}

const attachScrollSync = async () => {
  await nextTick()
  if (scrollSyncAttached) {
    syncTopScrollWidth()
    return
  }
  const tableEl = tableRef.value?.$el
  const wrap = tableEl?.querySelector('.el-scrollbar__wrap')
  const topEl = topScrollbarRef.value?.$el
  const topWrap = topEl?.querySelector('.el-scrollbar__wrap')
  if (!wrap || !topWrap) {
    return
  }
  tableWrapEl = wrap
  topWrapEl = topWrap
  syncTopScrollWidth()

  handleBottomScroll = () => {
    if (syncingScroll) {
      return
    }
    syncingScroll = true
    topWrapEl.scrollLeft = tableWrapEl.scrollLeft
    syncingScroll = false
  }

  handleTopScroll = () => {
    if (syncingScroll) {
      return
    }
    syncingScroll = true
    tableWrapEl.scrollLeft = topWrapEl.scrollLeft
    syncingScroll = false
  }

  tableWrapEl.addEventListener('scroll', handleBottomScroll, { passive: true })
  topWrapEl.addEventListener('scroll', handleTopScroll, { passive: true })
  window.addEventListener('resize', syncTopScrollWidth, { passive: true })
  scrollSyncAttached = true

}

onBeforeUnmount(() => {
  if (!scrollSyncAttached) {
    return
  }
  tableWrapEl?.removeEventListener('scroll', handleBottomScroll)
  topWrapEl?.removeEventListener('scroll', handleTopScroll)
  window.removeEventListener('resize', syncTopScrollWidth)
  scrollSyncAttached = false
})

// 加载账本信息和花销记录
const loadBookData = async () => {
  loading.value = true
  try {
    const bookResponse = isReadOnly.value
      ? await previewBooksAPI.getBook(bookId)
      : await booksAPI.getBook(bookId)
    book.value = bookResponse.data
    if (isReadOnly.value) {
      previewShowReceipts.value = Boolean(book.value?.show_receipts)
    }
    summaryDraft.value = String(book.value?.summary ?? '')
    await Promise.all([loadPayChannels(), loadSummary(), loadExpenses()])
    await attachScrollSync()
  } catch (error) {
    ElMessage.error('加载数据失败')
    console.error('加载数据失败:', error)
  } finally {
    loading.value = false
  }
}

const formatBytes = (value) => {
  const raw = Number(value || 0)
  if (!Number.isFinite(raw) || raw <= 0) {
    return '0B'
  }
  if (raw < 1024) return `${Math.round(raw)}B`
  const kb = raw / 1024
  if (kb < 1024) return `${kb.toFixed(1)}KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)}MB`
  const gb = mb / 1024
  return `${gb.toFixed(1)}GB`
}

// 提交花销记录（添加或编辑）
const submitExpense = async () => {
  try {
    if (isReadOnly.value) {
      ElMessage.warning('预览模式不可修改数据')
      return
    }
    await expenseFormRef.value.validate()
    recalcDurationFromTimeRange()

    const expenseData = mapExpenseToApi(expenseForm)
    
    if (isEditing.value) {
      await expensesAPI.updateExpense(expenseForm.id, expenseData)
      ElMessage.success('更新成功')
    } else {
      await expensesAPI.createExpense(bookId, expenseData)
      ElMessage.success('添加成功')
      currentPage.value = 1
    }
    
    showCreateDialog.value = false
    resetForm()
    loadBookData()
  } catch (error) {
    if (error.errors) {
      return
    }
    ElMessage.error(isEditing.value ? '更新失败' : '添加失败')
    console.error('操作失败:', error)
  }
}

// 编辑花销记录
const editExpense = (expense) => {
  if (isReadOnly.value) {
    ElMessage.warning('预览模式不可修改数据')
    return
  }
  isEditing.value = true
  const range = parseTimeRange(expense.time_range)
  Object.assign(expenseForm, {
    id: expense.id,
    date: expense.date,
    timeStart: range[0] || '',
    timeEnd: range[1] || '',
    duration_minutes: Number(expense.duration_minutes || 0),
    duration_display: expense.duration_display || '',
    category: expense.category,
    project: expense.project,
    cost: expense.original_cost,
    discount_amount: Number(expense.discount || 0),
    discount_note: expense.discount_note || '',
    vehicle: expense.vehicle,
    platform: expense.platform,
    remarks: expense.remarks
  })
  recalcDurationFromTimeRange()
  showCreateDialog.value = true
}

// 删除花销记录
const deleteExpense = async (expense) => {
  try {
    if (isReadOnly.value) {
      ElMessage.warning('预览模式不可修改数据')
      return
    }
    await ElMessageBox.confirm(
      `确定要删除这条花销记录吗？`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    await expensesAPI.deleteExpense(expense.id)
    ElMessage.success('删除成功')
    if (currentPage.value > 1 && expenses.value.length === 1) {
      currentPage.value -= 1
    }
    loadBookData()
  } catch (error) {
    if (error === 'cancel') {
      return
    }
    ElMessage.error('删除失败')
    console.error('删除失败:', error)
  }
}

const handlePageChange = (page) => {
  currentPage.value = page
  loadExpenses()
}

const goStats = () => {
  router.push({ name: 'Stats', query: { bookId } })
}

const goReport = () => {
  router.push({ name: 'BookReport', params: { id: bookId } })
}

const handleBack = () => {
  if (isReadOnly.value) {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/login')
    return
  }
  router.push({ name: 'Books' })
}

const loadPreviewStatus = async () => {
  try {
    const response = await booksAPI.getPreviewStatus(bookId)
    previewEnabled.value = Boolean(response.data?.enabled)
    previewId.value = String(response.data?.preview_id || '').trim()
    previewShowReceipts.value = Boolean(response.data?.show_receipts)
  } catch (error) {
    previewEnabled.value = false
    previewId.value = ''
    previewShowReceipts.value = false
  }
}

const handlePreviewReceiptsToggle = async (value) => {
  if (previewSettingsLoading.value || isReadOnly.value) {
    return
  }
  const enabled = Boolean(value)
  const previous = !enabled
  previewSettingsLoading.value = true
  try {
    await booksAPI.setPreviewSettings(bookId, { show_receipts: enabled })
    previewShowReceipts.value = enabled
    ElMessage.success(enabled ? '预览票据已开启' : '预览票据已关闭')
  } catch (error) {
    previewShowReceipts.value = previous
    ElMessage.error(error?.message || '更新预览票据失败')
  } finally {
    previewSettingsLoading.value = false
  }
}

const handlePreviewToggle = async (value) => {
  if (previewStatusLoading.value) {
    return
  }
  const enabled = Boolean(value)
  const previous = !enabled
  previewStatusLoading.value = true
  try {
    const response = await booksAPI.setPreviewStatus(bookId, { enabled })
    previewEnabled.value = enabled
    previewId.value = String(response.data?.preview_id || previewId.value || '').trim()
    ElMessage.success(enabled ? '预览已开启' : '预览已关闭')
  } catch (error) {
    previewEnabled.value = previous
    ElMessage.error(error?.message || '更新预览状态失败')
  } finally {
    previewStatusLoading.value = false
  }
}

const copyPreviewLink = async () => {
  if (!previewId.value) {
    try {
      const response = await booksAPI.getPreviewLink(bookId)
      previewId.value = String(response.data?.preview_id || '').trim()
    } catch (error) {
      ElMessage.error(error?.message || '获取预览链接失败')
      return
    }
  }
  if (!previewId.value) {
    ElMessage.error('获取预览链接失败')
    return
  }

  const url = `${window.location.origin}/preview/books/${previewId.value}`
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('预览链接已复制')
  } catch (error) {
    const input = document.createElement('input')
    input.value = url
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    ElMessage.success('预览链接已复制')
  }
}

const resetSummaryDraft = () => {
  summaryDraft.value = String(book.value?.summary ?? '')
}

const applyExpenseFilters = () => {
  currentPage.value = 1
  loadExpenses()
}

const resetExpenseFilters = () => {
  expenseFilters.keyword = ''
  expenseFilters.dateRange = []
  expenseFilters.category = ''
  expenseFilters.pay_channel = ''
  currentPage.value = 1
  loadExpenses()
}

const saveSummary = async () => {
  if (isReadOnly.value) {
    ElMessage.warning('预览模式不可修改数据')
    return
  }
  if (summarySaving.value) {
    return
  }
  summarySaving.value = true
  try {
    const updated = await booksAPI.updateBook(bookId, { summary: summaryDraft.value })
    book.value = updated.data || book.value
    summaryDraft.value = String(book.value?.summary ?? '')
    ElMessage.success('总结已保存')
  } catch (error) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    summarySaving.value = false
  }
}

// 重置表单
const resetForm = () => {
  isEditing.value = false
  Object.assign(expenseForm, {
    id: undefined,
    date: '',
    timeStart: '',
    timeEnd: '',
    duration_minutes: 0,
    duration_display: '',
    category: '',
    project: '',
    cost: 0,
    discount_amount: 0,
    discount_note: '',
    vehicle: '',
    platform: '',
    remarks: ''
  })
}

// 格式化日期
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 对话框关闭时重置表单
const handleDialogClose = () => {
  resetForm()
}

onMounted(() => {
  loadBookData()
  if (!isReadOnly.value) {
    loadPreviewStatus()
  }
})

watch(
  () => [expenseForm.timeStart, expenseForm.timeEnd],
  () => {
    recalcDurationFromTimeRange()
  },
  { deep: false }
)
</script>

<style scoped>
.book-detail-container {
  max-width: var(--app-page-max-width);
  margin: 0 auto;
}

.book-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  padding: 24px 28px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.book-info {
  min-width: 0;
}

.page-title {
  margin: 0 0 10px 0;
  color: #303133;
  font-size: 22px;
  font-weight: 600;
}

.book-description {
  margin: 0 0 10px 0;
  color: #606266;
  font-size: 15px;
}

.book-meta {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.book-meta-amounts {
  margin-top: 6px;
}

.summary-card {
  margin-bottom: 20px;
}

.table-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 10px;
}

.filter-item {
  flex: 0 0 auto;
  width: 160px;
}

.filter-keyword {
  width: 220px;
}

.filter-date {
  width: 260px;
}

.filter-select {
  width: 150px;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  margin-left: auto;
}

.book-summary {
  margin-top: 14px;
}

.book-summary-title {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.book-summary-preview {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fafcff;
}

.book-summary-text {
  white-space: pre-wrap;
  word-break: break-word;
  color: #303133;
  font-size: 14px;
  line-height: 1.6;
}

.book-summary-empty {
  color: #909399;
  font-size: 14px;
}

.book-summary-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.total-amount {
  color: #f56c6c;
  font-weight: bold;
  font-size: 16px;
}

.total-saved {
  color: #67c23a;
  font-weight: bold;
  font-size: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  max-width: 560px;
  justify-content: flex-end;
}

.header-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.header-toggle-label {
  font-size: 13px;
  color: #606266;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.content-card {
  border-radius: 12px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.table-scroll-area {
  width: 100%;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}

.table-top-scroll {
  height: 14px;
  margin-bottom: 8px;
}

.table-top-scroll-inner {
  height: 1px;
}

.table-top-scroll :deep(.el-scrollbar__bar.is-vertical) {
  display: none;
}

.table-top-scroll :deep(.el-scrollbar__bar.is-horizontal) {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.table-scroll-area:hover .table-top-scroll :deep(.el-scrollbar__bar.is-horizontal) {
  opacity: 1;
}

.table-top-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: hidden;
}

.time-range-input {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.time-range-separator {
  color: #909399;
}

.attachments-dialog {
  min-height: 220px;
}

.attachments-header {
  margin-bottom: 12px;
}

.attachments-expense-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.attachments-expense-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
}

.attachments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 6px 0;
}

.attachment-item {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.attachment-image {
  width: 100%;
  height: 140px;
  border-radius: 8px;
  overflow: hidden;
}

.attachment-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.attachment-name {
  font-size: 13px;
  color: #303133;
  line-height: 1.4;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-size {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}

.attachments-footer {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}
</style>
