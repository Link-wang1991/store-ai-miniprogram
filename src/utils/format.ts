export function fmtDate(s?: unknown): string {
  if (s == null) return ''
  // 防止后端把日期字段返回成对象/数组时直接渲染触发 React error #31
  if (typeof s !== 'string' && typeof s !== 'number') return ''
  const str = String(s)
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${m}-${day}`
}

// 由生日（yyyy-MM-dd 或 Date）计算当前年龄
export function ageFromBirthday(birthday?: string): string {
  if (!birthday) return ''
  const d = new Date(birthday)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const mDiff = now.getMonth() - d.getMonth()
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < d.getDate())) age--
  return age >= 0 ? String(age) : ''
}

// 由年龄（周岁）推算近似生日：只确定出生年份，月日取 1 月 1 日，用户可再细化选择。
// 也用于"输入年龄后自动补生日"。
export function birthdayFromAge(age?: string, fallback?: string): string {
  if (!age) return fallback || ''
  const y = parseInt(age, 10)
  if (!y || y <= 0 || y > 120) return fallback || ''
  const year = new Date().getFullYear() - y
  return `${year}-01-01`
}

export function taskStatusTag(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'done':
    case 'completed':
      return 'green'
    case 'pending':
    case 'todo':
      return 'orange'
    case 'doing':
    case 'in_progress':
      return 'blue'
    default:
      return 'gray'
  }
}

export function taskStatusLabel(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'done':
    case 'completed':
      return '已完成'
    case 'pending':
    case 'todo':
      return '待办'
    case 'doing':
    case 'in_progress':
      return '进行中'
    default:
      return status || '待办'
  }
}
