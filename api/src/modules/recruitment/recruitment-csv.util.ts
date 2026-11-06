export interface ParsedCandidateRow {
  rowNumber: number;
  name: string;
  email: string;
  phone: string;
  qualification: string;
  specialization?: string;
  college?: string;
  graduationYear?: number;
  totalExp: number;
  relevantExp: number;
  techSkills: string;
  softSkills?: string;
  currentLocation: string;
  preferredLocation?: string;
  currentCtc?: string;
  expectedCtc?: string;
  noticePeriod?: string;
  resumeLink?: string;
  source?: string;
  hrRemarks?: string;
  isValid: boolean;
  errors: string[];
}

export interface ExistingCandidateInfo {
  normalizedEmail: string;
  normalizedPhone: string;
  name: string;
  submittedByName: string;
  submittedAt: Date;
}

export const REQUIRED_CSV_COLUMNS = [
  'Candidate Name',
  'Email Address',
  'Phone Number',
  'Highest Qualification',
  'Specialization',
  'College / University',
  'Graduation Year',
  'Total Experience in Years',
  'Relevant Experience in Years',
  'Technical Skills',
  'Soft Skills',
  'Current Location',
  'Preferred Location',
  'Current CTC',
  'Expected CTC',
  'Notice Period',
  'Resume Link',
  'Candidate Source',
  'HR Support Remarks',
];

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  // Strip all non-digit characters
  const digits = (phone || '').replace(/\D/g, '');
  // If starts with country code 91 and has 12 digits, can keep last 10 for consistency
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Standard RFC-4180 CSV parser supporting quotes, commas within quotes,
 * escaped quotes (""), and multiple line breaks.
 */
export function parseCsvText(csvText: string): { headers: string[]; records: Record<string, string>[] } {
  // Remove BOM if present
  let cleanText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return { headers: [], records: [] };

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped double quote
          currentField += '"';
          i++;
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        // Handle CRLF
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  if (rows.length === 0) return { headers: [], records: [] };

  const rawHeaders = rows[0].map((h) => h.trim());
  const records: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip empty lines
    if (row.length === 1 && !row[0]) continue;
    if (row.every((cell) => !cell)) continue;

    const record: Record<string, string> = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      const header = rawHeaders[c];
      record[header] = row[c] !== undefined ? row[c].trim() : '';
    }
    records.push(record);
  }

  return { headers: rawHeaders, records };
}

/**
 * Normalizes field lookup across variations in casing or spacing.
 */
function getField(record: Record<string, string>, ...aliases: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const recordEntries = Object.entries(record).map(([k, v]) => [norm(k), v] as const);

  for (const alias of aliases) {
    const target = norm(alias);
    const found = recordEntries.find(([k]) => k === target);
    if (found !== undefined) return found[1];
  }
  return '';
}

export function validateCandidateRecords(
  records: Record<string, string>[],
  existingCandidates: ExistingCandidateInfo[],
): {
  valid: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ParsedCandidateRow[];
} {
  const parsedRows: ParsedCandidateRow[] = [];
  const seenEmails = new Map<string, number>(); // email -> rowNumber
  const seenPhones = new Map<string, number>(); // phone -> rowNumber

  const existingEmailMap = new Map<string, ExistingCandidateInfo>();
  const existingPhoneMap = new Map<string, ExistingCandidateInfo>();

  for (const ec of existingCandidates) {
    if (ec.normalizedEmail) existingEmailMap.set(ec.normalizedEmail, ec);
    if (ec.normalizedPhone) existingPhoneMap.set(ec.normalizedPhone, ec);
  }

  for (let i = 0; i < records.length; i++) {
    const rowNumber = i + 2; // Row 1 is header
    const r = records[i];
    const errors: string[] = [];

    const name = getField(r, 'Candidate Name', 'Name', 'FullName');
    const email = getField(r, 'Email Address', 'Email', 'Candidate Email');
    const phone = getField(r, 'Phone Number', 'Phone', 'Mobile', 'Contact Number');
    const qualification = getField(r, 'Highest Qualification', 'Qualification', 'Degree');
    const specialization = getField(r, 'Specialization', 'Branch', 'Stream') || undefined;
    const college = getField(r, 'College / University', 'College', 'University') || undefined;
    const gradYearStr = getField(r, 'Graduation Year', 'Year of Passing', 'Passing Year');
    const totalExpStr = getField(r, 'Total Experience in Years', 'Total Experience', 'Total Exp');
    const relevantExpStr = getField(r, 'Relevant Experience in Years', 'Relevant Experience', 'Relevant Exp');
    const techSkills = getField(r, 'Technical Skills', 'Tech Skills', 'Skills');
    const softSkills = getField(r, 'Soft Skills') || undefined;
    const currentLocation = getField(r, 'Current Location', 'Location', 'City');
    const preferredLocation = getField(r, 'Preferred Location') || undefined;
    const currentCtc = getField(r, 'Current CTC', 'Current CTC (LPA)', 'CTC') || undefined;
    const expectedCtc = getField(r, 'Expected CTC', 'Expected CTC (LPA)') || undefined;
    const noticePeriod = getField(r, 'Notice Period', 'Notice Period (Days)') || undefined;
    const resumeLink = getField(r, 'Resume Link', 'Resume', 'CV Link', 'Portfolio') || undefined;
    const source = getField(r, 'Candidate Source', 'Source') || undefined;
    const hrRemarks = getField(r, 'HR Support Remarks', 'Remarks', 'Notes') || undefined;

    // 1. Mandatory fields
    if (!name || name.length < 2) {
      errors.push('Candidate Name is required (minimum 2 characters)');
    }
    if (!email) {
      errors.push('Email Address is required');
    } else if (!isValidEmail(email)) {
      errors.push(`Invalid email format: "${email}" (expected example@domain.com)`);
    }

    if (!phone) {
      errors.push('Phone Number is required');
    } else {
      const cleanDigits = normalizePhone(phone);
      if (cleanDigits.length < 7 || cleanDigits.length > 15) {
        errors.push(`Invalid phone number: "${phone}" (must contain 7 to 15 digits)`);
      }
    }

    if (!qualification) {
      errors.push('Highest Qualification is required (e.g., B.Tech, MCA, MBA, B.Sc)');
    }

    if (!techSkills) {
      errors.push('Technical Skills are required');
    }

    if (!currentLocation) {
      errors.push('Current Location is required');
    }

    // 2. Numeric validation
    let totalExp = 0;
    if (totalExpStr === '') {
      errors.push('Total Experience in Years is required (numeric, e.g., 0, 1.5, 3)');
    } else {
      totalExp = Number(totalExpStr);
      if (isNaN(totalExp) || totalExp < 0) {
        errors.push(`Total Experience must be a positive number: got "${totalExpStr}"`);
      }
    }

    let relevantExp = 0;
    if (relevantExpStr === '') {
      errors.push('Relevant Experience in Years is required (numeric, e.g., 0, 1.5, 3)');
    } else {
      relevantExp = Number(relevantExpStr);
      if (isNaN(relevantExp) || relevantExp < 0) {
        errors.push(`Relevant Experience must be a positive number: got "${relevantExpStr}"`);
      } else if (!isNaN(totalExp) && relevantExp > totalExp) {
        errors.push(`Relevant Experience (${relevantExp} yrs) cannot exceed Total Experience (${totalExp} yrs)`);
      }
    }

    let graduationYear: number | undefined = undefined;
    if (gradYearStr) {
      graduationYear = parseInt(gradYearStr, 10);
      const currentYear = new Date().getFullYear();
      if (isNaN(graduationYear) || graduationYear < 1970 || graduationYear > currentYear + 6) {
        errors.push(`Graduation Year must be between 1970 and ${currentYear + 6}: got "${gradYearStr}"`);
      }
    }

    // 3. Resume link validation
    if (resumeLink && !isValidUrl(resumeLink)) {
      errors.push(`Resume Link must be a valid HTTP/HTTPS URL: got "${resumeLink}"`);
    }

    // 4. In-file duplicate detection
    const normEmail = normalizeEmail(email);
    const normPhone = normalizePhone(phone);

    if (normEmail) {
      if (seenEmails.has(normEmail)) {
        errors.push(`Duplicate email within uploaded file: matches row ${seenEmails.get(normEmail)}`);
      } else {
        seenEmails.set(normEmail, rowNumber);
      }
    }

    if (normPhone && normPhone.length >= 7) {
      if (seenPhones.has(normPhone)) {
        errors.push(`Duplicate phone number within uploaded file: matches row ${seenPhones.get(normPhone)}`);
      } else {
        seenPhones.set(normPhone, rowNumber);
      }
    }

    // 5. Database duplicate detection for this requirement
    if (normEmail && existingEmailMap.has(normEmail)) {
      const match = existingEmailMap.get(normEmail)!;
      const dateStr = match.submittedAt.toISOString().slice(0, 10);
      errors.push(
        `Duplicate candidate: Candidate "${match.name}" with email "${email}" was already submitted for this requirement by ${match.submittedByName} on ${dateStr}`,
      );
    } else if (normPhone && existingPhoneMap.has(normPhone)) {
      const match = existingPhoneMap.get(normPhone)!;
      const dateStr = match.submittedAt.toISOString().slice(0, 10);
      errors.push(
        `Duplicate candidate: Candidate "${match.name}" with phone "${phone}" was already submitted for this requirement by ${match.submittedByName} on ${dateStr}`,
      );
    }

    parsedRows.push({
      rowNumber,
      name,
      email,
      phone,
      qualification,
      specialization,
      college,
      graduationYear,
      totalExp: isNaN(totalExp) ? 0 : totalExp,
      relevantExp: isNaN(relevantExp) ? 0 : relevantExp,
      techSkills,
      softSkills,
      currentLocation,
      preferredLocation,
      currentCtc,
      expectedCtc,
      noticePeriod,
      resumeLink,
      source,
      hrRemarks,
      isValid: errors.length === 0,
      errors,
    });
  }

  const validRows = parsedRows.filter((r) => r.isValid).length;
  const invalidRows = parsedRows.length - validRows;

  return {
    valid: invalidRows === 0,
    totalRows: parsedRows.length,
    validRows,
    invalidRows,
    rows: parsedRows,
  };
}

export function generateCandidateTemplateCsv(): string {
  const header = REQUIRED_CSV_COLUMNS.join(',');
  const sampleRow1 = [
    'Rahul Kumar',
    'rahul.kumar@example.com',
    '+919876543210',
    'B.Tech',
    'Computer Science',
    'IIT Delhi',
    '2022',
    '2.5',
    '2.0',
    'Python; Django; PostgreSQL; REST APIs',
    'Communication; Teamwork; Problem Solving',
    'Bengaluru',
    'Bengaluru, Remote',
    '8.5 LPA',
    '12.0 LPA',
    '30 Days',
    'https://drive.google.com/file/d/sample-resume-1/view',
    'LinkedIn',
    'Strong background in backend development and good communication skills',
  ]
    .map((v) => (v.includes(',') || v.includes(';') ? `"${v}"` : v))
    .join(',');

  const sampleRow2 = [
    'Priya Sharma',
    'priya.sharma@example.com',
    '+919876543211',
    'MCA',
    'Information Technology',
    'NIT Trichy',
    '2021',
    '3.5',
    '3.0',
    'React; Next.js; TypeScript; Tailwind CSS',
    'Leadership; Adaptability',
    'Hyderabad',
    'Hyderabad, Pune',
    '10.0 LPA',
    '14.5 LPA',
    '15 Days',
    'https://drive.google.com/file/d/sample-resume-2/view',
    'Naukri',
    'Immediate joiner with excellent React and state management portfolio',
  ]
    .map((v) => (v.includes(',') || v.includes(';') ? `"${v}"` : v))
    .join(',');

  return `${header}\r\n${sampleRow1}\r\n${sampleRow2}\r\n`;
}
