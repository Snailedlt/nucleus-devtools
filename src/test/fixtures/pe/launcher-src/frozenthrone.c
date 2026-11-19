// Frozen Throne.exe: starts war3.exe -tft, as Warcraft III's launcher does.
#include <windows.h>
int WINAPI WinMain(HINSTANCE h, HINSTANCE p, LPSTR c, int n) {
  STARTUPINFOA si = { sizeof si }; PROCESS_INFORMATION pi; char cmd[300] = "war3.exe -tft";
  return !CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
}
