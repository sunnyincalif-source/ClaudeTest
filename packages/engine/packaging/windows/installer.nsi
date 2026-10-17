; LeetTrace Windows installer (SPEC-PRODUCT §5, §10). Built by packaging/windows/build_installer.ps1:
;   makensis /DVERSION=1.1.0 /DSRC=<dist-bin\LeetTrace> /DOUT=<file.exe> installer.nsi
; Installs to Program Files, adds a Start-menu entry, and launches the app (as the signed-in
; user, never elevated). The app itself turns on start-at-login (HKCU Run) on first launch,
; so the engine runs at every sign-in with a tray icon, no terminal involved.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel admin
ManifestDPIAware true

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define APP "LeetTrace"
!define PUBLISHER "LeetTrace (open source)"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\LeetTrace"
!define RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"

Name "${APP}"
OutFile "${OUT}"
InstallDir "$PROGRAMFILES64\${APP}"
InstallDirRegKey HKLM "Software\${APP}" "InstallDir"
BrandingText "LeetTrace ${VERSION} · runs 100% on your machine"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "LeetTrace installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "MIT License"

!include "MUI2.nsh"
!include "x64.nsh"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Install LeetTrace ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "LeetTrace shows your LeetCode solution running step by step: call stack, memory and pointers, on the real test cases.$\r$\n$\r$\nIt installs a small engine that runs only on this computer and starts when you sign in, with an icon in the system tray. Your code never leaves your machine.$\r$\n$\r$\nAfter installing, add the LeetTrace extension to Chrome and open any LeetCode problem. It connects automatically, with no code to type.$\r$\n$\r$\nFirst time only: if Windows showed $\"Windows protected your PC$\" before this window, that is normal for a new unsigned app (More info, then Run anyway). You won't see it again."
!insertmacro MUI_PAGE_WELCOME
; "Before you start": the one-time SmartScreen step + what gets installed (SPEC-PRODUCT §10).
!define MUI_PAGE_HEADER_TEXT "Before you start"
!define MUI_PAGE_HEADER_SUBTEXT "The one-time Windows warning, and what LeetTrace installs."
!define MUI_LICENSEPAGE_TEXT_TOP "Read this once:"
!define MUI_LICENSEPAGE_TEXT_BOTTOM "Click Next to continue."
!define MUI_LICENSEPAGE_BUTTON "&Next >"
!insertmacro MUI_PAGE_LICENSE "${README}"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "LeetTrace is installed"
!define MUI_FINISHPAGE_TEXT "LeetTrace now runs in the background (look for its icon in the system tray) and starts when you sign in.$\r$\n$\r$\nNext: add the browser extension. The welcome page opens with a button for it."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Start LeetTrace and open the welcome page"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchAsUser
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "LeetTrace needs 64-bit Windows."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

; The installer runs elevated; start the app through Explorer so it runs as the signed-in
; user (an elevated engine would write its files and login item for the wrong account).
Function LaunchAsUser
  Exec '"$WINDIR\explorer.exe" "$INSTDIR\LeetTrace.exe"'
FunctionEnd

!macro StopRunning
  ; Upgrades and uninstalls: stop a running app/engine first (files would be locked).
  nsExec::Exec 'taskkill /F /T /IM LeetTrace.exe'
  nsExec::Exec 'taskkill /F /T /IM leettrace-cli.exe'
  Sleep 500
!macroend

Section "LeetTrace" SecMain
  SectionIn RO
  !insertmacro StopRunning
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\_internal"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall LeetTrace.exe"

  SetShellVarContext all
  CreateShortcut "$SMPROGRAMS\LeetTrace.lnk" "$INSTDIR\LeetTrace.exe" "" "$INSTDIR\LeetTrace.exe" 0 SW_SHOWNORMAL "" "Open LeetTrace"

  WriteRegStr HKLM "Software\${APP}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\LeetTrace.exe"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall LeetTrace.exe"'
  WriteRegStr HKLM "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall LeetTrace.exe" /S'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetRegView 64
  !insertmacro StopRunning
  ; Remove the login item the app registered for this user.
  DeleteRegValue HKCU "${RUN_KEY}" "LeetTrace"
  SetShellVarContext all
  Delete "$SMPROGRAMS\LeetTrace.lnk"
  Delete /REBOOTOK "$INSTDIR\LeetTrace.exe"
  Delete /REBOOTOK "$INSTDIR\leettrace-cli.exe"
  RMDir /r /REBOOTOK "$INSTDIR\_internal"
  Delete "$INSTDIR\Uninstall LeetTrace.exe"
  RMDir /r /REBOOTOK "$INSTDIR"
  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "Software\${APP}"
SectionEnd
