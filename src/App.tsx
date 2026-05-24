import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Viewer from "./pages/Viewer";
import Merge from "./pages/Merge";
import Rearrange from "./pages/Rearrange";
import ImagesToPDF from "./pages/ImagesToPDF";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/viewer" element={<Viewer />} />
        <Route path="/merge" element={<Merge />} />
        <Route path="/rearrange" element={<Rearrange />} />
        <Route path="/images-to-pdf" element={<ImagesToPDF />} />
      </Routes>
    </BrowserRouter>
  );
}
