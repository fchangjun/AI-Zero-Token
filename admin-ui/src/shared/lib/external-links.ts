/** Reports whether opening was initiated; the destination site's availability is external. */
export async function openExternalUrl(value: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return false;
  } catch {
    return false;
  }
  try {
    if (window.desktopApp?.openExternal) return await window.desktopApp.openExternal(url.href);
    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
    return true;
  } catch {
    return false;
  }
}
