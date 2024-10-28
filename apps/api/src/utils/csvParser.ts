export interface ParsedStudentRow {
  fullName: string;
  tag: string | null;
}

const HEADER_NAMES = new Set([
  'nom',
  'name',
  'fullname',
  'full_name',
  'étudiant',
  'etudiant',
  'student',
  'prénom',
  'prenom'
]);

export function parseCsvStudents(content: string): ParsedStudentRow[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const results: ParsedStudentRow[] = [];
  let startIndex = 0;

  // Header detection
  const firstLine = lines[0];
  if (firstLine) {
    const delimiter = firstLine.includes(';') ? ';' : ',';
    const firstLineParts = parseLine(firstLine, delimiter);
    const firstPart = firstLineParts[0];
    if (firstPart) {
      const candidateHeader = firstPart.toLowerCase().trim();
      if (HEADER_NAMES.has(candidateHeader)) {
        startIndex = 1;
      }
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      continue;
    }

    const delim = line.includes(';') ? ';' : ',';
    const parts = parseLine(line, delim);

    const firstCol = parts[0];
    if (!firstCol) {
      continue;
    }

    const fullName = firstCol.trim();
    if (!fullName) {
      continue;
    }

    const rawTag = parts.length > 1 && parts[1] !== undefined ? parts[1].trim() : null;
    const tag = rawTag && rawTag.length > 0 ? rawTag.slice(0, 40) : null;

    results.push({
      fullName: fullName.slice(0, 120),
      tag
    });
  }

  return results;
}

function parseLine(line: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      if (char !== undefined) {
        current += char;
      }
    }
  }

  parts.push(current.trim());
  return parts;
}
