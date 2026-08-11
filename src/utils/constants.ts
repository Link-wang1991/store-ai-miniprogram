// 全局常量配置
// 开发时把 DEV_BACKEND_URL 改成你后端的可访问地址（局域网 IP 或公网域名）。
// 微信开发者工具已关闭 urlCheck，真机预览需在小程序后台配置合法域名。

const DEV_BACKEND_URL = 'http://127.0.0.1:8080' // 本机后端（开发者工具模拟器联调用）；真机预览改成本机局域网 IP
const PROD_BACKEND_URL = 'https://api.example.com'   // TODO: 改成生产域名

// 开发调试阶段固定走 DEV 地址（本机后端）；发布前再切 PROD 并在小程序后台配置合法 https 域名
export const API_BASE_URL = DEV_BACKEND_URL

export const WX_APP_ID = 'wx6ade085c48e2a736' // 真实小程序 AppID

// 设计 token（对齐现有前端绿色主题）
export const THEME = {
  green: '#008448',
  greenDark: '#006d37',
  greenMid: '#078a4c',
  greenBg: '#f3f6f3',
}
