/** Pages open without the beta access code (#148): the code screen, and the pages behind email links. */
export function isOpenPage(pathname: string) {
  return (
    pathname === "/access" || pathname === "/reset-password" || pathname.startsWith("/invite/")
  );
}
