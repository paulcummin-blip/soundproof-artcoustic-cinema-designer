import Projects from './pages/Projects';
import Calculator from './pages/Calculator';
import RoomDesigner from './pages/RoomDesigner';
import PrintableReport from './pages/PrintableReport';
import RP22Report from './pages/RP22Report';
import SpeakerDatabase from './pages/SpeakerDatabase';
import SPLCalculator from './pages/SPLCalculator';
import SPLCalculatorV2 from './pages/SPLCalculatorV2';
import CinemaAgent from './pages/CinemaAgent';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Projects": Projects,
    "Calculator": Calculator,
    "RoomDesigner": RoomDesigner,
    "PrintableReport": PrintableReport,
    "RP22Report": RP22Report,
    "SpeakerDatabase": SpeakerDatabase,
    "SPLCalculator": SPLCalculator,
    "SPLCalculatorV2": SPLCalculatorV2,
    "CinemaAgent": CinemaAgent,
}

export const pagesConfig = {
    mainPage: "RoomDesigner",
    Pages: PAGES,
    Layout: __Layout,
};