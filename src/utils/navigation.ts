import Taro from '@tarojs/taro'

const COACH_LAUNCH_KEY = '__store_ai_coach_launch__'
const CUSTOMER_POOL_KEY = '__store_ai_customer_pool__'

export type CoachLaunch = {
  question?: string
  customerId?: string
  customerName?: string
}

export type CustomerPool = 'all' | 'today' | 'new' | 'new_deal' | 'returning' | 'dormant' | 'risk'

/** tab 页面不能接收 navigateTo 参数，改用一次性本地上下文再切换 tab。 */
export function openCoach(launch: CoachLaunch = {}) {
  Taro.setStorageSync(COACH_LAUNCH_KEY, launch)
  Taro.switchTab({ url: '/pages/chat/index' })
}

export function consumeCoachLaunch(): CoachLaunch | null {
  const launch = Taro.getStorageSync(COACH_LAUNCH_KEY)
  Taro.removeStorageSync(COACH_LAUNCH_KEY)
  return launch && typeof launch === 'object' ? (launch as CoachLaunch) : null
}

export function openCustomers(pool: CustomerPool = 'all') {
  Taro.setStorageSync(CUSTOMER_POOL_KEY, pool)
  Taro.switchTab({ url: '/pages/customers/index' })
}

export function consumeCustomerPool(): CustomerPool | null {
  const pool = Taro.getStorageSync(CUSTOMER_POOL_KEY)
  Taro.removeStorageSync(CUSTOMER_POOL_KEY)
  return typeof pool === 'string' ? (pool as CustomerPool) : null
}
