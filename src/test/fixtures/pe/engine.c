#include <windows.h>
__declspec(dllexport) int Engine_Init(void) { return 1; }
__declspec(dllexport) void Engine_Shutdown(void) {}
__declspec(dllexport) int Input_PollGamepad(int i) { POINT p; GetCursorPos(&p); return i; }
__declspec(dllexport) void Window_SetFullscreen(int on) { SetWindowPos(0,0,0,0,0,0,0); }
