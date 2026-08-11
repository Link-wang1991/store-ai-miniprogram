import { defineConfig } from '@tarojs/cli'
import path from 'path'

export default defineConfig({
  projectName: 'store-ai-miniprogram',
  date: '2026-08-06',
  designWidth: 750,
  deviceRatio: {
    750: 1,
    640: 1.17,
    375: 2,
    828: 0.905
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  alias: {
    '@': path.resolve(process.cwd(), 'src')
  },
  plugins: [],
  defineConstants: {},
  sass: {
    // 全局注入 SCSS 变量，所有 .scss 可直接使用 $green 等
    resource: [path.resolve(process.cwd(), 'src/styles/theme.scss')]
  },
  copy: {
    patterns: [],
    options: {}
  },
  mini: {
    postcss: {
      // pxtransform 关闭：px 保留为物理像素（源码按 750 语义写，已全局 ÷2 转为物理 px），
      // 避免 rpx 随窗口/设备宽度缩放导致字体过大、元素溢出
      pxtransform: { enable: false },
      url: { enable: true, config: { limit: 1024 } }
    }
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: { enable: true },
      cssModules: { enable: false }
    }
  }
})
