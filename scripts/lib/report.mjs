// Printing diagnostics: `repo/file:line: level: message`, or, with
// `annotate`, as GitHub Actions annotations on the file (for check-records,
// whose files are the checked-out repo's).

export function report(diagnostics, { annotate = false } = {}) {
  const sorted = [...diagnostics].sort(
    (a, b) => a.repo.localeCompare(b.repo) || a.file.localeCompare(b.file) || a.line - b.line,
  );
  for (const d of sorted) {
    if (annotate) console.log(`::${d.level} file=${d.file},line=${d.line}::${d.msg}`);
    else console.error(`${d.repo}/${d.file}:${d.line}: ${d.level}: ${d.msg}`);
  }
  const errors = diagnostics.filter((d) => d.level === 'error').length;
  const warnings = diagnostics.length - errors;
  return { errors, warnings };
}
