# PE fixtures

Tiny Windows programs for `src/test/pe.test.ts` and `importhooks.test.ts`, built with MinGW from the sources here
(nothing from a real game):

```bash
x86_64-w64-mingw32-gcc -Os -s -mwindows game.c -o game/MyGame.exe -lxinput1_3 -ldinput8 -ldxguid
i686-w64-mingw32-gcc -Os -s -mwindows game.c -o MyGame-x86.exe -lxinput1_3 -ldinput8 -ldxguid
x86_64-w64-mingw32-gcc -Os -s -shared engine.c -o game/Engine.dll
```

`launcher/` is a mock of a Warcraft III-style layout (32-bit): `Frozen Throne.exe` starts `war3.exe -tft`
(`CreateProcessA`), `war3.exe` loads `Game.dll`, which reads the cursor and keys.

```c
// Frozen Throne.exe
STARTUPINFOA si = { sizeof si }; PROCESS_INFORMATION pi; char cmd[300] = "war3.exe -tft";
CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
// war3.exe
LoadLibraryA("Game.dll"); CreateEventA(NULL, FALSE, FALSE, "Warcraft III Game Application"); PeekMessageA(...); GetForegroundWindow();
// Game.dll (export GameMain)
GetCursorPos(&p); SetCursorPos(1,1); ClipCursor(NULL); GetAsyncKeyState(VK_SPACE); GetKeyState(VK_SHIFT); ShowCursor(FALSE); SetFocus(NULL);
```
