# Fix all

**Fix All Problems That Can Be Fixed** applies every safe fix at once: a value of the wrong type, an option that moved, a list written as a single string. Problems that need your decision stay underlined, each with its own **Ctrl+.** fix.

To fix them on every save, add this to your settings:

```json
"editor.codeActionsOnSave": { "source.fixAll.nucleus": "explicit" }
```
