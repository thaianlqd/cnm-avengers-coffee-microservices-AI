import React, { useEffect } from 'react';
import { usePlatformStore } from './store/usePlatformStore';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { EventDetailModal } from './components/EventDetailModal';
import { PipelineLogModal } from './components/PipelineLogModal';
import { TablePreviewModal } from './components/TablePreviewModal';

// 5 Primary Views matching the updated clean navigation
import { OverviewView } from './views/OverviewView';
import { AnalyticsView } from './views/AnalyticsView';
import { AiAssistantView } from './views/AiAssistantView';
import { DataExplorerView } from './views/DataExplorerView';
import { SystemAdminView } from './views/SystemAdminView';

export const App: React.FC = () => {
  const { 
    activeTab, 
    fetchOverview, 
    fetchTables, 
    fetchMarts, 
    fetchSystem 
  } = usePlatformStore();

  useEffect(() => {
    fetchOverview();
    fetchTables();
    fetchMarts();
    fetchSystem();
  }, [fetchOverview, fetchTables, fetchMarts, fetchSystem]);

  const renderActiveView = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'ai_assistant':
        return <AiAssistantView />;
      case 'explorer':
        return <DataExplorerView />;
      case 'system':
        return <SystemAdminView />;
      default:
        return <OverviewView />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Left Compact Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header />

        {/* Scrollable Main Viewport */}
        <main className="flex-1 overflow-y-auto p-5 bg-slate-50/80">
          <div className="max-w-7xl mx-auto">
            {renderActiveView()}
          </div>
        </main>
      </div>

      {/* Modals & Popups */}
      <EventDetailModal />
      <PipelineLogModal />
      <TablePreviewModal />

      {/* Toast Notification */}
      <Toast />
    </div>
  );
};

export default App;
