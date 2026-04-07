import { describe, expect, it } from 'vitest'

import {
  getDesktopLanguage,
  normalizeDesktopLanguage,
  setDesktopLanguage,
  tDesktop,
} from './desktop-i18n'

describe('desktop-i18n', () => {
  it('标准化桌面端语言代码', () => {
    expect(normalizeDesktopLanguage('zh-CN')).toBe('zh')
    expect(normalizeDesktopLanguage('zh-TW')).toBe('zh-TW')
    expect(normalizeDesktopLanguage('zh-HK')).toBe('zh-TW')
    expect(normalizeDesktopLanguage('ja-JP')).toBe('ja')
    expect(normalizeDesktopLanguage('en-US')).toBe('en')
    expect(normalizeDesktopLanguage('fr-FR')).toBe('en')
  })

  it('保存并读取当前桌面语言', () => {
    setDesktopLanguage('ja-JP')
    expect(getDesktopLanguage()).toBe('ja')

    setDesktopLanguage('zh-TW')
    expect(getDesktopLanguage()).toBe('zh-TW')
  })

  it('根据当前语言返回翻译并插值', () => {
    setDesktopLanguage('en-US')
    expect(tDesktop('update.versionDetected', { version: '1.2.3' })).toBe('Version v1.2.3 is available')

    setDesktopLanguage('zh-CN')
    expect(tDesktop('workspace.copyEntryFailed')).toBe('复制失败')

    setDesktopLanguage('ja-JP')
    expect(tDesktop('update.downloadNow')).toBe('今すぐダウンロード')
  })
})
