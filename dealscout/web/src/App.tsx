import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Watches from "./pages/Watches";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="watches" element={<Watches />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
