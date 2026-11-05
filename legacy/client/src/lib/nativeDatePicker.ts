export function openNativeDatePicker(input: HTMLInputElement | null): boolean {
  if (!input || input.disabled || input.readOnly) return false;

  input.focus({ preventScroll: true });
  if (typeof input.showPicker !== "function") return false;

  try {
    input.showPicker();
    return true;
  } catch {
    return false;
  }
}
