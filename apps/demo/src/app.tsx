import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/layout";
import { FeedPage } from "./pages/feed";
import { PostDetailPage } from "./pages/post-detail";
import { ProfilePage } from "./pages/profile";
import { LoginPage } from "./pages/login";

export const App = () => {
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick((previous) => previous + 1);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout onUpdate={forceUpdate} />}>
          <Route path="/" element={<FeedPage onUpdate={forceUpdate} />} />
          <Route path="/post/:postId" element={<PostDetailPage onUpdate={forceUpdate} />} />
          <Route path="/profile/:handle" element={<ProfilePage onUpdate={forceUpdate} />} />
          <Route path="/login" element={<LoginPage onUpdate={forceUpdate} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
