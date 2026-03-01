/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Calculator from './pages/Calculator';
import CinemaAgent from './pages/CinemaAgent';
import ComplianceReportPrint from './pages/ComplianceReportPrint';
import Home from './pages/Home';
import PrintableReport from './pages/PrintableReport';
import Projects from './pages/Projects';
import RP22Report from './pages/RP22Report';
import SPLCalculator from './pages/SPLCalculator';
import SPLCalculatorV2 from './pages/SPLCalculatorV2';
import SpeakerDatabase from './pages/SpeakerDatabase';
import RoomDesigner from './pages/RoomDesigner';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Calculator": Calculator,
    "CinemaAgent": CinemaAgent,
    "ComplianceReportPrint": ComplianceReportPrint,
    "Home": Home,
    "PrintableReport": PrintableReport,
    "Projects": Projects,
    "RP22Report": RP22Report,
    "SPLCalculator": SPLCalculator,
    "SPLCalculatorV2": SPLCalculatorV2,
    "SpeakerDatabase": SpeakerDatabase,
    "RoomDesigner": RoomDesigner,
}

export const pagesConfig = {
    mainPage: "Projects",
    Pages: PAGES,
    Layout: __Layout,
};