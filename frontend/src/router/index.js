import { createRouter, createWebHistory } from 'vue-router'

// 导入页面组件
const Layout = () => import('../components/Layout.vue')
const Login = () => import('../views/Login.vue')
const Register = () => import('../views/Register.vue')
const Books = () => import('../views/Books.vue')
const BookDetail = () => import('../views/BookDetail.vue')
const BookReport = () => import('../views/BookReport.vue')
const Stats = () => import('../views/Stats.vue')
const Leaderboard = () => import('../views/Leaderboard.vue')

const routes = [
  {
    path: '/',
    redirect: '/books'
  },
  {
    path: '/preview/books/:id',
    name: 'BookPreview',
    component: BookDetail,
    meta: { requiresAuth: false, readOnly: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false }
  },
  {
    path: '/register',
    name: 'Register',
    component: Register,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'books',
        name: 'Books',
        component: Books
      },
      {
        path: 'books/:id',
        name: 'BookDetail',
        component: BookDetail
      },
      {
        path: 'books/:id/report',
        name: 'BookReport',
        component: BookReport
      },
      {
        path: 'stats',
        name: 'Stats',
        component: Stats
      },
      {
        path: 'leaderboard',
        name: 'Leaderboard',
        component: Leaderboard
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/books'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫 - 认证检查
router.beforeEach((to, from, next) => {
  const isAuthenticated = localStorage.getItem('auth_token')
  
  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  } else if ((to.path === '/login' || to.path === '/register') && isAuthenticated) {
    next('/books')
  } else {
    next()
  }
})

export default router
