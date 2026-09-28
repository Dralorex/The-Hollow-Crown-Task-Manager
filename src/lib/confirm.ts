/** Shared browser confirm for destructive actions. */
export function confirmDelete(label: string): boolean {
  return window.confirm(
    `Are you sure you want to delete ${label}? This can’t be undone.`,
  );
}
