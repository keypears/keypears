export type ExternalUrl = `http://${string}` | `https://${string}`;
export type LocalAssetPath = "/keypears.pdf";
export type LocalAnchor = `#${string}`;

export function parseExternalUrl(value: string): ExternalUrl {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("External navigation URL must use HTTP or HTTPS.");
  }
  return url.toString() as ExternalUrl;
}

export function replaceWithAppRoot(): never {
  window.location.replace("/");
  throw new Error("unreachable after location.replace");
}

export function leaveAppForExternalUrl(url: ExternalUrl): never {
  window.location.href = url;
  throw new Error("unreachable after external navigation");
}

export function submitExternalPost(form: HTMLFormElement): never {
  form.submit();
  throw new Error("unreachable after form submission");
}
