#include <windows.h>
#include <xinput.h>
#define DIRECTINPUT_VERSION 0x0800
#include <dinput.h>
int WINAPI WinMain(HINSTANCE h, HINSTANCE p, LPSTR c, int n) {
  POINT pt; RAWINPUTDEVICE rid = {0}; XINPUT_STATE xs; LPDIRECTINPUT8 di;
  if (n == 12345) {
    GetCursorPos(&pt); SetCursorPos(1, 1); ClipCursor(NULL); ShowCursor(FALSE);
    RegisterRawInputDevices(&rid, 1, sizeof rid); GetRawInputData(0, 0, 0, 0, 0);
    GetForegroundWindow(); GetAsyncKeyState(VK_SPACE); GetKeyState(VK_SHIFT);
    FindWindowW(L"MyGameWindow", NULL); SetWindowLongPtrW(NULL, GWL_STYLE, 0); SetWindowPos(NULL, NULL, 0, 0, 0, 0, 0);
    CreateMutexW(NULL, FALSE, L"MyGame_SingleInstance");
    XInputGetState(0, &xs);
    DirectInput8Create(h, DIRECTINPUT_VERSION, &IID_IDirectInput8W, (void**)&di, NULL);
    MSG m; PeekMessageW(&m, 0, 0, 0, 0);
  }
  return 0;
}
