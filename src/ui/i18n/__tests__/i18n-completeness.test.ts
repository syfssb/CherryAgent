import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const LOCALES_DIR = path.resolve(__dirname, '../locales')
const LOCALE_FILES = ['en.json', 'ja.json', 'zh.json', 'zh-TW.json'] as const
const REFERENCE_LOCALE = 'en.json'

function loadLocale(filename: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(LOCALES_DIR, filename), 'utf-8')
  return JSON.parse(raw)
}

function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      keys.push(...getAllKeys(val as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

function getAllEntries(obj: Record<string, unknown>, prefix = ''): [string, unknown][] {
  const entries: [string, unknown][] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      entries.push(...getAllEntries(val as Record<string, unknown>, fullKey))
    } else {
      entries.push([fullKey, val])
    }
  }
  return entries
}

function getPlaceholders(str: string): string[] {
  const matches = str.match(/\{\{[^}]+\}\}/g)
  return matches ? [...matches].sort() : []
}

function getValueByPath(obj: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

describe('i18n 完整性测试', () => {
  // Test 1: 所有 JSON 文件可正确解析
  describe('1. JSON 解析有效性', () => {
    for (const file of LOCALE_FILES) {
      it(`${file} 应能被 JSON.parse() 正确解析`, () => {
        const raw = fs.readFileSync(path.join(LOCALES_DIR, file), 'utf-8')
        expect(() => JSON.parse(raw)).not.toThrow()
        const parsed = JSON.parse(raw)
        expect(typeof parsed).toBe('object')
        expect(parsed).not.toBeNull()
      })
    }
  })

  // Test 2: ja.json 无 __ PH 残留
  describe('2. ja.json 占位符格式', () => {
    it('不应包含 __ PH 残留占位符', () => {
      const ja = loadLocale('ja.json')
      const entries = getAllEntries(ja)
      const phResiduals = entries.filter(
        ([, val]) => typeof val === 'string' && val.includes('__ PH')
      )
      expect(phResiduals).toEqual([])
    })

    it('不应包含 HTML 实体 (&#)', () => {
      const ja = loadLocale('ja.json')
      const entries = getAllEntries(ja)
      const htmlEntities = entries.filter(
        ([, val]) => typeof val === 'string' && /&#\d+;/.test(val)
      )
      expect(htmlEntities).toEqual([])
    })
  })

  // Test 3: zh-TW.json 术语修正验证
  describe('3. zh-TW.json 术语修正', () => {
    const bannedTerms = [
      { term: '登錄', correct: '登入', context: '应使用台湾用语「登入」' },
      { term: '私隱', correct: '隱私', context: '应使用「隱私」' },
      { term: '碰撞數據', correct: '溫度', context: 'temperature 应翻译为「溫度」' },
      { term: '下載資訊', correct: '訂閱', context: 'subscription 应翻译为「訂閱」' },
    ]

    const zhTW = loadLocale('zh-TW.json')
    const entries = getAllEntries(zhTW)

    for (const { term, correct, context } of bannedTerms) {
      it(`不应包含错误术语「${term}」(${context})`, () => {
        const found = entries.filter(
          ([, val]) => typeof val === 'string' && val.includes(term)
        )
        expect(found).toEqual([])
      })
    }

    it('auth.loginSuccess 应为「登入成功」', () => {
      const val = getValueByPath(zhTW, 'auth.loginSuccess')
      expect(val).toBe('登入成功')
    })

    it('settings.about.privacyPolicy 应为「隱私政策」', () => {
      const val = getValueByPath(zhTW, 'settings.about.privacyPolicy')
      expect(val).toBe('隱私政策')
    })
  })

  // Test 4: en.json 和 zh.json 无重复顶层 key
  describe('4. 无重复顶层 key', () => {
    for (const file of [REFERENCE_LOCALE, 'zh.json'] as const) {
      it(`${file} 不应有重复顶层 key`, () => {
        const raw = fs.readFileSync(path.join(LOCALES_DIR, file), 'utf-8')
        // 用正则提取顶层 key（缩进 2 空格的 key）
        const topLevelKeys = raw
          .split('\n')
          .filter((line) => /^  "[^"]+":/.test(line))
          .map((line) => {
            const match = line.match(/^  "([^"]+)"/)
            return match ? match[1] : ''
          })
          .filter(Boolean)

        const seen = new Set<string>()
        const duplicates: string[] = []
        for (const key of topLevelKeys) {
          if (seen.has(key)) {
            duplicates.push(key)
          }
          seen.add(key)
        }
        expect(duplicates).toEqual([])
      })
    }
  })

  // Test 5: 4 个文件的顶层 key 集合完全一致
  describe('5. 顶层 key 集合一致性', () => {
    it('所有语言文件的完整 key 集合应与 en.json 一致', () => {
      const enKeys = new Set(getAllKeys(loadLocale(REFERENCE_LOCALE)))

      for (const file of LOCALE_FILES) {
        if (file === REFERENCE_LOCALE) continue
        const localeKeys = new Set(getAllKeys(loadLocale(file)))

        const missingFromLocale = [...enKeys].filter((k) => !localeKeys.has(k))
        const extraInLocale = [...localeKeys].filter((k) => !enKeys.has(k))

        expect(missingFromLocale).withContext(`Missing from ${file}`).toEqual([])
        expect(extraInLocale).withContext(`Extra in ${file}`).toEqual([])
      }
    })
  })

  // Test 6: 所有 {{variable}} 占位符在 4 个文件中一致
  describe('6. 占位符一致性', () => {
    it('所有包含 {{variable}} 的键在各语言中应有相同的占位符集合', () => {
      const en = loadLocale(REFERENCE_LOCALE)
      const locales: Record<string, Record<string, unknown>> = {
        ja: loadLocale('ja.json'),
        zh: loadLocale('zh.json'),
        'zh-TW': loadLocale('zh-TW.json'),
      }

      const enEntries = getAllEntries(en)
      const mismatches: Array<{
        locale: string
        key: string
        enPH: string[]
        localePH: string[]
      }> = []

      for (const [key, enVal] of enEntries) {
        if (typeof enVal !== 'string') continue
        const enPH = getPlaceholders(enVal)
        if (enPH.length === 0) continue

        for (const [locale, data] of Object.entries(locales)) {
          const localeVal = getValueByPath(data, key)
          if (typeof localeVal !== 'string') continue

          const localePH = getPlaceholders(localeVal)
          if (JSON.stringify(enPH) !== JSON.stringify(localePH)) {
            mismatches.push({ locale, key, enPH, localePH })
          }
        }
      }

      expect(mismatches).toEqual([])
    })
  })
})
