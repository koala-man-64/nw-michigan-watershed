import Papa from "papaparse";

export function apiCsvUrl(blobName) {
  const blob = encodeURIComponent(blobName);
  return `/api/read-csv?blob=${blob}&format=csv`;
}

export async function fetchCsvText(blobName) {
  const response = await fetch(apiCsvUrl(blobName));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${blobName}`);
  }
  return response.text();
}

export function parseCsvRows(csvText, { skipEmptyLines = true } = {}) {
  let rows = [];
  Papa.parse(csvText, {
    header: true,
    skipEmptyLines,
    complete: ({ data }) => {
      rows = data;
    },
  });
  return rows;
}
