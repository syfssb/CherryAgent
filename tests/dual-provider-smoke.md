# 双栈 Provider Smoke Test 清单

## 1. 会话管理
- [ ] Claude provider 创建新会话
- [ ] Claude provider 继续已有会话
- [ ] Claude provider 停止会话
- [ ] Claude provider 删除会话
- [ ] Codex provider 创建新会话（需 enableCodexRunner=true）
- [ ] Codex provider 继续已有会话
- [ ] Codex provider 停止会话
- [ ] Codex provider 删除会话
- [ ] Provider 切换后会话列表正确显示

## 2. 权限交互
- [ ] Claude: default 模式 - 逐工具审批
- [ ] Claude: acceptEdits 模式 - 自动批准编辑
- [ ] Claude: bypassPermissions 模式 - 全自动
- [ ] Codex: 策略级审批正确映射
- [ ] 权限弹窗显示正确的 provider 信息

## 3. Skills
- [ ] Claude 兼容 skill 正确加载
- [ ] Codex 兼容 skill 正确加载
- [ ] 不兼容 skill 显示降级提示
- [ ] Skill 目录发现双 runtime 正确

## 4. 计费
- [ ] Claude 请求正确记录 provider
- [ ] Codex 请求正确记录 provider
- [ ] 余额扣减正确
- [ ] 使用量统计按 provider 可区分

## 5. 下载注册漏斗
- [ ] 落地页正常加载
- [ ] 注册流程完整
- [ ] 下载链接有效
- [ ] 埋点事件正确触发

## 6. Feature Flags
- [ ] 所有 flag 关闭时行为与当前版本一致
- [ ] desktop.enableCodexRunner 开启后 Codex 选项可见
- [ ] desktop.enableProviderSwitch 开启后切换 UI 可见
- [ ] server.enableCodexProvider 开启后后台 Codex 配置可见
- [ ] server.enableRuntimeDimension 开启后统计区分 runtime

## 7. 旧数据兼容
- [ ] 老会话（含 claude_session_id）可正常读取
- [ ] 老会话可继续对话
- [ ] 导入导出不丢失数据
