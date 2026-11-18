// New Handler as one guided flow: a single quick input that goes step by step (with its step count and a Back
// button), then saves <Name>.js with its <Name>/ folder (Game.Folder) where you pick. Escape at any step stops.
import * as vscode from 'vscode';
import fs from 'node:fs';
import { FEATURES, renderHandler, toHandlerFileName, validateGameName, type Feature } from './core/templates';
import { log } from './log';

const TITLE = 'New Nucleus Co-op handler';
const BACK = Symbol('back');
type Back = typeof BACK;

export interface NewHandlerAnswers {
  gameName: string;
  executableName: string;
  steamId?: string;
  features: Feature[];
}

const validateExe = (v: string) => (/^[^\\/:*?"<>|\u0000-\u001f]+\.exe$/i.test(v.trim()) ? undefined : 'Enter a file name ending in .exe (no tabs or other control characters)');
const validateSteamId = (v: string) => (!v.trim() || /^\d+$/.test(v.trim()) ? undefined : 'Digits only');

function inputStep(o: { step: number; total: number; prompt: string; placeholder?: string; value: string; validate: (v: string) => string | undefined }): Promise<string | Back | undefined> {
  return new Promise((resolve) => {
    const box = vscode.window.createInputBox();
    box.title = TITLE;
    box.step = o.step;
    box.totalSteps = o.total;
    box.prompt = o.prompt;
    box.placeholder = o.placeholder;
    box.value = o.value;
    box.ignoreFocusOut = true;
    box.buttons = o.step > 1 ? [vscode.QuickInputButtons.Back] : [];
    let done = false;
    const finish = (v: string | Back | undefined) => {
      if (done) return;
      done = true;
      resolve(v);
      box.dispose();
    };
    box.onDidChangeValue((v) => (box.validationMessage = v ? o.validate(v) : undefined));
    box.onDidAccept(() => {
      const err = o.validate(box.value);
      if (err) box.validationMessage = err;
      else finish(box.value.trim());
    });
    box.onDidTriggerButton((b) => b === vscode.QuickInputButtons.Back && finish(BACK));
    box.onDidHide(() => finish(undefined));
    box.show();
  });
}

function pickStep<T extends vscode.QuickPickItem>(o: { step: number; total: number; placeholder: string; items: T[]; many?: boolean; selected?: T[] }): Promise<readonly T[] | Back | undefined> {
  return new Promise((resolve) => {
    const qp = vscode.window.createQuickPick<T>();
    qp.title = TITLE;
    qp.step = o.step;
    qp.totalSteps = o.total;
    qp.placeholder = o.placeholder;
    qp.canSelectMany = !!o.many;
    qp.items = o.items;
    if (o.selected) qp.selectedItems = o.selected;
    qp.ignoreFocusOut = true;
    qp.buttons = o.step > 1 ? [vscode.QuickInputButtons.Back] : [];
    let done = false;
    const finish = (v: readonly T[] | Back | undefined) => {
      if (done) return;
      done = true;
      resolve(v);
      qp.dispose();
    };
    qp.onDidAccept(() => finish(o.many ? qp.selectedItems : qp.activeItems.length ? [qp.activeItems[0]] : qp.selectedItems));
    qp.onDidTriggerButton((b) => b === vscode.QuickInputButtons.Back && finish(BACK));
    qp.onDidHide(() => finish(undefined));
    qp.show();
  });
}

type Where = vscode.QuickPickItem & { uri?: vscode.Uri; choose?: true };

/** The whole flow: the answers and the folder to save in (undefined: an untitled editor), or undefined if cancelled. */
export async function askNewHandler(): Promise<{ answers: NewHandlerAnswers; folder?: vscode.Uri } | undefined> {
  const total = 5;
  const a = { gameName: '', executableName: '', steamId: '', features: [] as Feature[] };
  let step = 1;
  for (;;) {
    if (step === 1) {
      const v = await inputStep({ step, total, prompt: 'The game\'s name, as Nucleus Co-op shows it', placeholder: 'e.g. Borderlands 2', value: a.gameName, validate: (x) => validateGameName(x) });
      if (v === undefined || v === BACK) return undefined;
      a.gameName = v;
    } else if (step === 2) {
      const v = await inputStep({ step, total, prompt: 'The game\'s .exe file name (how Nucleus Co-op finds the game)', placeholder: 'e.g. Borderlands2.exe', value: a.executableName, validate: validateExe });
      if (v === undefined) return undefined;
      if (v === BACK) { step--; continue; }
      a.executableName = v;
    } else if (step === 3) {
      const v = await inputStep({ step, total, prompt: 'Steam app ID (optional: leave empty and press Enter; steamdb.info has it)', value: a.steamId, validate: validateSteamId });
      if (v === undefined) return undefined;
      if (v === BACK) { step--; continue; }
      a.steamId = v;
    } else if (step === 4) {
      const items = FEATURES.map((f) => ({ label: f.label, detail: f.detail, id: f.id }));
      const v = await pickStep({ step, total, placeholder: 'Optional features (Space to tick, Enter to go on)', items, many: true, selected: items.filter((i) => a.features.includes(i.id)) });
      if (v === undefined) return undefined;
      if (v === BACK) { step--; continue; }
      a.features = v.map((i) => i.id);
    } else {
      const name = toHandlerFileName(a.gameName);
      const items: Where[] = [
        ...(vscode.workspace.workspaceFolders ?? []).map((f) => ({ label: `$(folder) ${f.name}`, description: f.uri.fsPath, uri: f.uri })),
        { label: '$(folder-opened) Choose a folder…', choose: true },
        { label: '$(file) Don\'t save yet', description: 'an untitled editor' },
      ];
      const v = await pickStep({ step, total, placeholder: `Where to save ${name}.js and its ${name}/ folder`, items });
      if (v === undefined) return undefined;
      if (v === BACK) { step--; continue; }
      const where = v[0];
      if (!where) return undefined;
      const answers = { gameName: a.gameName, executableName: a.executableName, steamId: a.steamId || undefined, features: a.features };
      if (where.uri) return { answers, folder: where.uri };
      if (!where.choose) return { answers };
      const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: `The folder for ${name}.js and ${name}/`, openLabel: 'Save Here' });
      if (!picked?.[0]) continue; // back to the choice of folder
      return { answers, folder: picked[0] };
    }
    step++;
  }
}

export async function newHandler() {
  const r = await askNewHandler();
  if (!r) return;
  const content = renderHandler({ gameName: r.answers.gameName, executableName: r.answers.executableName, steamId: r.answers.steamId, features: r.answers.features });
  if (!r.folder) {
    const asHandler = vscode.workspace.getConfiguration('splitscreenme').get('languageMode', 'handler') === 'handler';
    const doc = await vscode.workspace.openTextDocument({ language: asHandler ? 'nucleus-handler' : 'javascript', content });
    await vscode.window.showTextDocument(doc);
    return;
  }
  const name = toHandlerFileName(r.answers.gameName);
  const file = vscode.Uri.joinPath(r.folder, `${name}.js`);
  const askReplace = async () => (await vscode.window.showWarningMessage(`${name}.js is already in ${r.folder!.fsPath}. Replace it?`, { modal: true }, 'Replace')) === 'Replace';
  let replace = await vscode.workspace.fs.stat(file).then(() => true, () => false);
  if (replace && !(await askReplace())) return;
  // Game.Folder: the files the handler brings along (configs, DLLs) go here, and Package puts them in the .nc. Made
  // first, so a file of that name stops it before the script is written.
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(r.folder, name));
  if (file.scheme === 'file') {
    // Never replace without the OK: a file that appeared since (a sync client) is asked about too.
    for (;;) {
      try {
        await fs.promises.writeFile(file.fsPath, content, { encoding: 'utf8', flag: replace ? 'w' : 'wx' });
        break;
      } catch (e: any) {
        if (e?.code !== 'EEXIST' || replace) throw e;
        if (!(await askReplace())) return;
        replace = true;
      }
    }
  } else {
    // Other file systems (remote, virtual): a create that fails when the file exists, never a plain write. Replacing
    // an existing handler is a text edit of the whole file, then a save, so Undo gives the old text back (a create
    // with overwrite would record deleting the file as its undo).
    for (;;) {
      if (replace) {
        const doc = await vscode.workspace.openTextDocument(file);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(file, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), content);
        if (!(await vscode.workspace.applyEdit(edit)) || !(await doc.save())) throw new Error(`Couldn't replace ${file.toString(true)}.`);
        break;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(file, { overwrite: false, contents: Buffer.from(content, 'utf8') });
      if (await vscode.workspace.applyEdit(edit)) break;
      const exists = await vscode.workspace.fs.stat(file).then(() => true, () => false);
      if (!exists) throw new Error(`Couldn't create ${file.toString(true)}.`);
      if (!(await askReplace())) return;
      replace = true;
    }
  }
  log.info(`New handler: ${file.fsPath} and ${name}/`);
  await vscode.window.showTextDocument(file);
}
