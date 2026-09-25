import { normalizeUrl } from './dataPostProcessor';

export type CombineMode = 'union' | 'intersection' | 'key_join';
export type DedupStrategy = 'keep_first' | 'keep_last' | 'merge_coalesce' | 'highest_completeness';

export interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string;
  sourceIndex?: number; // Optional: only apply mapping to a specific source dataset index
}

export interface CombineDatasetsOptions {
  mode?: CombineMode; // default: 'union'
  missingValue?: any; // default: ''
  addSourceColumn?: boolean; // default: true
  sourceColumnName?: string; // default: '_source'
  sourceLabels?: string[]; // Custom labels for each source dataset
  columnMappings?: ColumnMapping[]; // Column aliasing across sources
  deduplicate?: boolean; // default: false
  dedupKeys?: string[]; // Column names to check for duplicates (empty = full row match)
  dedupStrategy?: DedupStrategy; // default: 'keep_first'
  caseSensitive?: boolean; // default: false
  normalizeUrls?: boolean; // default: true
  primaryKey?: string; // For key_join mode
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface CombineDatasetsResult {
  items: Record<string, any>[];
  rowCount: number;
  columnCount: number;
  columns: string[];
  sourceStats: {
    sourceIndex: number;
    sourceLabel: string;
    originalCount: number;
    contributedCount: number;
  }[];
  duplicatesRemoved: number;
}

/**
 * Normalizes a value for duplicate comparison
 */
function normalizeForComparison(val: any, shouldNormalizeUrls = true, caseSensitive = false): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (shouldNormalizeUrls && (/^https?:\/\//i.test(str) || str.startsWith('/'))) {
    try {
      str = normalizeUrl(str, { stripAllQueryParams: true });
    } catch {}
  }
  return caseSensitive ? str : str.toLowerCase();
}

/**
 * Calculates a completeness score for a record (number of non-empty, defined fields)
 */
function calculateCompleteness(row: Record<string, any>): number {
  let score = 0;
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_')) continue;
    if (v !== null && v !== undefined && v !== '' && (!Array.isArray(v) || v.length > 0)) {
      score++;
    }
  }
  return score;
}

/**
 * Combines multiple datasets with schema alignment, column aliasing, and deduplication
 */
export function combineDatasets(
  sources: Record<string, any>[][],
  options: CombineDatasetsOptions = {}
): CombineDatasetsResult {
  const {
    mode = 'union',
    missingValue = '',
    addSourceColumn = true,
    sourceColumnName = '_source',
    sourceLabels = [],
    columnMappings = [],
    deduplicate = false,
    dedupKeys = [],
    dedupStrategy = 'keep_first',
    caseSensitive = false,
    normalizeUrls = true,
    primaryKey = 'id',
    sortBy,
    sortOrder = 'asc',
    limit,
  } = options;

  const validSources = sources.map((s, idx) => {
    if (!Array.isArray(s)) return [];
    return s.map((item) => {
      if (typeof item !== 'object' || item === null) return { value: item };
      return { ...item };
    });
  });

  const sourceStats = validSources.map((s, idx) => ({
    sourceIndex: idx,
    sourceLabel: sourceLabels[idx] || `Source ${idx + 1}`,
    originalCount: s.length,
    contributedCount: 0,
  }));

  // Step 1: Apply Column Mappings to each source
  const mappedSources = validSources.map((source, srcIdx) => {
    return source.map((row) => {
      const mappedRow: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        // Find if this column has a mapping
        const mapping = columnMappings.find(
          (m) =>
            m.sourceColumn === key &&
            (m.sourceIndex === undefined || m.sourceIndex === srcIdx)
        );
        const targetKey = mapping ? mapping.targetColumn : key;
        mappedRow[targetKey] = val;
      }
      return mappedRow;
    });
  });

  // Step 2: Determine Global Columns
  const allColumnsSet = new Set<string>();
  const sourceColumnSets = mappedSources.map((src) => {
    const colSet = new Set<string>();
    src.forEach((row) => Object.keys(row).forEach((k) => colSet.add(k)));
    return colSet;
  });

  if (mode === 'intersection') {
    // Keep only columns present in every non-empty source
    const activeSets = sourceColumnSets.filter((s) => s.size > 0);
    if (activeSets.length > 0) {
      const firstSet = activeSets[0];
      for (const col of firstSet) {
        if (activeSets.every((s) => s.has(col))) {
          allColumnsSet.add(col);
        }
      }
    }
  } else {
    // Union / key_join: keep all columns
    sourceColumnSets.forEach((set) => set.forEach((col) => allColumnsSet.add(col)));
  }

  const columns = Array.from(allColumnsSet);

  // Step 3: Combine or Join Rows
  let combinedRows: Record<string, any>[] = [];

  if (mode === 'key_join') {
    // Key Join: Merge records matching on primaryKey
    const joinMap = new Map<string, { row: Record<string, any>; sourcesSeen: Set<string> }>();

    mappedSources.forEach((source, srcIdx) => {
      const label = sourceStats[srcIdx].sourceLabel;
      source.forEach((item) => {
        const keyVal = normalizeForComparison(item[primaryKey], normalizeUrls, caseSensitive);
        const effectiveKey = keyVal || `__unkeyed_${Math.random()}`;

        if (!joinMap.has(effectiveKey)) {
          const newRow: Record<string, any> = {};
          columns.forEach((col) => {
            newRow[col] = item[col] !== undefined ? item[col] : missingValue;
          });
          joinMap.set(effectiveKey, {
            row: newRow,
            sourcesSeen: new Set([label]),
          });
        } else {
          // Merge complementary fields into existing joined record
          const existing = joinMap.get(effectiveKey)!;
          existing.sourcesSeen.add(label);
          columns.forEach((col) => {
            const currentVal = existing.row[col];
            const incomingVal = item[col];
            // If current is empty and incoming has data, coalesce!
            if (
              (currentVal === missingValue || currentVal === '' || currentVal === null || currentVal === undefined) &&
              incomingVal !== undefined &&
              incomingVal !== '' &&
              incomingVal !== null
            ) {
              existing.row[col] = incomingVal;
            }
          });
        }
      });
    });

    combinedRows = Array.from(joinMap.values()).map(({ row, sourcesSeen }) => {
      if (addSourceColumn) {
        row[sourceColumnName] = Array.from(sourcesSeen).join(', ');
      }
      return row;
    });
  } else {
    // Standard Union / Intersection
    mappedSources.forEach((source, srcIdx) => {
      const label = sourceStats[srcIdx].sourceLabel;
      source.forEach((item) => {
        const alignedRow: Record<string, any> = {};
        columns.forEach((col) => {
          alignedRow[col] = item[col] !== undefined ? item[col] : missingValue;
        });
        if (addSourceColumn) {
          alignedRow[sourceColumnName] = label;
        }
        combinedRows.push(alignedRow);
      });
    });
  }

  // Step 4: Intelligent Deduplication
  let duplicatesRemoved = 0;
  if (deduplicate && combinedRows.length > 0) {
    const initialCount = combinedRows.length;
    const seenMap = new Map<string, Record<string, any>>();
    const targetKeys =
      dedupKeys && dedupKeys.length > 0
        ? dedupKeys.filter((k) => k !== sourceColumnName)
        : primaryKey && columns.includes(primaryKey)
        ? [primaryKey]
        : columns.filter((k) => k !== sourceColumnName);

    for (const row of combinedRows) {
      // Build composite fingerprint
      const fingerprint = targetKeys
        .map((k) => `${k}:${normalizeForComparison(row[k], normalizeUrls, caseSensitive)}`)
        .join('|');

      if (!seenMap.has(fingerprint)) {
        seenMap.set(fingerprint, row);
      } else {
        const existing = seenMap.get(fingerprint)!;
        if (dedupStrategy === 'keep_last') {
          seenMap.set(fingerprint, row);
        } else if (dedupStrategy === 'merge_coalesce') {
          // Coalesce non-empty fields from later duplicate into existing
          columns.forEach((col) => {
            const cur = existing[col];
            const inc = row[col];
            if (
              (cur === missingValue || cur === '' || cur === null || cur === undefined) &&
              inc !== undefined &&
              inc !== '' &&
              inc !== null
            ) {
              existing[col] = inc;
            }
          });
          // Also coalesce source names if present
          if (addSourceColumn && row[sourceColumnName] && !existing[sourceColumnName].includes(row[sourceColumnName])) {
            existing[sourceColumnName] = `${existing[sourceColumnName]}, ${row[sourceColumnName]}`;
          }
        } else if (dedupStrategy === 'highest_completeness') {
          if (calculateCompleteness(row) > calculateCompleteness(existing)) {
            seenMap.set(fingerprint, row);
          }
        }
      }
    }

    combinedRows = Array.from(seenMap.values());
    duplicatesRemoved = initialCount - combinedRows.length;
  }

  // Step 5: Sorting
  if (sortBy && columns.includes(sortBy)) {
    combinedRows.sort((a, b) => {
      const valA = a[sortBy];
      const valB = b[sortBy];
      const numA = Number(valA);
      const numB = Number(valB);

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortOrder === 'desc' ? numB - numA : numA - numB;
      }
      const strA = String(valA || '');
      const strB = String(valB || '');
      return sortOrder === 'desc' ? strB.localeCompare(strA) : strA.localeCompare(strB);
    });
  }

  // Step 6: Limiting
  if (typeof limit === 'number' && limit > 0) {
    combinedRows = combinedRows.slice(0, limit);
  }

  // Compute final source contribution stats
  if (addSourceColumn) {
    sourceStats.forEach((stat) => {
      stat.contributedCount = combinedRows.filter((r) =>
        String(r[sourceColumnName] || '').includes(stat.sourceLabel)
      ).length;
    });
  } else {
    sourceStats.forEach((stat) => {
      stat.contributedCount = Math.round(combinedRows.length / Math.max(1, sourceStats.length));
    });
  }

  const finalColumns = addSourceColumn ? [...columns, sourceColumnName] : columns;

  return {
    items: combinedRows,
    rowCount: combinedRows.length,
    columnCount: finalColumns.length,
    columns: finalColumns,
    sourceStats,
    duplicatesRemoved,
  };
}
