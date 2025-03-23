import React, { useState, useEffect } from 'react';

import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import "./App.css";
import Filters from "./Filters";
import Plots from "./Plots";
import MapPanel from "./MapPanel";
import Data from "./Data"; // Data page component

function App() {
  const [data, setData] = useState('');

  useEffect(() => {
    (async function () {
      const { text } = await( await fetch(`/api/message`)).json();
      setData(text);
    })();
  });

  return <div>{data}</div>;
}

// function App() {
//   const [filters, setFilters] = useState({
//     selectedSites: [], // Selected lakes from the filters
//     selectedParameters: [],
//     startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 2)),
//     endDate: new Date(),
//   });

//   return (
//     <Router>
//       <div className="dashboard">
//         <header className="header">
//           <div className="header-container">
//             <div className="header-left">
//               <div className="title">NW Michigan Watershed Coalition</div>
//               <div className="vertical-separator"></div>
//               <nav className="menu">
//                 <Link to="/">Main</Link>
//                 <Link to="/data">Data</Link>
//               </nav>
//             </div>
//           </div>
//         </header>
//         <Routes>
//           <Route
//             path="/"
//             element={
//               <div className="container">
//                 <Filters 
//                   onFilterChange={setFilters} 
//                   selectedSites={filters.selectedSites} 
//                 />
//                 <main className="plots">
//                   <Plots 
//                     selectedParameters={filters.selectedParameters} 
//                     selectedSites={filters.selectedSites} 
//                     startDate={filters.startDate} 
//                     endDate={filters.endDate} 
//                   />
//                 </main>
//                 <section className="map">
//                   <MapPanel selectedSites={filters.selectedSites} />
//                 </section>
//               </div>
//             }
//           />
//           <Route path="/data" element={<Data />} />
//         </Routes>
//       </div>
//     </Router>
//   );
// }

export default App;
