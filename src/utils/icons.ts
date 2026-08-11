// Web 风格线性图标（SVG data-URI，stroke 1.75 / round，与 store-ai-assistant 一致）
const L = (body: string, color = '#008448') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const ICN = {
  trophy: (c?: string) => L('<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M6 5H4v1a3 3 0 0 0 3 3M18 5h2v1a3 3 0 0 1-3 3M12 13v3M8 20h8"/>', c),
  clock: (c?: string) => L('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', c),
  home: (c?: string) => L('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>', c),
  chat: (c?: string) => L('<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z"/>', c),
  mic: (c?: string) => L('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7"/>', c),
  psy: (c?: string) =>
    L(
      '<path d="M12 3.5a7 7 0 0 0-6.9 7.1c0 3.2 2 5.9 4.9 6.8v2.1h4v-2.1a7.1 7.1 0 0 0 4.9-6.8A7 7 0 0 0 12 3.5Z"/><path d="M8.9 10.4c.5-1.1 1.5-1.8 3.1-1.8 1.7 0 2.8.8 3.1 2M8.5 14c.8.8 2 1.3 3.5 1.3s2.7-.5 3.5-1.3M12 8.6v6.7"/>',
      c
    ),
  check: (c?: string) =>
    L('<path d="M9 11l3 3 5-6"/><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"/>', c),
  plus: (c?: string) => L('<path d="M12 5v14M5 12h14"/>', c),
  refresh: (c?: string) => L('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>', c),
  search: (c?: string) => L('<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>', c),
  cog: (c?: string) =>
    L(
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
      c
    ),
  warn: (c?: string) => L('<path d="M12 3l9 16H3l9-16Z"/><path d="M12 10v4M12 17h.01"/>', c),
  arrow: (c?: string) => L('<path d="M5 12h14M13 6l6 6-6 6"/>', c),
}
