import koffi from 'koffi';
import { WindowInfo, WindowBounds } from '../../shared/types';
import { POKER_WINDOW_PATTERNS, POKER_WINDOW_EXCLUDE } from '../../shared/constants';

// Win32 API bindings via koffi
const user32 = koffi.load('user32.dll');

// Define Win32 types
const HWND = 'int64';
const BOOL = 'int';
const RECT = koffi.struct('RECT', {
  left: 'long',
  top: 'long',
  right: 'long',
  bottom: 'long',
});

// Define callback type for EnumWindows
const WNDENUMPROC = koffi.proto('WNDENUMPROC', BOOL, [HWND, 'int64']);

// Bind Win32 functions — use GetWindowTextA (ASCII) for simplicity
const EnumWindows = user32.func('EnumWindows', BOOL, [koffi.pointer(WNDENUMPROC), 'int64']);
const GetWindowTextA = user32.func('GetWindowTextA', 'int', [HWND, 'uint8 *', 'int']);
const GetWindowRect = user32.func('GetWindowRect', BOOL, [HWND, koffi.out(koffi.pointer(RECT))]);
const IsWindowVisible = user32.func('IsWindowVisible', BOOL, [HWND]);
const IsIconic = user32.func('IsIconic', BOOL, [HWND]);

function getWindowTitle(hwnd: number): string {
  try {
    const buf = Buffer.alloc(256);
    const len = GetWindowTextA(hwnd, buf, 256);
    if (len === 0) return '';
    return buf.toString('utf8', 0, len);
  } catch {
    return '';
  }
}

function getWindowBounds(hwnd: number): WindowBounds | null {
  const rect = { left: 0, top: 0, right: 0, bottom: 0 };
  const result = GetWindowRect(hwnd, rect);
  if (!result) return null;
  return {
    x: rect.left,
    y: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
  };
}

function isPokerWindow(title: string): boolean {
  if (POKER_WINDOW_EXCLUDE.some(pattern => pattern.test(title))) return false;
  return POKER_WINDOW_PATTERNS.some(pattern => pattern.test(title));
}

export function detectPokerWindows(): WindowInfo[] {
  const windows: WindowInfo[] = [];

  const callback = koffi.register((hwnd: number, _lParam: number) => {
    if (!IsWindowVisible(hwnd)) return 1;
    if (IsIconic(hwnd)) return 1; // skip minimized

    const title = getWindowTitle(hwnd);
    if (!title || !isPokerWindow(title)) return 1;

    const bounds = getWindowBounds(hwnd);
    if (!bounds || bounds.width < 200 || bounds.height < 150) return 1;

    windows.push({ hwnd: Number(hwnd), title, bounds });
    return 1; // continue enumeration
  }, koffi.pointer(WNDENUMPROC));

  EnumWindows(callback, 0);
  koffi.unregister(callback);

  return windows;
}

export function getWindowPosition(hwnd: number): WindowBounds | null {
  if (!IsWindowVisible(hwnd)) return null;
  return getWindowBounds(hwnd);
}

export function isWindowStillOpen(hwnd: number): boolean {
  return IsWindowVisible(hwnd) !== 0;
}

/**
 * List ALL visible windows for debugging.
 * Helps identify the actual Ignition window title.
 */
export function listAllWindows(): { hwnd: number; title: string }[] {
  const windows: { hwnd: number; title: string }[] = [];

  const callback = koffi.register((hwnd: number, _lParam: number) => {
    if (!IsWindowVisible(hwnd)) return 1;
    if (IsIconic(hwnd)) return 1;

    const title = getWindowTitle(hwnd);
    if (!title || title.length < 3) return 1;

    windows.push({ hwnd: Number(hwnd), title });
    return 1;
  }, koffi.pointer(WNDENUMPROC));

  EnumWindows(callback, 0);
  koffi.unregister(callback);

  return windows;
}
