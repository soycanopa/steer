/** Une la URL base del proxy con el pathname actual del iframe. */
export function joinPreviewPageUrl(base: string, pathname: string): string {
  const u = new URL(base);
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  u.pathname = path;
  return u.toString();
}
