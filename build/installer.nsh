; Cherry Agent 自定义卸载宏
; 在默认卸载流程完成后执行，询问用户是否删除用户数据

!macro customUnInstall
  SetShellVarContext current  ; 显式指定当前用户（perMachine: false 环境下更安全）

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除聊天记录、配置和技能数据？$\n$\n选「是」：彻底清除所有用户数据（不可恢复）$\n选「否」：仅卸载程序，保留数据供下次使用" \
    IDYES deletedata IDNO done

  deletedata:
    ; 当前版本目录名（Cherry Agent）
    RMDir /r /REBOOTOK "$APPDATA\Cherry Agent"
    RMDir /r /REBOOTOK "$LOCALAPPDATA\Cherry Agent"
    ; 旧版本可能使用的目录名（cherry-agent）
    RMDir /r /REBOOTOK "$APPDATA\cherry-agent"
    RMDir /r /REBOOTOK "$LOCALAPPDATA\cherry-agent"
    ; electron-updater 缓存目录
    RMDir /r /REBOOTOK "$LOCALAPPDATA\cherry-agent-updater"
  done:
!macroend
