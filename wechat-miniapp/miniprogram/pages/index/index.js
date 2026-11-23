const { translate, languageNames } = require('../../utils/i18n')

const LANGS = ['zh', 'en', 'ja', 'ko']
const MODES = {
  girl: { label: '满分女', icon: '♡' },
  boy: { label: '满分男', icon: '✦' },
  concert: { label: '满分线下', icon: '✷' }
}
const UI_KEYS = [
  '盲抽猜分 · 朋友默契小游戏', 'A 抽分数，但自己看不到。', 'B 看牌描述，A 来猜：你心里是几分？',
  '开一局', '加入朋友', '怎么称呼你', '给自己起个昵称', '今天聊什么', '玩几轮', '朋友的房间码',
  '6 位房间码', '创建默契局', '加入朋友局', '2–12 人轮流玩', '实时文字同步', '无需注册',
  '房间码', '邀请朋友', '在场朋友', '开始盲抽猜分（{0} 人）', '等一位朋友加入', '等待房主开始游戏',
  '抽一张看不见的分数牌', '等待 {0} 抽牌…', '你抽到了一个秘密分数', '只有描述者能看到',
  '选择一个情境', '换一组', '或者自己描述', '不要直接说出数字', '按住说话', '正在听…松开结束',
  '确认描述，让 A 猜分', '等待 {0} 描述…', '这就是 B 给你的情境', '你觉得这是几分？',
  '等待 {0} 猜分…', '牌面', '猜分', '猜中了！', '差一点！', '下一轮', '再来一局', '本局已结束',
  '离开房间', '跳过本轮', '房主', '你', '猜分者', '描述者', '围观中', '连接中…', '网络开小差了，请重试。',
  '复制成功', '房间码已复制', '中文和 English 支持语音转字；日语、韩语请手动输入。', '收起规则', '怎么玩',
  'A 盲抽 0–10 分，自己看不到。B 看到分数后选择或自定义情境，A 再猜数字。完全相同就算默契命中。'
]

function i18n(lang) {
  const ui = {}
  UI_KEYS.forEach(key => { ui[key] = translate(lang, key) })
  return ui
}
function modeViews(lang) { return Object.keys(MODES).map(key => ({ key, icon: MODES[key].icon, label: translate(lang, MODES[key].label) })) }
function localizeRoom(room, lang) {
  if (!room) return room
  const copy = JSON.parse(JSON.stringify(room))
  if (copy.round) {
    const rawClue = copy.round.rawClue || copy.round.clue || ''
    copy.round.rawClue = rawClue
    copy.round.clue = rawClue ? translate(lang, rawClue) : ''
    copy.round.suggestions = (copy.round.suggestions || []).map(item => {
      const raw = typeof item === 'string' ? item : item.raw
      return { raw, text: translate(lang, raw) }
    })
  }
  copy.history = (copy.history || []).map(item => {
    const rawClue = item.rawClue || item.clue || ''
    return { ...item, rawClue, clue: rawClue ? translate(lang, rawClue) : '' }
  })
  return copy
}

Page({
  data: {
    lang: 'zh', languageNames, langNames: LANGS.map(x => languageNames[x]), langIndex: 0,
    ui: i18n('zh'), modes: modeViews('zh'), scores: Array.from({ length: 11 }, (_, i) => i),
    mode: 'girl', total: 10, tab: 'create', name: '', code: '', room: null, busy: false,
    clue: '', clueRaw: '', selectedScore: null, showHelp: false, recording: false, online: true
  },

  onLoad(options) {
    const savedLang = wx.getStorageSync('tenbut-language')
    const systemLang = (wx.getSystemInfoSync().language || 'en').split('_')[0].split('-')[0]
    const lang = LANGS.includes(savedLang) ? savedLang : LANGS.includes(systemLang) ? systemLang : 'en'
    const session = wx.getStorageSync('tenbut-session')
    const name = wx.getStorageSync('tenbut-name') || ''
    this.setData({ lang, langIndex: LANGS.indexOf(lang), ui: i18n(lang), modes: modeViews(lang), name, code: options.room || (session && session.code) || '' })
    if (session && session.code) this.restore(session.code)
    this.setupSpeech()
  },

  onShow() { if (this.data.room) this.startPolling() },
  onHide() { this.stopPolling(); this.stopSpeech() },
  onUnload() { this.stopPolling(); this.stopSpeech() },
  onShareAppMessage() {
    const code = this.data.room ? this.data.room.code : this.data.code
    return { title: 'TEN BUT · 来猜猜我心里是几分', path: `/pages/index/index?room=${code || ''}` }
  },

  tr(source, values) { return translate(this.data.lang, source, values) },
  toast(title) { wx.showToast({ title: this.tr(title), icon: 'none' }) },
  setField(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  chooseTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }) },
  chooseMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }) },
  chooseTotal(e) { this.setData({ total: Number(e.currentTarget.dataset.total) }) },
  toggleHelp() { this.setData({ showHelp: !this.data.showHelp }) },
  changeLanguage(e) {
    const lang = LANGS[Number(e.detail.value)]
    wx.setStorageSync('tenbut-language', lang)
    const room = localizeRoom(this.data.room, lang)
    this.setData({ lang, langIndex: Number(e.detail.value), ui: i18n(lang), modes: modeViews(lang), room, clue: room && room.round ? room.round.clue || this.data.clue : this.data.clue })
  },

  async call(action, fields = {}, quiet = false) {
    if (this.data.busy && !quiet) return null
    if (!quiet) this.setData({ busy: true })
    try {
      const result = await wx.cloud.callFunction({ name: 'game', data: { action, code: this.data.room ? this.data.room.code : this.data.code, ...fields } })
      const value = result.result || {}
      if (!value.ok) throw new Error(value.error || '网络开小差了，请重试。')
      if (value.room) {
        const room = localizeRoom(value.room, this.data.lang)
        this._revision = Math.max(this._revision || 0, room.round ? room.round.revision || 0 : 0)
        const clue = room.round ? room.round.clue || this.data.clue : ''
        const clueRaw = room.round ? room.round.rawClue || this.data.clueRaw : ''
        this.setData({ room, clue, clueRaw, online: true })
        wx.setStorageSync('tenbut-session', { code: room.code })
      }
      if (value.left) { this.stopPolling(); this.setData({ room: null, clue: '' }); wx.removeStorageSync('tenbut-session') }
      return value
    } catch (error) {
      if (!quiet) this.toast(error.message || '网络开小差了，请重试。')
      this.setData({ online: false })
      return null
    } finally { if (!quiet) this.setData({ busy: false }) }
  },

  async submitEntry() {
    const name = this.data.name.trim()
    if (!name) return this.toast('给自己起个昵称')
    wx.setStorageSync('tenbut-name', name)
    const action = this.data.tab === 'create' ? 'create' : 'join'
    const result = await this.call(action, { name, mode: this.data.mode, total: this.data.total, code: this.data.code.trim().toUpperCase() })
    if (result) this.startPolling()
  },
  async restore(code) {
    this.setData({ code })
    const result = await this.call('get', {}, true)
    if (result) this.startPolling(); else wx.removeStorageSync('tenbut-session')
  },
  startPolling() {
    this.stopPolling()
    this._poller = setInterval(() => this.call('get', {}, true), 1500)
  },
  stopPolling() { if (this._poller) clearInterval(this._poller); this._poller = null },

  action(e) {
    const action = e.currentTarget.dataset.action
    const round = this.data.room && this.data.room.round
    return this.call(action, round ? { round: round.id } : {})
  },
  copyCode() {
    wx.setClipboardData({ data: this.data.room.code, success: () => this.toast('房间码已复制') })
  },
  selectSuggestion(e) {
    const clue = e.currentTarget.dataset.text
    const clueRaw = e.currentTarget.dataset.raw
    this.setData({ clue, clueRaw }); this.saveDraft(clueRaw)
  },
  clueInput(e) {
    const clue = e.detail.value
    this.setData({ clue, clueRaw: clue })
    clearTimeout(this._draftTimer)
    this._draftTimer = setTimeout(() => this.saveDraft(clue), 700)
  },
  saveDraft(text) {
    const r = this.data.room && this.data.room.round
    if (!r || this.data.room.phase !== 'describing' || this.data.room.self !== r.describer) return
    this._revision = Math.max(this._revision || 0, r.revision || 0) + 1
    this.call('draft', { round: r.id, text, revision: this._revision }, true)
  },
  publish() {
    const r = this.data.room.round
    clearTimeout(this._draftTimer)
    this._revision = Math.max(this._revision || 0, r.revision || 0) + 1
    this.call('publish', { round: r.id, text: this.data.clueRaw || this.data.clue, revision: this._revision })
  },
  chooseScore(e) { this.setData({ selectedScore: Number(e.currentTarget.dataset.score) }) },
  guess() {
    if (this.data.selectedScore === null) return
    const r = this.data.room.round
    this.call('guess', { round: r.id, score: this.data.selectedScore }).then(() => this.setData({ selectedScore: null }))
  },
  confirmLeave() {
    wx.showModal({ title: this.tr('离开房间'), content: this.tr('离开后仍可用房间码重新加入。'), success: res => { if (res.confirm) this.call('leave') } })
  },

  setupSpeech() {
    try {
      const plugin = requirePlugin('WechatSI')
      this._speech = plugin.getRecordRecognitionManager()
      this._speech.onStart = () => this.setData({ recording: true })
      this._speech.onRecognize = res => { if (res.result) this.setData({ clue: res.result, clueRaw: res.result }) }
      this._speech.onStop = res => {
        const clue = (res.result || this.data.clue || '').trim()
        this.setData({ recording: false, clue, clueRaw: clue })
        if (clue) this.saveDraft(clue)
      }
      this._speech.onError = () => { this.setData({ recording: false }); this.toast('网络开小差了，请重试。') }
    } catch (_) { this._speech = null }
  },
  startSpeech() {
    if (!['zh', 'en'].includes(this.data.lang)) return this.toast('中文和 English 支持语音转字；日语、韩语请手动输入。')
    if (!this._speech) return this.toast('网络开小差了，请重试。')
    this._speech.start({ lang: this.data.lang === 'en' ? 'en_US' : 'zh_CN', duration: 60000 })
  },
  stopSpeech() { if (this._speech && this.data.recording) this._speech.stop() }
})
