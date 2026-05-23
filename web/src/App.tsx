import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Analyze from './pages/Analyze';
import Report from './pages/Report';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/analyze/:reportId" element={<Analyze />} />
        <Route path="/report/:reportId" element={<Report />} />
      </Routes>
    </BrowserRouter>
  );
}
