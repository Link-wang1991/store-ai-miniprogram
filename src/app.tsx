import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('App launched.')
  })

  // 全局启动逻辑（检查登录态等）可放在这里
  return children
}

export default App
