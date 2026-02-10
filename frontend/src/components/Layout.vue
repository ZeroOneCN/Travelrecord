<template>
  <div class="layout">
    <!-- 顶部导航栏 -->
    <el-header class="header">
      <div class="header-content">
        <div class="logo">
          <el-icon><Location /></el-icon>
          <span>出行花销记录</span>
        </div>
        <div class="nav-items">
          <el-button 
            :type="$route.name === 'Books' ? 'primary' : 'text'" 
            @click="$router.push('/books')"
          >
            账本管理
          </el-button>
          <el-button
            :type="$route.name === 'Leaderboard' ? 'primary' : 'text'"
            @click="$router.push('/leaderboard')"
          >
            排行榜
          </el-button>
          <el-button
            :type="$route.name === 'Stats' ? 'primary' : 'text'"
            @click="$router.push('/stats')"
          >
            统计分析
          </el-button>
        </div>
        <div class="user-info">
          <el-dropdown>
            <span class="user-name">
              <el-icon><User /></el-icon>
              {{ userInfo.nickname || userInfo.email }}
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="openProfile">
                  <el-icon><UserFilled /></el-icon>
                  个人信息
                </el-dropdown-item>
                <el-dropdown-item @click="openChangePassword">
                  <el-icon><Key /></el-icon>
                  修改密码
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-header>

    <!-- 主内容区域 -->
    <el-main class="main-content">
      <div class="page-container">
        <router-view />
      </div>
    </el-main>

    <el-dialog v-model="showChangePasswordDialog" title="修改密码" width="420px" @closed="resetChangePasswordForm">
      <el-form ref="changePasswordFormRef" :model="changePasswordForm" :rules="changePasswordRules" label-width="90px">
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input v-model="changePasswordForm.currentPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="changePasswordForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="changePasswordForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showChangePasswordDialog = false">取消</el-button>
          <el-button type="primary" :loading="changePasswordLoading" @click="submitChangePassword">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog v-model="showProfileDialog" title="个人信息" width="420px" @closed="resetProfileForm">
      <el-form ref="profileFormRef" :model="profileForm" :rules="profileRules" label-width="90px">
        <el-form-item label="邮箱">
          <el-input :model-value="userInfo.email" disabled />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="profileForm.nickname" maxlength="30" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showProfileDialog = false">取消</el-button>
          <el-button type="primary" :loading="profileLoading" @click="submitNickname">
            <el-icon><Edit /></el-icon>
            修改昵称
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { authAPI } from '../utils/api'

const router = useRouter()
const userInfo = ref({})
const showChangePasswordDialog = ref(false)
const changePasswordLoading = ref(false)
const changePasswordFormRef = ref()
const showProfileDialog = ref(false)
const profileLoading = ref(false)
const profileFormRef = ref()
const changePasswordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const profileForm = ref({
  nickname: ''
})

const validateConfirmPassword = (rule, value, callback) => {
  if (!value) {
    callback(new Error('请确认新密码'))
    return
  }
  if (String(value) !== String(changePasswordForm.value.newPassword || '')) {
    callback(new Error('两次输入密码不一致'))
    return
  }
  callback()
}

const changePasswordRules = {
  currentPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }]
}

const profileRules = {
  nickname: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { min: 1, max: 30, message: '昵称长度需为1-30个字符', trigger: 'blur' }
  ]
}

// 从localStorage加载用户信息
onMounted(() => {
  const userData = localStorage.getItem('user_info')
  if (userData) {
    userInfo.value = JSON.parse(userData)
  }
})

// 退出登录
const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    // 清除本地存储
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_info')
    
    ElMessage.success('已退出登录')
    router.push('/login')
  } catch (error) {
    // 用户点击取消
  }
}

const resetChangePasswordForm = () => {
  changePasswordLoading.value = false
  changePasswordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
  changePasswordFormRef.value?.clearValidate?.()
}

const resetProfileForm = () => {
  profileLoading.value = false
  profileForm.value = { nickname: String(userInfo.value?.nickname || '').trim() }
  profileFormRef.value?.clearValidate?.()
}

const openChangePassword = () => {
  resetChangePasswordForm()
  showChangePasswordDialog.value = true
}

const openProfile = async () => {
  resetProfileForm()
  showProfileDialog.value = true
  try {
    const response = await authAPI.getProfile()
    const data = response.data || {}
    userInfo.value = data
    localStorage.setItem('user_info', JSON.stringify(data))
    profileForm.value.nickname = String(data.nickname || '').trim()
  } catch (error) {
  }
}

const submitChangePassword = async () => {
  if (changePasswordLoading.value) {
    return
  }
  try {
    await changePasswordFormRef.value?.validate?.()
    changePasswordLoading.value = true
    await authAPI.changePassword({
      currentPassword: changePasswordForm.value.currentPassword,
      newPassword: changePasswordForm.value.newPassword
    })
    ElMessage.success('密码修改成功')
    showChangePasswordDialog.value = false
  } catch (error) {
    if (error?.message) {
      ElMessage.error(error.message)
    } else if (!error?.errors) {
      ElMessage.error('修改密码失败')
    }
  } finally {
    changePasswordLoading.value = false
  }
}

const submitNickname = async () => {
  if (profileLoading.value) {
    return
  }
  try {
    await profileFormRef.value?.validate?.()
    const nickname = String(profileForm.value.nickname || '').trim()
    profileLoading.value = true
    const response = await authAPI.updateNickname({ nickname })
    const data = response.data || {}
    userInfo.value = data
    localStorage.setItem('user_info', JSON.stringify(data))
    ElMessage.success('昵称修改成功')
    showProfileDialog.value = false
  } catch (error) {
    if (error?.message) {
      ElMessage.error(error.message)
    } else if (!error?.errors) {
      ElMessage.error('修改昵称失败')
    }
  } finally {
    profileLoading.value = false
  }
}

</script>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(135deg, #6ec8ff 0%, #2f8bff 100%);
  color: white;
  padding: 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 var(--app-page-padding-x);
  max-width: var(--app-page-max-width);
  margin: 0 auto;
}

.logo {
  display: flex;
  align-items: center;
  font-size: 22px;
  font-weight: bold;
  letter-spacing: 0.5px;
}

.logo .el-icon {
  margin-right: 8px;
  font-size: 22px;
}

.nav-items {
  display: flex;
  gap: 16px;
}

.nav-items .el-button {
  color: white !important;
  font-size: 16px;
  padding: 8px 18px;
}

.nav-items .el-button:not(.is-primary) {
  opacity: 0.8;
}

.nav-items .el-button:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1) !important;
}

.user-info {
  display: flex;
  align-items: center;
}

.user-name {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: white;
  font-size: 16px;
}

.user-name .el-icon {
  margin-right: 5px;
}

.main-content {
  padding: var(--app-page-padding-y) var(--app-page-padding-x);
  background-color: #f5f7fa;
  flex: 1;
}

.page-container {
  width: 100%;
  max-width: var(--app-page-max-width);
  margin: 0 auto;
}
</style>
