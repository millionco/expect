import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./error-boundary";
import { Layout } from "./components/layout";
import { DashboardPage } from "./pages/dashboard";

export const App = () => {
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick((previous) => previous + 1);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage onUpdate={forceUpdate} />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
};
