import React from 'react';
import { DecisionProvider, useDecision } from './context/DecisionContext';
import { TaskProvider } from './context/TaskContext';
import { CommentProvider } from './context/CommentContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Home from './views/Home';
import DecisionInput from './views/DecisionInput';
import Analysis from './views/Analysis';
import Strategy from './views/Strategy';
import ActionPlan from './views/ActionPlan';
import DecisionOutcome from './views/DecisionOutcome';
import Archive from './views/Archive';
import Login from './views/Login';
import Signup from './views/Signup';
import Dashboard from './views/Dashboard';

import DecisionTabs from './components/DecisionTabs';

const CurrentView = () => {
  const {
    currentDecision,
    goHome,
    viewingUserId,
    viewStep,
    setViewStep,
    decisionViewMode,
    getStepUnreadCount,
    getTaskUnreadTotal,
  } = useDecision();
  const { currentUser } = useAuth();

  // Helper to check if user can view client data
  const isStaffViewingClient = ['consultant', 'psychologist', 'supervisor'].includes(currentUser?.role) && viewingUserId;

  // If user is a client OR a staff member viewing a client, and has a selected decision, show the decision flow
  const isClientView = currentUser?.role === 'client' || isStaffViewingClient;

  if (isClientView && currentDecision) {
    const decisionId = currentDecision.id;
    if (decisionViewMode === 'outcome') {
      return <DecisionOutcome />;
    }

    return (
      <div>
        <div style={{ marginBottom: '1rem' }}>
          <button onClick={goHome} className="btn back-to-list-btn">
            ← بازگشت به لیست تصمیم‌ها
          </button>
        </div>

        <DecisionTabs
          activeStep={viewStep ?? currentDecision.step}
          currentStep={currentDecision.step}
          onTabChange={(step) => setViewStep(step)}
          unreadCounts={{
            definition: getStepUnreadCount(decisionId, 'definition'),
            analysis: getStepUnreadCount(decisionId, 'analysis'),
            strategy: getStepUnreadCount(decisionId, 'strategy') + getTaskUnreadTotal(decisionId),
            action_plan: 0,
          }}
        />

        {(() => {
          const stepToShow = viewStep ?? currentDecision.step;
          switch (stepToShow) {
            case 0: return <DecisionInput />;
            case 1: return <Analysis />;
            case 2: return <Strategy />;
            case 3: return <ActionPlan />;
            default: return <Analysis />;
          }
        })()}
      </div>
    );
  }

  if (isClientView && decisionViewMode === 'archive') {
    return <Archive />;
  }

  // If staff is viewing a client's list (but no specific decision selected)
  if (isStaffViewingClient) {
    return <Home />;
  }

  // Otherwise show the dashboard (which handles Home for clients)
  return <Dashboard />;
};

const AppContent = () => {
  const { currentUser, logout } = useAuth();
  const path = window.location.pathname;

  if (!currentUser) {
    if (path.startsWith('/invite/')) {
      const inviteToken = decodeURIComponent(path.slice('/invite/'.length));
      return <Signup inviteToken={inviteToken} />;
    }
    if (path === '/signup') {
      return <Signup />;
    }
    return <Login />;
  }

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button
          onClick={() => {
            if (window.confirm('آیا از خروج از حساب اطمینان دارید؟')) {
              logout();
            }
          }}
          className="btn"
          style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
        >
          خروج
        </button>
      </div>
      <CurrentView />
    </Layout>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <DecisionProvider>
        <TaskProvider>
          <CommentProvider>
            <AppContent />
          </CommentProvider>
        </TaskProvider>
      </DecisionProvider>
    </AuthProvider>
  );
};

export default App;
