import { Image } from '@tarojs/components'

// 通用 SVG 图标（微信 image 组件支持 svg；background-image 不支持，故用 Image 渲染）
export default function Icon({
  svg,
  size = 40,
  className = '',
}: {
  svg: string
  size?: number
  className?: string
}) {
  return (
    <Image
      className={`icon ${className}`}
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      style={{ width: size / 2, height: size / 2 }}
      mode="aspectFit"
    />
  )
}
