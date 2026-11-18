# PE fixtures

Tiny Windows programs for `src/test/importhooks.test.ts` (the PE parser's and the hints' tests), built with MinGW from the sources here
(nothing from a real game):

```bash
x86_64-w64-mingw32-gcc -Os -s -mwindows game.c -o game/MyGame.exe -lxinput1_3 -ldinput8 -ldxguid
i686-w64-mingw32-gcc -Os -s -mwindows game.c -o MyGame-x86.exe -lxinput1_3 -ldinput8 -ldxguid
x86_64-w64-mingw32-gcc -Os -s -shared engine.c -o game/Engine.dll
```

`launcher/` is a mock of a Warcraft III-style layout (32-bit): `Frozen Throne.exe` starts `war3.exe -tft`
(`CreateProcessA`), `war3.exe` loads `Game.dll`, which reads the cursor and keys. Sources in `launcher-src/`:

```bash
i686-w64-mingw32-gcc -Os -s -mwindows launcher-src/frozenthrone.c -o "launcher/Frozen Throne.exe"
i686-w64-mingw32-gcc -Os -s -mwindows launcher-src/war3.c -o launcher/war3.exe
i686-w64-mingw32-gcc -Os -s -shared launcher-src/game.c -o launcher/Game.dll
```
