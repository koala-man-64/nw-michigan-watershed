import useCsvData from "./useCsvData";
import { loadSiteLocations } from "../siteLocations";

export default function useSiteLocations() {
  return useCsvData(loadSiteLocations, []);
}
