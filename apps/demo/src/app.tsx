import { ErrorBoundary } from "./error-boundary";
import { LoginPage } from "./pages/login";

export const App = () => {
  return (
    <ErrorBoundary>
      <LoginPage />
    </ErrorBoundary>
  );
};
