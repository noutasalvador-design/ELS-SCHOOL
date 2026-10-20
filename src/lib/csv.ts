export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' && quoted && source[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if ((ch === ";" || ch === ",") && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some(value => value.length)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(value => value.length)) rows.push(row);
  return rows;
}

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
