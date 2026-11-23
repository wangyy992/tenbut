App({
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '需要更新微信', content: '当前微信版本不支持云开发，请更新后重试。', showCancel: false })
      return
    }
    wx.cloud.init({ traceUser: true })
  }
})
