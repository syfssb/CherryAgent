export type DesktopLanguage = 'zh' | 'zh-TW' | 'en' | 'ja'

type DesktopMessageKey =
  | 'notification.notSupported'
  | 'notification.checkFailed'
  | 'notification.showFailed'
  | 'update.downloadNow'
  | 'update.remindLater'
  | 'update.newVersionFound'
  | 'update.versionDetected'
  | 'update.browserDownloadDetail'
  | 'update.requiredTitle'
  | 'update.requiredVersionDetected'
  | 'update.requiredDetailIntro'
  | 'update.releaseNotes'
  | 'update.requiredAction'
  | 'update.updateNow'
  | 'update.quitApp'
  | 'update.downloadedTitle'
  | 'update.downloadedVersionReady'
  | 'update.installAndRestartDetail'
  | 'update.installNowAndRestart'
  | 'update.installLater'
  | 'update.downloadPromptIntro'
  | 'update.downloadPromptFallback'
  | 'update.notInApplicationsTitle'
  | 'update.notInApplicationsMsg'
  | 'update.notInApplicationsDetail'
  | 'update.ok'
  | 'workspace.noWorkspaceWatched'
  | 'workspace.pathOutsideWorkspace'
  | 'workspace.sourceDoesNotExist'
  | 'workspace.cannotCopyWorkspaceRoot'
  | 'workspace.clipboardEmpty'
  | 'workspace.clipboardSourceOutsideWorkspace'
  | 'workspace.clipboardSourceMissing'
  | 'workspace.targetDirectoryMissing'
  | 'workspace.cannotDeleteWorkspaceRoot'
  | 'workspace.targetDoesNotExist'
  | 'workspace.invalidPath'
  | 'workspace.invalidDirectory'
  | 'workspace.persistDefaultCwdFailed'
  | 'workspace.watchFailed'
  | 'workspace.unwatchFailed'
  | 'workspace.checkFailed'
  | 'workspace.getStatusFailed'
  | 'workspace.getRecentFailed'
  | 'workspace.addRecentFailed'
  | 'workspace.removeRecentFailed'
  | 'workspace.getCommonDirsFailed'
  | 'workspace.getTempDirFailed'
  | 'workspace.listDirFailed'
  | 'workspace.searchFilesFailed'
  | 'workspace.copyEntryFailed'
  | 'workspace.pasteEntryFailed'
  | 'workspace.deleteEntryFailed'
  | 'workspace.deleteFileFailed'
  | 'workspace.showInFolderFailed'
  | 'workspace.openPathFailed'

type TemplateValue = string | number

const messages: Record<DesktopLanguage, Record<DesktopMessageKey, string>> = {
  zh: {
    'notification.notSupported': '当前环境不支持系统通知',
    'notification.checkFailed': '检查通知能力失败',
    'notification.showFailed': '发送通知失败',
    'update.downloadNow': '立即下载',
    'update.remindLater': '稍后提醒',
    'update.newVersionFound': '发现新版本',
    'update.versionDetected': '检测到新版本 v{{version}}',
    'update.browserDownloadDetail': '点击“立即下载”将在浏览器中打开下载页面，下载完成后运行安装包即可完成更新。',
    'update.requiredTitle': '必须更新',
    'update.requiredVersionDetected': '检测到重要更新 v{{version}}',
    'update.requiredDetailIntro': '此更新包含重要的安全修复和功能改进，必须安装后才能继续使用。',
    'update.releaseNotes': '更新内容',
    'update.requiredAction': '点击“立即更新”开始下载安装。',
    'update.updateNow': '立即更新',
    'update.quitApp': '退出应用',
    'update.downloadedTitle': '更新已下载',
    'update.downloadedVersionReady': '新版本 v{{version}} 已下载完成',
    'update.installAndRestartDetail': '点击“立即安装并重启”完成更新，或稍后手动重启应用安装。',
    'update.installNowAndRestart': '立即安装并重启',
    'update.installLater': '稍后安装',
    'update.downloadPromptIntro': '是否立即下载并更新？',
    'update.downloadPromptFallback': '包含性能优化与问题修复。',
    'workspace.noWorkspaceWatched': '当前没有监听工作区',
    'workspace.pathOutsideWorkspace': '路径超出工作区范围',
    'workspace.sourceDoesNotExist': '源文件或目录不存在',
    'workspace.cannotCopyWorkspaceRoot': '不能复制工作区根目录',
    'workspace.clipboardEmpty': '剪贴板为空',
    'workspace.clipboardSourceOutsideWorkspace': '剪贴板中的源路径超出工作区范围',
    'workspace.clipboardSourceMissing': '剪贴板中的源文件已不存在',
    'workspace.targetDirectoryMissing': '目标目录不存在',
    'workspace.cannotDeleteWorkspaceRoot': '不能删除工作区根目录',
    'workspace.targetDoesNotExist': '目标不存在',
    'workspace.invalidPath': '无效路径',
    'workspace.invalidDirectory': '无效目录',
    'workspace.persistDefaultCwdFailed': '保存默认工作目录失败',
    'workspace.watchFailed': '无法监听工作区',
    'workspace.unwatchFailed': '停止监听工作区失败',
    'workspace.checkFailed': '检查工作区失败',
    'workspace.getStatusFailed': '获取工作区状态失败',
    'workspace.getRecentFailed': '获取最近工作区失败',
    'workspace.addRecentFailed': '添加最近工作区失败',
    'workspace.removeRecentFailed': '移除最近工作区失败',
    'workspace.getCommonDirsFailed': '获取常用目录失败',
    'workspace.getTempDirFailed': '获取临时目录失败',
    'workspace.listDirFailed': '读取目录内容失败',
    'workspace.searchFilesFailed': '搜索文件失败',
    'workspace.copyEntryFailed': '复制失败',
    'workspace.pasteEntryFailed': '粘贴失败',
    'workspace.deleteEntryFailed': '删除失败',
    'workspace.deleteFileFailed': '删除文件失败',
    'workspace.showInFolderFailed': '在文件夹中定位失败',
    'workspace.openPathFailed': '打开路径失败',
    'update.notInApplicationsTitle': '无法自动安装',
    'update.notInApplicationsMsg': '请先将 Cherry Agent 移动到"应用程序"文件夹，然后再安装更新。',
    'update.notInApplicationsDetail': '将应用从当前位置拖拽到"应用程序"文件夹，重新启动后即可自动安装更新。',
    'update.ok': '确定',
  },
  'zh-TW': {
    'notification.notSupported': '目前環境不支援系統通知',
    'notification.checkFailed': '檢查通知能力失敗',
    'notification.showFailed': '發送通知失敗',
    'update.downloadNow': '立即下載',
    'update.remindLater': '稍後提醒',
    'update.newVersionFound': '發現新版本',
    'update.versionDetected': '偵測到新版本 v{{version}}',
    'update.browserDownloadDetail': '點擊「立即下載」會在瀏覽器中開啟下載頁面，下載完成後執行安裝包即可完成更新。',
    'update.requiredTitle': '必須更新',
    'update.requiredVersionDetected': '偵測到重要更新 v{{version}}',
    'update.requiredDetailIntro': '此更新包含重要的安全修復與功能改進，必須安裝後才能繼續使用。',
    'update.releaseNotes': '更新內容',
    'update.requiredAction': '點擊「立即更新」開始下載與安裝。',
    'update.updateNow': '立即更新',
    'update.quitApp': '退出應用',
    'update.downloadedTitle': '更新已下載',
    'update.downloadedVersionReady': '新版本 v{{version}} 已下載完成',
    'update.installAndRestartDetail': '點擊「立即安裝並重新啟動」完成更新，或稍後手動重啟應用安裝。',
    'update.installNowAndRestart': '立即安裝並重新啟動',
    'update.installLater': '稍後安裝',
    'update.downloadPromptIntro': '是否立即下載並更新？',
    'update.downloadPromptFallback': '包含效能優化與問題修復。',
    'workspace.noWorkspaceWatched': '目前沒有監聽工作區',
    'workspace.pathOutsideWorkspace': '路徑超出工作區範圍',
    'workspace.sourceDoesNotExist': '來源檔案或目錄不存在',
    'workspace.cannotCopyWorkspaceRoot': '不能複製工作區根目錄',
    'workspace.clipboardEmpty': '剪貼簿為空',
    'workspace.clipboardSourceOutsideWorkspace': '剪貼簿中的來源路徑超出工作區範圍',
    'workspace.clipboardSourceMissing': '剪貼簿中的來源檔案已不存在',
    'workspace.targetDirectoryMissing': '目標目錄不存在',
    'workspace.cannotDeleteWorkspaceRoot': '不能刪除工作區根目錄',
    'workspace.targetDoesNotExist': '目標不存在',
    'workspace.invalidPath': '無效路徑',
    'workspace.invalidDirectory': '無效目錄',
    'workspace.persistDefaultCwdFailed': '儲存預設工作目錄失敗',
    'workspace.watchFailed': '無法監聽工作區',
    'workspace.unwatchFailed': '停止監聽工作區失敗',
    'workspace.checkFailed': '檢查工作區失敗',
    'workspace.getStatusFailed': '取得工作區狀態失敗',
    'workspace.getRecentFailed': '取得最近工作區失敗',
    'workspace.addRecentFailed': '新增最近工作區失敗',
    'workspace.removeRecentFailed': '移除最近工作區失敗',
    'workspace.getCommonDirsFailed': '取得常用目錄失敗',
    'workspace.getTempDirFailed': '取得暫存目錄失敗',
    'workspace.listDirFailed': '讀取目錄內容失敗',
    'workspace.searchFilesFailed': '搜尋檔案失敗',
    'workspace.copyEntryFailed': '複製失敗',
    'workspace.pasteEntryFailed': '貼上失敗',
    'workspace.deleteEntryFailed': '刪除失敗',
    'workspace.deleteFileFailed': '刪除檔案失敗',
    'workspace.showInFolderFailed': '在資料夾中定位失敗',
    'workspace.openPathFailed': '打開路徑失敗',
    'update.notInApplicationsTitle': '無法自動安裝',
    'update.notInApplicationsMsg': '請先將 Cherry Agent 移動到「應用程式」資料夾，然後再安裝更新。',
    'update.notInApplicationsDetail': '將應用程式從目前位置拖曳到「應用程式」資料夾，重新啟動後即可自動安裝更新。',
    'update.ok': '確定',
  },
  en: {
    'notification.notSupported': 'System notifications are not supported in the current environment',
    'notification.checkFailed': 'Failed to check notification support',
    'notification.showFailed': 'Failed to send notification',
    'update.downloadNow': 'Download Now',
    'update.remindLater': 'Remind Later',
    'update.newVersionFound': 'Update Available',
    'update.versionDetected': 'Version v{{version}} is available',
    'update.browserDownloadDetail': 'Click "Download Now" to open the download page in your browser. Run the installer after the download finishes to complete the update.',
    'update.requiredTitle': 'Update Required',
    'update.requiredVersionDetected': 'Critical update v{{version}} detected',
    'update.requiredDetailIntro': 'This update includes important security fixes and feature improvements. You must install it before continuing to use the app.',
    'update.releaseNotes': 'Release notes',
    'update.requiredAction': 'Click "Update Now" to start downloading and installing.',
    'update.updateNow': 'Update Now',
    'update.quitApp': 'Quit App',
    'update.downloadedTitle': 'Update Ready',
    'update.downloadedVersionReady': 'Version v{{version}} has been downloaded',
    'update.installAndRestartDetail': 'Click "Install Now and Restart" to finish the update, or restart the app later to install it manually.',
    'update.installNowAndRestart': 'Install Now and Restart',
    'update.installLater': 'Install Later',
    'update.downloadPromptIntro': 'Download and install the update now?',
    'update.downloadPromptFallback': 'Includes performance improvements and bug fixes.',
    'workspace.noWorkspaceWatched': 'No workspace is currently being watched',
    'workspace.pathOutsideWorkspace': 'The path is outside the workspace',
    'workspace.sourceDoesNotExist': 'The source file or folder does not exist',
    'workspace.cannotCopyWorkspaceRoot': 'Cannot copy the workspace root',
    'workspace.clipboardEmpty': 'The clipboard is empty',
    'workspace.clipboardSourceOutsideWorkspace': 'The clipboard source is outside the workspace',
    'workspace.clipboardSourceMissing': 'The clipboard source no longer exists',
    'workspace.targetDirectoryMissing': 'The target directory does not exist',
    'workspace.cannotDeleteWorkspaceRoot': 'Cannot delete the workspace root',
    'workspace.targetDoesNotExist': 'The target does not exist',
    'workspace.invalidPath': 'Invalid path',
    'workspace.invalidDirectory': 'Invalid directory',
    'workspace.persistDefaultCwdFailed': 'Failed to save the default working directory',
    'workspace.watchFailed': 'Failed to watch workspace',
    'workspace.unwatchFailed': 'Failed to stop watching workspace',
    'workspace.checkFailed': 'Failed to check workspace',
    'workspace.getStatusFailed': 'Failed to get workspace status',
    'workspace.getRecentFailed': 'Failed to get recent workspaces',
    'workspace.addRecentFailed': 'Failed to add recent workspace',
    'workspace.removeRecentFailed': 'Failed to remove recent workspace',
    'workspace.getCommonDirsFailed': 'Failed to get common directories',
    'workspace.getTempDirFailed': 'Failed to get temp directory',
    'workspace.listDirFailed': 'Failed to list directory contents',
    'workspace.searchFilesFailed': 'Failed to search files',
    'workspace.copyEntryFailed': 'Failed to copy item',
    'workspace.pasteEntryFailed': 'Failed to paste item',
    'workspace.deleteEntryFailed': 'Failed to delete item',
    'workspace.deleteFileFailed': 'Failed to delete file',
    'workspace.showInFolderFailed': 'Failed to reveal item in folder',
    'workspace.openPathFailed': 'Failed to open path',
    'update.notInApplicationsTitle': 'Cannot Install Automatically',
    'update.notInApplicationsMsg': 'Please move Cherry Agent to the Applications folder before installing the update.',
    'update.notInApplicationsDetail': 'Drag the app from its current location to the Applications folder, then restart to install the update automatically.',
    'update.ok': 'OK',
  },
  ja: {
    'notification.notSupported': '現在の環境ではシステム通知を利用できません',
    'notification.checkFailed': '通知機能の確認に失敗しました',
    'notification.showFailed': '通知の送信に失敗しました',
    'update.downloadNow': '今すぐダウンロード',
    'update.remindLater': '後で通知',
    'update.newVersionFound': 'アップデートがあります',
    'update.versionDetected': '新しいバージョン v{{version}} を利用できます',
    'update.browserDownloadDetail': '「今すぐダウンロード」をクリックするとブラウザでダウンロードページが開きます。ダウンロード完了後にインストーラーを実行して更新を完了してください。',
    'update.requiredTitle': '更新が必要です',
    'update.requiredVersionDetected': '重要な更新 v{{version}} が見つかりました',
    'update.requiredDetailIntro': 'この更新には重要なセキュリティ修正と機能改善が含まれています。アプリを使い続けるにはインストールが必要です。',
    'update.releaseNotes': '更新内容',
    'update.requiredAction': '「今すぐ更新」をクリックしてダウンロードとインストールを開始してください。',
    'update.updateNow': '今すぐ更新',
    'update.quitApp': 'アプリを終了',
    'update.downloadedTitle': '更新をインストールできます',
    'update.downloadedVersionReady': 'バージョン v{{version}} のダウンロードが完了しました',
    'update.installAndRestartDetail': '「今すぐインストールして再起動」をクリックして更新を完了するか、後でアプリを再起動して手動でインストールしてください。',
    'update.installNowAndRestart': '今すぐインストールして再起動',
    'update.installLater': '後でインストール',
    'update.downloadPromptIntro': '今すぐ更新をダウンロードしてインストールしますか？',
    'update.downloadPromptFallback': 'パフォーマンス改善と不具合修正が含まれています。',
    'workspace.noWorkspaceWatched': '現在監視中のワークスペースがありません',
    'workspace.pathOutsideWorkspace': 'パスがワークスペースの外にあります',
    'workspace.sourceDoesNotExist': '元のファイルまたはフォルダーが存在しません',
    'workspace.cannotCopyWorkspaceRoot': 'ワークスペースのルートはコピーできません',
    'workspace.clipboardEmpty': 'クリップボードは空です',
    'workspace.clipboardSourceOutsideWorkspace': 'クリップボード内の元パスがワークスペースの外にあります',
    'workspace.clipboardSourceMissing': 'クリップボード内の元ファイルが存在しません',
    'workspace.targetDirectoryMissing': '対象ディレクトリが存在しません',
    'workspace.cannotDeleteWorkspaceRoot': 'ワークスペースのルートは削除できません',
    'workspace.targetDoesNotExist': '対象が存在しません',
    'workspace.invalidPath': '無効なパスです',
    'workspace.invalidDirectory': '無効なディレクトリです',
    'workspace.persistDefaultCwdFailed': '既定の作業ディレクトリの保存に失敗しました',
    'workspace.watchFailed': 'ワークスペースの監視に失敗しました',
    'workspace.unwatchFailed': 'ワークスペース監視の停止に失敗しました',
    'workspace.checkFailed': 'ワークスペースの確認に失敗しました',
    'workspace.getStatusFailed': 'ワークスペース状態の取得に失敗しました',
    'workspace.getRecentFailed': '最近のワークスペースの取得に失敗しました',
    'workspace.addRecentFailed': '最近のワークスペースへの追加に失敗しました',
    'workspace.removeRecentFailed': '最近のワークスペースの削除に失敗しました',
    'workspace.getCommonDirsFailed': 'よく使うフォルダーの取得に失敗しました',
    'workspace.getTempDirFailed': '一時ディレクトリの取得に失敗しました',
    'workspace.listDirFailed': 'ディレクトリ内容の読み取りに失敗しました',
    'workspace.searchFilesFailed': 'ファイル検索に失敗しました',
    'workspace.copyEntryFailed': 'コピーに失敗しました',
    'workspace.pasteEntryFailed': '貼り付けに失敗しました',
    'workspace.deleteEntryFailed': '削除に失敗しました',
    'workspace.deleteFileFailed': 'ファイルの削除に失敗しました',
    'workspace.showInFolderFailed': 'フォルダーでの表示に失敗しました',
    'workspace.openPathFailed': 'パスを開けませんでした',
    'update.notInApplicationsTitle': '自動インストールできません',
    'update.notInApplicationsMsg': 'アップデートをインストールする前に、Cherry Agent を「アプリケーション」フォルダに移動してください。',
    'update.notInApplicationsDetail': 'アプリを現在の場所から「アプリケーション」フォルダにドラッグし、再起動すると自動的にインストールされます。',
    'update.ok': 'OK',
  },
}

let currentDesktopLanguage: DesktopLanguage = 'en'

export function normalizeDesktopLanguage(language?: string | null): DesktopLanguage {
  const normalized = (language ?? '').toLowerCase()
  if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk') || normalized.startsWith('zh-mo')) {
    return 'zh-TW'
  }
  if (normalized.startsWith('zh')) return 'zh'
  if (normalized.startsWith('ja')) return 'ja'
  if (normalized.startsWith('en')) return 'en'
  return 'en'
}

export function setDesktopLanguage(language?: string | null): DesktopLanguage {
  currentDesktopLanguage = normalizeDesktopLanguage(language)
  return currentDesktopLanguage
}

export function getDesktopLanguage(): DesktopLanguage {
  return currentDesktopLanguage
}

export function tDesktop(
  key: DesktopMessageKey,
  variables?: Record<string, TemplateValue>,
  language?: string | null,
): string {
  const resolvedLanguage = language ? normalizeDesktopLanguage(language) : currentDesktopLanguage
  const template = messages[resolvedLanguage][key] ?? messages.en[key]

  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = variables?.[name]
    return value === undefined ? '' : String(value)
  })
}
