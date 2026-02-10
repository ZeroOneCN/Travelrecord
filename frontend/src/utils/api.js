import axios from 'axios'

// 创建axios实例
const api = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器 - 添加认证token
api.interceptors.request.use(
  (config) => {
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers) {
        delete config.headers['Content-Type']
        delete config.headers['content-type']
      }
    }
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 统一错误处理
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    if (error.response?.status === 401) {
      // token过期或无效，清除本地存储并跳转到登录页
      const pathname = window.location?.pathname || ''
      if (!pathname.startsWith('/preview/')) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_info')
        window.location.href = '/login'
      }
    }
    
    const message = error.response?.data?.error || '网络请求失败，请稍后重试'
    return Promise.reject(new Error(message))
  }
)

// 认证相关API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getProfile: () => api.get('/auth/me'),
  changePassword: (payload) => api.put('/auth/change-password', payload),
  updateNickname: (payload) => api.put('/auth/me/nickname', payload)
}

// 账本相关API
export const booksAPI = {
  getBooks: () => api.get('/books'),
  createBook: (bookData) => api.post('/books', bookData),
  getBook: (id) => api.get(`/books/${id}`),
  getPreviewStatus: (id) => api.get(`/books/${id}/preview-status`),
  setPreviewStatus: (id, payload) => api.put(`/books/${id}/preview-status`, payload),
  setPreviewSettings: (id, payload) => api.put(`/books/${id}/preview-settings`, payload),
  getPreviewLink: (id) => api.get(`/books/${id}/preview-token`),
  downloadImportTemplate: () => api.get('/books/import/template', { responseType: 'blob' }),
  importXlsx: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/books/import', formData)
  },
  updateBook: (id, bookData) => api.put(`/books/${id}`, bookData),
  deleteBook: (id) => api.delete(`/books/${id}`)
}

// 花销记录相关API
export const expensesAPI = {
  getExpenses: (bookId, params) => api.get(`/books/${bookId}/expenses`, { params }),
  createExpense: (bookId, expenseData) => api.post(`/books/${bookId}/expenses`, expenseData),
  getExpense: (id) => api.get(`/expenses/${id}`),
  updateExpense: (id, expenseData) => api.put(`/expenses/${id}`, expenseData),
  deleteExpense: (id) => api.delete(`/expenses/${id}`),
  getAttachments: (expenseId) => api.get(`/expenses/${expenseId}/attachments`),
  uploadAttachment: (expenseId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/expenses/${expenseId}/attachments`, formData)
  },
  deleteAttachment: (expenseId, attachmentId) =>
    api.delete(`/expenses/${expenseId}/attachments/${attachmentId}`)
}

export const statsAPI = {
  getSummary: (bookId) => api.get(`/books/${bookId}/stats/summary`),
  getDaily: (bookId, params) => api.get(`/books/${bookId}/stats/daily`, { params }),
  getLeaderboard: () => api.get('/books/stats/leaderboard'),
  exportBook: (bookId) => api.get(`/books/${bookId}/export`, { responseType: 'blob' })
}

export const previewBooksAPI = {
  getBook: (previewId) => api.get(`/books/preview/books/${previewId}`),
  getSummary: (previewId) => api.get(`/books/preview/books/${previewId}/stats/summary`),
  getDaily: (previewId, params) => api.get(`/books/preview/books/${previewId}/stats/daily`, { params }),
  getExpenses: (previewId, params) => api.get(`/books/preview/books/${previewId}/expenses`, { params }),
  getAttachments: (previewId, expenseId) =>
    api.get(`/books/preview/books/${previewId}/expenses/${expenseId}/attachments`)
}

export const paymentChannelsAPI = {
  getPaymentChannels: () => api.get('/payment-channels'),
  createPaymentChannel: (payload) => api.post('/payment-channels', payload),
  updatePaymentChannel: (id, payload) => api.put(`/payment-channels/${id}`, payload)
}

export default api
