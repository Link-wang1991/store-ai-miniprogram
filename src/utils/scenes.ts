// ============================================================
// 会谈场景：系统逻辑用 code，页面展示用 label。
// 与 Web 端 store-ai-assistant/lib/scenes.ts 保持一致。
// ============================================================

export const MEETING_SCENES: [string, string][] = [
  ["new_consult", "新客咨询"],
  ["project_intro", "项目介绍"],
  ["deal_consult", "成交沟通"],
  ["pre_service", "服务前沟通"],
  ["post_service", "服务后反馈"],
  ["repurchase", "老客复购"],
  ["complaint", "客户投诉"],
  ["campaign_invite", "活动邀约"],
  ["price_objection", "价格异议"],
  ["effect_doubt", "效果疑虑"],
]

// 展示映射：含已停用的旧场景 code，保证历史会谈记录仍能显示中文。
export const SCENE_LABEL: Record<string, string> = {
  ...Object.fromEntries(MEETING_SCENES),
  in_service: "服务中沟通", // 旧场景，兼容历史数据
}

export function sceneLabel(code: string): string {
  return SCENE_LABEL[code] || code
}
