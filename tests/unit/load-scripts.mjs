// Loads the app's classic browser scripts into one isolated context, the way
// index.html does, and returns a function that evaluates expressions in it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function loadScripts(files, globals = {}) {
  const context = vm.createContext({ console, URL, ...globals });
  for (const file of files) {
    vm.runInContext(readFileSync(root + file, 'utf8'), context, { filename: file });
  }
  return expression => vm.runInContext(expression, context);
}
