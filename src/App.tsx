import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { AppShell } from "@/components/AppShell";
import Dashboard from "./pages/Dashboard";
import Scope from "./pages/Scope";
import Checklist from "./pages/Checklist";
import Notebook from "./pages/Notebook";
import Assets from "./pages/Assets";
import Findings from "./pages/Findings";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";
import Encyclopedia from "./pages/Encyclopedia";
import AttackChain from "./pages/AttackChain";
import History from "./pages/History";
import Recon from "./pages/Recon";
import AssetExplorer from "./pages/AssetExplorer";
import ReconCenter from "./pages/ReconCenter";
import Automation from "./pages/Automation";
import EvidenceVault from "./pages/EvidenceVault";
import HttpLibrary from "./pages/HttpLibrary";
import MediaLibrary from "./pages/MediaLibrary";
import PocBuilder from "./pages/PocBuilder";
import ReportComposer from "./pages/ReportComposer";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import AttackPaths from "./pages/AttackPaths";
import Correlation from "./pages/Correlation";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner theme="dark" />
      <WorkspaceProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/scope" element={<Scope />} />
              <Route path="/checklist" element={<Checklist />} />
              <Route path="/notebook" element={<Notebook />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/recon" element={<Recon />} />
              <Route path="/recon-center" element={<ReconCenter />} />
              <Route path="/automation" element={<Automation />} />
              <Route path="/asset-intel" element={<AssetExplorer />} />
              <Route path="/findings" element={<Findings />} />
              <Route path="/evidence" element={<EvidenceVault />} />
              <Route path="/http" element={<HttpLibrary />} />
              <Route path="/media" element={<MediaLibrary />} />
              <Route path="/poc" element={<PocBuilder />} />
              <Route path="/reports" element={<ReportComposer />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/encyclopedia" element={<Encyclopedia />} />
              <Route path="/attack-chain" element={<AttackChain />} />
              <Route path="/graph" element={<KnowledgeGraph />} />
              <Route path="/attack-paths" element={<AttackPaths />} />
              <Route path="/correlation" element={<Correlation />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </WorkspaceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
