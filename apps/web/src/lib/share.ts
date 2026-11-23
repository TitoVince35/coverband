// Sharing a file with the phone's share sheet (Web Share API, #330), or downloading it where the
// browser can't share files.

/** Whether this browser shares files (Android's Chrome, Safari on an iPhone). */
export function canShareFiles(file: File) {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/** Saves a file as a download, named `name`. */
export function downloadFile(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Shares the file at `url` (the API's, the member's session) through the share sheet, or
 * downloads it where files can't be shared. A share the member cancels isn't an error.
 */
export async function shareFile(url: string, name: string, title: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const file = new File([blob], name, { type: blob.type });
  if (!canShareFiles(file)) {
    downloadFile(file, name);
    return "downloaded" as const;
  }
  try {
    await navigator.share({ files: [file], title });
    return "shared" as const;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled" as const;
    throw error;
  }
}

/** A file name from a title and its extension: "Rock night flyer.jpg". */
export function posterFileName(title: string, extension: string) {
  const base = title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "poster";
  return `${base}.${extension}`;
}
