<template>
  <div class="books-container">
    <div class="header">
      <div>
        <h2 class="page-title">账本管理</h2>
        <div class="page-subtitle">管理出行账本，进入账本查看花销记录</div>
      </div>
      <div class="header-actions">
        <el-button size="large" @click="handleDownloadTemplate">
          下载导入模板
        </el-button>
        <el-upload
          :show-file-list="false"
          :http-request="handleImportRequest"
          :before-upload="beforeImportUpload"
          accept=".xlsx"
        >
          <el-button size="large" type="success" :loading="importing">
            导入XLSX
          </el-button>
        </el-upload>
        <el-button type="primary" size="large" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建账本
        </el-button>
      </div>
    </div>

    <el-card class="content-card" shadow="never">
      <el-table :data="pagedBooks" size="default" style="width: 100%" v-loading="loading">
        <el-table-column prop="name" label="账本名称" width="220" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="260" show-overflow-tooltip />
        <el-table-column prop="created_at" label="创建时间" width="170">
          <template #default="{ row }">
            {{ row.created_at ? formatDate(row.created_at) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="updated_at" label="更新时间" width="170">
          <template #default="{ row }">
            {{ row.updated_at ? formatDate(row.updated_at) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewBook(row)">查看</el-button>
            <el-button size="small" type="primary" @click="openEditDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteBook(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="books.length"
          layout="prev, pager, next"
        />
      </div>
    </el-card>

    <!-- 新建账本对话框 -->
    <el-dialog v-model="showCreateDialog" title="新建账本" width="420px">
      <el-form :model="newBookForm" :rules="formRules" ref="createFormRef" label-width="76px" size="small">
        <el-form-item label="账本名称" prop="name">
          <el-input v-model="newBookForm.name" placeholder="请输入账本名称" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input 
            v-model="newBookForm.description" 
            type="textarea" 
            :rows="3" 
            placeholder="请输入账本描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showCreateDialog = false">取消</el-button>
          <el-button type="primary" @click="createBook">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog v-model="showEditDialog" title="编辑账本" width="420px">
      <el-form :model="editBookForm" :rules="formRules" ref="editFormRef" label-width="76px" size="small">
        <el-form-item label="账本名称" prop="name">
          <el-input v-model="editBookForm.name" placeholder="请输入账本名称" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input 
            v-model="editBookForm.description" 
            type="textarea" 
            :rows="3" 
            placeholder="请输入账本描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showEditDialog = false">取消</el-button>
          <el-button type="primary" @click="updateBook">保存</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { booksAPI, statsAPI } from '../utils/api'

const router = useRouter()
const books = ref([])
const loading = ref(false)
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const createFormRef = ref()
const editFormRef = ref()
const pageSize = 10
const currentPage = ref(1)
const importing = ref(false)

const pagedBooks = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return books.value.slice(start, start + pageSize)
})

const newBookForm = reactive({
  name: '',
  description: ''
})

const editBookForm = reactive({
  id: null,
  name: '',
  description: ''
})

const formRules = {
  name: [
    { required: true, message: '请输入账本名称', trigger: 'blur' },
    { min: 1, max: 50, message: '长度在 1 到 50 个字符', trigger: 'blur' }
  ],
  description: [
    { max: 200, message: '描述不能超过 200 个字符', trigger: 'blur' }
  ]
}

// 加载账本列表
const loadBooks = async () => {
  loading.value = true
  try {
    const response = await booksAPI.getBooks()
    books.value = response.data
    currentPage.value = 1
  } catch (error) {
    ElMessage.error('加载账本列表失败')
    console.error('加载账本列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleDownloadTemplate = async () => {
  try {
    const response = await booksAPI.downloadImportTemplate()
    const blob =
      response instanceof Blob
        ? response
        : new Blob([response], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '出行花销导入模板.xlsx'
    link.click()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    ElMessage.error(error?.message || '下载模板失败')
  }
}

const beforeImportUpload = (file) => {
  const name = String(file?.name || '')
  const isXlsx = name.toLowerCase().endsWith('.xlsx')
  if (!isXlsx) {
    ElMessage.warning('请上传 .xlsx 文件')
    return false
  }
  const maxSizeMb = 10
  const sizeOk = (file?.size || 0) <= maxSizeMb * 1024 * 1024
  if (!sizeOk) {
    ElMessage.warning(`文件不能超过 ${maxSizeMb}MB`)
    return false
  }
  return true
}

const handleImportRequest = async (options) => {
  if (importing.value) {
    return
  }
  importing.value = true
  try {
    const response = await booksAPI.importXlsx(options.file)
    const data = response?.data || {}
    const inserted = Number(data.insertedCount || 0)
    const skipped = Number(data.skippedCount || 0)
    ElMessage.success(`导入完成：写入 ${inserted} 条，跳过 ${skipped} 条`)
    await loadBooks()
    const errors = Array.isArray(data.errors) ? data.errors : []
    if (errors.length) {
      const preview = errors.slice(0, 20).map((item) => `第${item.row}行：${item.error}`).join('\n')
      await ElMessageBox.alert(preview, `存在 ${errors.length} 条导入问题`, {
        confirmButtonText: '知道了',
      })
    }
    if (data.bookId) {
      router.push({ name: 'BookDetail', params: { id: data.bookId } })
    }
    options.onSuccess?.(response, options.file)
  } catch (error) {
    ElMessage.error(error?.message || '导入失败')
    options.onError?.(error)
  } finally {
    importing.value = false
  }
}

// 创建账本
const createBook = async () => {
  try {
    await createFormRef.value.validate()
    
    await booksAPI.createBook(newBookForm)
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    
    // 重置表单
    newBookForm.name = ''
    newBookForm.description = ''
    
    // 重新加载列表
    loadBooks()
  } catch (error) {
    if (error.errors) {
      // 表单验证失败
      return
    }
    ElMessage.error('创建账本失败')
    console.error('创建账本失败:', error)
  }
}

const openEditDialog = (book) => {
  editBookForm.id = book.id
  editBookForm.name = book.name
  editBookForm.description = book.description || ''
  showEditDialog.value = true
}

const updateBook = async () => {
  try {
    await editFormRef.value.validate()
    const payload = {
      name: editBookForm.name,
      description: editBookForm.description
    }
    await booksAPI.updateBook(editBookForm.id, payload)
    ElMessage.success('更新成功')
    showEditDialog.value = false
    loadBooks()
  } catch (error) {
    if (error.errors) {
      return
    }
    ElMessage.error('更新账本失败')
  }
}

// 查看账本详情
const viewBook = (book) => {
  localStorage.setItem('last_book_id', String(book.id))
  router.push({ name: 'BookDetail', params: { id: book.id } })
}

// 删除账本
const deleteBook = async (book) => {
  try {
    let totalCount = 0
    try {
      const summaryRes = await statsAPI.getSummary(book.id)
      totalCount = Number(summaryRes?.data?.totalCount || 0)
    } catch (error) {
      totalCount = 0
    }

    if (totalCount > 0) {
      await ElMessageBox.confirm(
        `账本"${book.name}"下有 ${totalCount} 条花销记录，删除将一并清空且不可恢复，确定删除吗？`,
        '警告',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        }
      )
    }

    await booksAPI.deleteBook(book.id)
    ElMessage.success('删除成功')
    loadBooks()
  } catch (error) {
    if (error === 'cancel') {
      return
    }
    ElMessage.error('删除账本失败')
    console.error('删除账本失败:', error)
  }
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

onMounted(() => {
  loadBooks()
})
</script>

<style scoped>
.books-container {
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

.content-card {
  border-radius: 12px;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
