import { Component } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import './index.scss'

// 与 Web 端 BottomNav 相同的 5 个线性图标（stroke 1.75 / round），经 data-URI 内联渲染
const S = (body: string, color: string, fill = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill ? color : 'none'}" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const HOME = 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z'
const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7"/>'
const GROUP = '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16.5 5.3a3.1 3.1 0 0 1 0 5.8M17.3 14.1a5.1 5.1 0 0 1 3.2 4.8"/>'
const PSY = '<path d="M12 3.5a7 7 0 0 0-6.9 7.1c0 3.2 2 5.9 4.9 6.8v2.1h4v-2.1a7.1 7.1 0 0 0 4.9-6.8A7 7 0 0 0 12 3.5Z"/><path d="M8.9 10.4c.5-1.1 1.5-1.8 3.1-1.8 1.7 0 2.8.8 3.1 2M8.5 14c.8.8 2 1.3 3.5 1.3s2.7-.5 3.5-1.3M12 8.6v6.7"/>'
const ACCOUNT = '<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="9" r="3"/><path d="M6.7 19.1a5.8 5.8 0 0 1 10.6 0"/>'

const GRAY = '#718077'
const GREEN = '#006d37'

const TABS = [
  { path: '/pages/meeting/index', label: '会谈', icon: S(MIC, GRAY), iconActive: S(MIC, GREEN) },
  { path: '/pages/customers/index', label: '客户', icon: S(GROUP, GRAY), iconActive: S(GROUP, GREEN) },
  { path: '/pages/home/index', label: '首页', icon: S(HOME, GRAY), iconActive: S(HOME, GREEN, true) },
  { path: '/pages/chat/index', label: 'AI教练', icon: S(PSY, GRAY), iconActive: S(PSY, GREEN) },
  { path: '/pages/me/index', label: '我的', icon: S(ACCOUNT, GRAY), iconActive: S(ACCOUNT, GREEN) },
]

// 选中索引与 TABS 对齐：meeting=0 customers=1 home=2 chat=3 me=4
export const TAB_INDEX: Record<string, number> = {
  '/pages/meeting/index': 0,
  '/pages/customers/index': 1,
  '/pages/home/index': 2,
  '/pages/chat/index': 3,
  '/pages/me/index': 4,
}

export default class CustomTabBar extends Component {
  state = { selected: 0 }

  // 组件挂载时同步一次选中态
  componentDidMount() {
    this.syncSelected()
  }

  // 每次页面显示（含切回）都同步选中态，不依赖 getTabBar 可用性
  pageLifetimes = {
    show: () => {
      this.syncSelected()
    },
  }

  // 从当前页面路由推导选中 tab
  syncSelected() {
    try {
      const pages = Taro.getCurrentPages()
      const current = pages[pages.length - 1]
      const route = current?.route || ''
      const idx = TAB_INDEX[`/${route}`]
      if (idx != null && idx !== this.state.selected) this.setState({ selected: idx })
    } catch {}
  }

  setSelected(index: number) {
    this.setState({ selected: index })
  }

  switchTab(index: number) {
    this.setState({ selected: index })
    Taro.switchTab({ url: TABS[index].path })
  }

  render() {
    return (
      <View className="tab-bar">
        {TABS.map((t, i) => {
          const active = i === this.state.selected
          const isHome = i === 2
          return (
            <View key={t.path} className={`tab-item${active ? ' active' : ''}`} onClick={() => this.switchTab(i)}>
              <Image
                className={`tab-icon${isHome ? ' tab-icon-home' : ''}${active && isHome ? ' home-active' : ''}`}
                src={`data:image/svg+xml;utf8,${encodeURIComponent(active ? t.iconActive : t.icon)}`}
                mode="aspectFit"
              />
              <Text className="tab-label">{t.label}</Text>
            </View>
          )
        })}
      </View>
    )
  }
}
