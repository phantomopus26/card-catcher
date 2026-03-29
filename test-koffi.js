const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const HWND = 'int64';
const BOOL = 'int';
const WNDENUMPROC = koffi.proto('WNDENUMPROC', BOOL, [HWND, 'int64']);

const EnumWindows = user32.func('EnumWindows', BOOL, [koffi.pointer(WNDENUMPROC), 'int64']);
const GetWindowTextA = user32.func('GetWindowTextA', 'int', [HWND, 'uint8 *', 'int']);
const IsWindowVisible = user32.func('IsWindowVisible', BOOL, [HWND]);
const IsIconic = user32.func('IsIconic', BOOL, [HWND]);

const windows = [];

const callback = koffi.register((hwnd, _lParam) => {
  if (!IsWindowVisible(hwnd)) return 1;
  if (IsIconic(hwnd)) return 1;

  try {
    const buf = Buffer.alloc(256);
    const len = GetWindowTextA(hwnd, buf, 256);
    if (len > 2) {
      const title = buf.toString('utf8', 0, len);
      windows.push({ hwnd: Number(hwnd), title });
    }
  } catch (e) {
    console.error('Error getting title:', e.message);
  }

  return 1;
}, koffi.pointer(WNDENUMPROC));

EnumWindows(callback, 0);
koffi.unregister(callback);

console.log(`Found ${windows.length} windows:`);
for (const w of windows) {
  console.log(`  [${w.hwnd}] ${w.title}`);
}
