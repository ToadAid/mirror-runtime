export function normalizeMirrorPeerBaseUrl(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

export function buildMirrorSyncUpdatesUrl(baseUrl: string, paths: string[] = []): string {
  const url = new URL(`${normalizeMirrorPeerBaseUrl(baseUrl)}/mirror-sync/updates`);
  if (paths.length > 0) {
    url.searchParams.set("include_content", "1");
    url.searchParams.set("paths", paths.join(","));
  }
  return url.toString();
}

export function buildMirrorSyncAnnounceUrl(baseUrl: string): string {
  return `${normalizeMirrorPeerBaseUrl(baseUrl)}/mirror-sync/announce`;
}
