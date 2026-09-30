import React, { useEffect } from 'react';
import { usePlatformStore } from './store/usePlatformStore';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { EventDetailModal } from './components/EventDetailModal';
import { PipelineLogModal } from './components/PipelineLogModal';
import { TablePreviewModal } from './components/TablePreviewModal';

// Views
import { OverviewView } from './views/OverviewView';
import { AnalyticsView } from './views/AnalyticsView';
import { AiAssistantView } from './views/AiAssistantView';
import { DataExplorerView } from './views/DataExplorerView';
import { DataCatalogView } from './views/DataCatalogView';
import { PipelinesView } from './views/PipelinesView';
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
      case 'explorer':
      case 'sql_editor':
      case 'query_history':
      case 'notebooks':
        return <DataExplorerView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'data_management':
        return <PipelinesView />;
      case 'warehouse':
        return <DataCatalogView />;
      case 'ai_assistant':
      case 'ml_ai':
        return <AiAssistantView />;
      case 'system':
      case 'users':
      case 'roles':
        return <SystemAdminView />;
      default:
        return <OverviewView />;
    }
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden font-sans select-none">
      {/* Left Sidebar matching mockup */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f8fafc]">
        {/* Top Header */}
        <Header />

        {/* Scrollable Main Viewport with comfortable padding */}
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 bg-[#f8fafc]">
          <div className="max-w-[1500px] mx-auto">
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
