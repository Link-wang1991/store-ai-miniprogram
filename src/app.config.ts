export default {
  pages: [
    'pages/login/index',
    'pages/home/index',
    'pages/meeting/index',
    'pages/customers/index',
    'pages/chat/index',
    'pages/me/index',
    'pages/meeting-detail/index',
    'pages/customer-detail/index',
    'pages/tasks/index',
    'pages/submit/index',
    'pages/platform/index',
    'pages/admin/index',
    'pages/admin/customers/index',
    'pages/admin/knowledge/index',
    'pages/admin/data-switch/index',
    'pages/admin/staff/index',
    'pages/admin/experience/index',
    'pages/admin/bargain/index',
    'pages/admin/score/index',
    'pages/admin/inspect/index',
    'pages/admin/report/index',
    'pages/admin/risk/index',
    'pages/admin/question/index',
    'pages/admin/notice/index',
    'pages/admin/permission/index'
  ],
  window: {
    navigationBarTitleText: '门店AI',
    navigationBarBackgroundColor: '#f7fbf7',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f3f6f3'
  },
  tabBar: {
    custom: true,
    color: '#718077',
    selectedColor: '#006d37',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/meeting/index', text: '会谈' },
      { pagePath: 'pages/customers/index', text: '客户' },
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/chat/index', text: 'AI教练' },
      { pagePath: 'pages/me/index', text: '我的' }
    ]
  }
}
