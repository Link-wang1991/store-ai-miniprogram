// 全局常量配置
// 开发时把 DEV_BACKEND_URL 改成你后端的可访问地址（局域网 IP 或公网域名）。
// 微信开发者工具已关闭 urlCheck，真机预览需在小程序后台配置合法域名。

// 本地调试地址。2026-08-20 当前 Mac 局域网 IP 为 192.168.1.104；DHCP 变更后只更新这一处。
const DEV_BACKEND_URL = 'http://192.168.1.104:8080'
const PROD_BACKEND_URL = 'https://api.example.com'   // TODO: 改成生产域名

// 开发调试阶段固定走 DEV 地址（本机后端）；发布前再切 PROD 并在小程序后台配置合法 https 域名
export const API_BASE_URL = DEV_BACKEND_URL

// 注意：微信登录的 AppID 不由前端常量控制。前端通过 Taro.login() 自动携带开发者工具/发布的小程序 AppID；
// 后端 code2session 使用 application.yml 的 wx.appid（环境变量 WX_APPID）做鉴权，两者必须一致。
// 本文件不再定义 WX_APP_ID 常量，避免与后端/开发者工具出现第二处配置来源。

// 设计 token（对齐现有前端绿色主题）
export const THEME = {
  green: '#008448',
  greenDark: '#006d37',
  greenMid: '#078a4c',
  greenBg: '#f3f6f3',
}
