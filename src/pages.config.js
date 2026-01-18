import Calculator from './pages/Calculator';
import CinemaAgent from './pages/CinemaAgent';
import Home from './pages/Home';
import PrintableReport from './pages/PrintableReport';
import Projects from './pages/Projects';
import RoomDesigner from './pages/RoomDesigner';
import SPLCalculator from './pages/SPLCalculator';
import SPLCalculatorV2 from './pages/SPLCalculatorV2';
import SpeakerDatabase from './pages/SpeakerDatabase';
import RP22Report from './pages/RP22Report';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Calculator": Calculator,
    "CinemaAgent": CinemaAgent,
    "Home": Home,
    "PrintableReport": PrintableReport,
    "Projects": Projects,
    "RoomDesigner": RoomDesigner,
    "SPLCalculator": SPLCalculator,
    "SPLCalculatorV2": SPLCalculatorV2,
    "SpeakerDatabase": SpeakerDatabase,
    "RP22Report": RP22Report,
}

export const pagesConfig = {
    mainPage: "RoomDesigner",
    Pages: PAGES,
    Layout: __Layout,
};