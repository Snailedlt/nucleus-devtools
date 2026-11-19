// Game.dll: reads the cursor and keys (export GameMain).
#include <windows.h>
__declspec(dllexport) void GameMain(void) {
  POINT p; GetCursorPos(&p); SetCursorPos(1, 1); ClipCursor(NULL);
  GetAsyncKeyState(VK_SPACE); GetKeyState(VK_SHIFT); ShowCursor(FALSE); SetFocus(NULL);
}
