// war3.exe: the game; loads Game.dll and runs its message loop.
#include <windows.h>
int WINAPI WinMain(HINSTANCE h, HINSTANCE p, LPSTR c, int n) {
  MSG m; HMODULE dll = LoadLibraryA("Game.dll");
  CreateEventA(NULL, FALSE, FALSE, "Warcraft III Game Application");
  PeekMessageA(&m, NULL, 0, 0, PM_REMOVE); GetForegroundWindow();
  return dll ? 0 : 1;
}
