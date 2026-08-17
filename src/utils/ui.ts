import Taro from '@tarojs/taro'

type CustomTabBar = { setSelected?: (index: number) => void }

export function setActiveTab(index: number) {
  try {
    const tabBar = Taro.getTabBar(Taro.getCurrentInstance().page) as unknown as CustomTabBar | null
    tabBar?.setSelected?.(index)
  } catch {}
}

type EditableModalOptions = {
  title: string
  content?: string
  placeholderText?: string
  confirmColor?: string
}

type EditableModalResult = { confirm: boolean; cancel: boolean; content?: string }

/** Taro 的当前类型声明缺少微信原生 editable/content 字段，运行时仍交给 wx.showModal。 */
export function showEditableModal(options: EditableModalOptions): Promise<EditableModalResult> {
  return (Taro.showModal as unknown as (input: EditableModalOptions & { editable: boolean }) => Promise<EditableModalResult>)({
    ...options,
    editable: true,
  })
}
