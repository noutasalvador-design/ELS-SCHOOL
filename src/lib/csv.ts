export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const values = Array.isArray(rows) ? rows : [];
  const columns = Array.from(new Set(values.flatMap(row => Object.keys(row || {}))));
  const quote = (value: unknown) => {
    const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const csv = [columns.map(quote).join(";"), ...values.map(row => columns.map(key => quote(row[key])).join(";"))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
