import Taro from '@tarojs/taro'

const TOKEN_KEY = 'store_ai_token'
const USER_KEY = 'store_ai_user'

export interface UserInfo {
  userId: string
  employeeId: string
  storeId: string
  role: string
  roleLabel: string
  storeName: string
  name: string
}

export function getToken(): string | null {
  return Taro.getStorageSync(TOKEN_KEY) || null
}

export function setToken(token: string | null) {
  if (token) Taro.setStorageSync(TOKEN_KEY, token)
  else Taro.removeStorageSync(TOKEN_KEY)
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

export function getUserInfo(): UserInfo | null {
  return Taro.getStorageSync(USER_KEY) || null
}

export function setUserInfo(info: UserInfo | null) {
  if (info) Taro.setStorageSync(USER_KEY, info)
  else Taro.removeStorageSync(USER_KEY)
}

export function logout() {
  setToken(null)
  setUserInfo(null)
}
