const UNITS = ["bytes", "KB", "MB", "GB", "TB"] as const;

/** A size as people read it, in powers of 1000 like the storage bills: "120 MB", "1.5 GB". */
export function formatBytes(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value)} ${UNITS[unit]}`;
}
