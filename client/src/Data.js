import React, { useEffect, useState } from "react";
import Papa from "papaparse";

function Data() {
  // List of available CSV files in the Azure Blob container.
  const csvFiles = ["locations.csv", "water_quality_data.csv"];
  const [selectedFile, setSelectedFile] = useState(csvFiles[0]);
  const [csvData, setCsvData] = useState([]);
  const [initialCsvData, setInitialCsvData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Function to load CSV file from the Azure Blob container.
  const loadCSV = (fileName) => {
    setLoading(true);
    const blob = encodeURIComponent(String(fileName));
    const fileUrl = `/api/read-csv?blob=${blob}&format=csv`;
    
    fetch(fileUrl)
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          complete: (result) => {
            // Remove rows that are completely empty.
            const filteredData = result.data.filter(row =>
              Object.values(row).some(
                (val) => val && val.toString().trim() !== ""
              )
            );
            setCsvData(filteredData);
            setInitialCsvData(filteredData); // Store original data for cancel/undo
            setLoading(false);
          },
        });
      })
      .catch((error) => {
        console.error("Error loading CSV:", error);
        setLoading(false);
      });
  };

  // Load CSV whenever the selected file changes.
  useEffect(() => {
    loadCSV(selectedFile);
  }, [selectedFile]);

  // Handle changes in CSV data cells.
  const handleChange = (rowIndex, field, newValue) => {
    const updatedData = [...csvData];
    updatedData[rowIndex][field] = newValue;
    setCsvData(updatedData);
  };

  // Add new row: use headers from the first row if available.
  const addNewRow = () => {
    let newRow = {};
    if (csvData.length > 0) {
      const headers = Object.keys(csvData[0]);
      headers.forEach((header) => {
        newRow[header] = "";
      });
    }
    setCsvData([...csvData, newRow]);
  };

  // Delete row: remove a row from csvData by index.
  const deleteRow = (rowIndex) => {
    const updatedData = csvData.filter((_, index) => index !== rowIndex);
    setCsvData(updatedData);
  };

  // Cancel changes: reset csvData to the initially loaded data.
  const cancelChanges = () => {
    setCsvData(initialCsvData);
  };

  // Function to update or create a CSV file in the Azure Blob container.
  const commitSave = async () => {
    alert(
      "Saving is disabled until a server-side, authenticated write endpoint is implemented. " +
        "This avoids shipping Azure SAS tokens to browsers."
    );
  };

  if (loading) return <div>Loading CSV data...</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h2>Data Editor</h2>
      {/* CSV File Selection */}
      <div style={{ marginBottom: "15px" }}>
        <label htmlFor="csv-select">Select CSV File: </label>
        <select
          id="csv-select"
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
        >
          {csvFiles.map((file, idx) => (
            <option key={idx} value={file}>
              {file}
            </option>
          ))}
        </select>
      </div>
      {/* Add New Row Button */}
      <div style={{ marginBottom: "15px" }}>
        <button onClick={addNewRow}>Add New Row</button>
      </div>
      {/* Editable CSV Data Table */}
      <table border="1" cellPadding="5" cellSpacing="0">
        <thead>
          <tr>
            {csvData.length > 0 &&
              Object.keys(csvData[0]).map((header, index) => (
                <th key={index}>{header}</th>
              ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {csvData.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {Object.entries(row).map(([field, value], colIndex) => (
                <td key={colIndex}>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      handleChange(rowIndex, field, e.target.value)
                    }
                  />
                </td>
              ))}
              <td>
                <button onClick={() => deleteRow(rowIndex)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <br />
      {/* Commit and Cancel Buttons */}
      <button onClick={commitSave}>Commit Save</button>
      <button onClick={cancelChanges} style={{ marginLeft: "10px" }}>Cancel Changes</button>
    </div>
  );
}

export default Data;
