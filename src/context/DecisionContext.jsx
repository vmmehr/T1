import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../apiClient';

const DecisionContext = createContext();
const COMMENT_STEP_SCOPES = new Set(['definition', 'analysis', 'strategy']);

export const useDecision = () => {
  const context = useContext(DecisionContext);
  if (!context) {
    throw new Error('useDecision must be used within a DecisionProvider');
  }
  return context;
};

export const DecisionProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [decisions, setDecisions] = useState([]);
  const [currentDecisionId, setCurrentDecisionId] = useState(null);
  const [viewingUserId, setViewingUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewStep, setViewStep] = useState(null); // New state for current view step
  const [decisionViewMode, setDecisionViewMode] = useState('flow');
  const [decisionStats, setDecisionStats] = useState(null);
  const [decisionStatsLoading, setDecisionStatsLoading] = useState(false);

  // Local state for items of the current decision to avoid constant refetching
  // Structure: { [decisionId]: { pros: [], cons: [], tasks: [], comments: [], taskUnreadCounts: {}, itemUnreadCounts: {}, stepUnreadCounts: {} } }
  const [decisionItems, setDecisionItems] = useState({});
  const activeUserId = viewingUserId || currentUser?.id;
  const isStaffRole = ['consultant', 'psychologist', 'supervisor'].includes(currentUser?.role);
  const isReadOnlyView = Boolean(viewingUserId && isStaffRole);

  const fetchDecisions = useCallback(async (userId) => {
    if (!userId && !currentUser) return;
    const targetUserId = userId || currentUser.id;

    setLoading(true);
    try {
      const data = await api.decisions.list(targetUserId);
      setDecisions(data || []);
    } catch (error) {
      console.error('Error fetching decisions:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const fetchDecisionStats = useCallback(async (windowValue = 'all', userId) => {
    if (!currentUser) return null;
    const targetUserId = userId || activeUserId || currentUser.id;
    try {
      return await api.decisions.stats({ userId: targetUserId, window: windowValue });
    } catch (error) {
      console.error('Error fetching decision stats:', error);
      return null;
    }
  }, [activeUserId, currentUser]);

  const refreshDecisionStats = useCallback(async () => {
    if (!currentUser) {
      setDecisionStats(null);
      return null;
    }

    setDecisionStatsLoading(true);
    try {
      const data = await fetchDecisionStats('all');
      setDecisionStats(data);
      return data;
    } finally {
      setDecisionStatsLoading(false);
    }
  }, [currentUser, fetchDecisionStats]);

  const fetchDecisionArchive = useCallback(async ({
    from,
    to,
    status,
    limit = 20,
    offset = 0,
  } = {}) => {
    if (!currentUser) {
      return { items: [], total: 0, limit, offset };
    }

    const targetUserId = activeUserId || currentUser.id;
    try {
      return await api.decisions.archive({
        userId: targetUserId,
        from,
        to,
        status,
        limit,
        offset,
      });
    } catch (error) {
      console.error('Error fetching decision archive:', error);
      return { items: [], total: 0, limit, offset };
    }
  }, [activeUserId, currentUser]);

  const fetchItems = useCallback(async (decisionId) => {
    try {
      const {
        items = [],
        tasks = [],
        comments = [],
        task_unread_counts: taskUnreadCounts = {},
        item_unread_counts: itemUnreadCounts = {},
        step_unread_counts: stepUnreadCounts = {},
      } = await api.decisions.details(decisionId);
      const pros = items.filter(i => i.type === 'pro');
      const cons = items.filter(i => i.type === 'con');

      setDecisionItems(prev => ({
        ...prev,
        [decisionId]: { pros, cons, tasks, comments, taskUnreadCounts, itemUnreadCounts, stepUnreadCounts }
      }));
    } catch (error) {
      console.error('Error fetching items:', error);
      return;
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      // If viewingUserId is set (consultant viewing client), fetch that user's decisions
      // Otherwise fetch current user's decisions
      fetchDecisions(activeUserId);
    } else {
      setDecisions([]);
      setCurrentDecisionId(null);
      setDecisionItems({});
      setViewingUserId(null);
      setDecisionStats(null);
      setDecisionViewMode('flow');
      setViewStep(null);
    }
  }, [currentUser, activeUserId, fetchDecisions]);

  useEffect(() => {
    if (currentUser) {
      refreshDecisionStats();
    }
  }, [currentUser, activeUserId, refreshDecisionStats]);

  // Fetch items when current decision changes
  useEffect(() => {
    if (currentDecisionId) {
      fetchItems(currentDecisionId);
    }
  }, [currentDecisionId, fetchItems]);

  const currentDecision = useMemo(() => {
    const selectedDecision = decisions.find(d => d.id === currentDecisionId);
    if (!selectedDecision) return null;

    return {
      ...selectedDecision,
      pros: decisionItems[currentDecisionId]?.pros || [],
      cons: decisionItems[currentDecisionId]?.cons || []
    };
  }, [decisions, currentDecisionId, decisionItems]);

  const createDecision = async (title, description) => {
    if (!currentUser || isReadOnlyView) return;

    const newDecision = {
      user_id: currentUser.id,
      title,
      description,
      step: 1,
      status: 'pending',
      outcome_reason: ''
    };

    let data;
    try {
      data = await api.decisions.create(newDecision);
    } catch (error) {
      console.error('Error creating decision:', error);
      return;
    }

    setDecisions(prev => [data, ...prev]);
    setCurrentDecisionId(data.id);
    setViewStep(1); // Start at step 1
    setDecisionViewMode('flow');
    // Initialize empty items
    setDecisionItems(prev => ({
      ...prev,
      [data.id]: {
        pros: [],
        cons: [],
        tasks: [],
        comments: [],
        taskUnreadCounts: {},
        itemUnreadCounts: {},
        stepUnreadCounts: {},
      },
    }));
    refreshDecisionStats();
  };

  const selectDecision = (id) => {
    setCurrentDecisionId(id);
    setViewStep(null); // Reset to default (decision's current step) or calculate later
    setDecisionViewMode('flow');
  };

  const openDecisionFlow = (id) => {
    setCurrentDecisionId(id);
    setViewStep(null);
    setDecisionViewMode('flow');
  };

  const openDecisionOutcome = (id) => {
    setCurrentDecisionId(id);
    setViewStep(null);
    setDecisionViewMode('outcome');
  };

  const openArchive = () => {
    setCurrentDecisionId(null);
    setViewStep(null);
    setDecisionViewMode('archive');
  };

  const updateDecision = async (id, updates) => {
    if (isReadOnlyView) {
      return { ok: false, outcomeEvent: null };
    }
    // Optimistic update for decision fields
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));

    try {
      const updatedDecision = await api.decisions.update(id, updates);
      const { _outcome_event: outcomeEvent, ...decisionPayload } = updatedDecision || {};
      setDecisions(prev => prev.map(d => d.id === id ? { ...d, ...decisionPayload } : d));
      refreshDecisionStats();
      return {
        ok: true,
        outcomeEvent: outcomeEvent || null
      };
    } catch (error) {
      console.error('Error updating decision:', error);
      fetchDecisions(activeUserId);
      return {
        ok: false,
        outcomeEvent: null
      };
    }
  };

  const deleteDecision = async (id) => {
    if (isReadOnlyView) return;

    setDecisions(prev => prev.filter(d => d.id !== id));
    if (currentDecisionId === id) {
      setCurrentDecisionId(null);
    }

    try {
      await api.decisions.delete(id);
      refreshDecisionStats();
    } catch (error) {
      console.error('Error deleting decision:', error);
      fetchDecisions(activeUserId);
    }
  };

  const addItem = async (type, text, weight = 0) => {
    if (!currentDecisionId || isReadOnlyView) return;

    const newItem = {
      decision_id: currentDecisionId,
      type,
      text,
      weight,
      strategy: ''
    };

    // Optimistic update
    const tempId = Date.now();
    setDecisionItems(prev => {
      const current = prev[currentDecisionId] || {
        pros: [],
        cons: [],
        tasks: [],
        comments: [],
        taskUnreadCounts: {},
        itemUnreadCounts: {},
        stepUnreadCounts: {},
      };
      return {
        ...prev,
        [currentDecisionId]: {
          ...current,
          [type === 'pro' ? 'pros' : 'cons']: [...current[type === 'pro' ? 'pros' : 'cons'], { ...newItem, id: tempId }]
        }
      };
    });

    try {
      const data = await api.decisionItems.create(newItem);
      // Replace temp item with real one
      setDecisionItems(prev => {
        const current = prev[currentDecisionId];
        const listKey = type === 'pro' ? 'pros' : 'cons';
        return {
          ...prev,
          [currentDecisionId]: {
            ...current,
            [listKey]: current[listKey].map(i => i.id === tempId ? data : i)
          }
        };
      });
    } catch (error) {
      console.error('Error adding item:', error);
      // Revert logic would go here
      fetchItems(currentDecisionId);
    }
  };

  const addPro = (text, weight) => addItem('pro', text, weight);
  const addCon = (text, weight) => addItem('con', text, weight);

  const updateItem = async (type, itemId, updates) => {
    if (!currentDecisionId || isReadOnlyView) return;

    // Optimistic
    setDecisionItems(prev => {
      const current = prev[currentDecisionId];
      const listKey = type === 'pro' ? 'pros' : 'cons';
      return {
        ...prev,
        [currentDecisionId]: {
          ...current,
          [listKey]: current[listKey].map(i => i.id === itemId ? { ...i, ...updates } : i)
        }
      };
    });

    try {
      await api.decisionItems.update(itemId, updates);
    } catch (error) {
      console.error('Error updating item:', error);
      fetchItems(currentDecisionId);
    }
  };

  const updateItemWeight = (type, itemId, weight) => updateItem(type === 'pros' ? 'pro' : 'con', itemId, { weight });
  const updateStrategy = (type, itemId, strategy) => updateItem(type === 'pros' ? 'pro' : 'con', itemId, { strategy });

  const removeItem = async (type, itemId) => {
    if (!currentDecisionId || isReadOnlyView) return;

    // Optimistic
    setDecisionItems(prev => {
      const current = prev[currentDecisionId];
      const listKey = type; // 'pros' or 'cons'
      return {
        ...prev,
        [currentDecisionId]: {
          ...current,
          [listKey]: current[listKey].filter(i => i.id !== itemId)
        }
      };
    });

    try {
      await api.decisionItems.delete(itemId);
    } catch (error) {
      console.error('Error deleting item:', error);
      fetchItems(currentDecisionId);
    }
  };

  const setStep = (step) => {
    if (!currentDecisionId) return;
    if (isReadOnlyView) {
      setViewStep(step);
      return;
    }
    setViewStep(step); // Sync view immediately
    updateDecision(currentDecisionId, { step });
  };

  const setOutcome = (status, reason) => {
    if (!currentDecisionId) {
      return Promise.resolve({ ok: false, outcomeEvent: null });
    }
    return updateDecision(currentDecisionId, { status, outcome_reason: reason });
  };

  const getStepUnreadCount = useCallback((decisionId, stepScope) => {
    if (!decisionId || !COMMENT_STEP_SCOPES.has(stepScope)) return 0;
    const stepUnreadCounts = decisionItems[decisionId]?.stepUnreadCounts || {};
    return Number(stepUnreadCounts?.[stepScope] || 0);
  }, [decisionItems]);

  const getTaskUnreadTotal = useCallback((decisionId) => {
    if (!decisionId) return 0;
    const taskUnreadCounts = decisionItems[decisionId]?.taskUnreadCounts || {};
    return Object.values(taskUnreadCounts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  }, [decisionItems]);

  const getItemUnreadCount = useCallback((decisionId, itemId) => {
    if (!decisionId || !itemId) return 0;
    const itemUnreadCounts = decisionItems[decisionId]?.itemUnreadCounts || {};
    return Number(itemUnreadCounts?.[itemId] || 0);
  }, [decisionItems]);

  const markStepCommentsRead = useCallback(async (stepScope) => {
    if (!currentDecisionId || !COMMENT_STEP_SCOPES.has(stepScope)) return;

    setDecisionItems((prev) => {
      const current = prev[currentDecisionId] || {};
      const stepUnreadCounts = { ...(current.stepUnreadCounts || {}) };
      stepUnreadCounts[stepScope] = 0;
      return {
        ...prev,
        [currentDecisionId]: {
          ...current,
          stepUnreadCounts,
        },
      };
    });

    try {
      await api.decisions.markStepRead(currentDecisionId, stepScope);
    } catch (error) {
      console.error('Error marking step comments as read:', error);
      fetchItems(currentDecisionId);
    }
  }, [currentDecisionId, fetchItems]);

  const goHome = () => {
    setCurrentDecisionId(null);
    setViewStep(null);
    setDecisionViewMode('flow');
    // Do NOT reset viewingUserId here, so consultant stays on client's list
    fetchDecisions(activeUserId);
  };

  const updateDecisionInfo = (title, description) => {
    if (!currentDecisionId || isReadOnlyView) return;
    updateDecision(currentDecisionId, { title, description });
  };

  const value = {
    decisions,
    currentDecision,
    createDecision,
    selectDecision,
    openDecisionFlow,
    openDecisionOutcome,
    openArchive,
    deleteDecision,
    addPro,
    addCon,
    updateItemWeight,
    removeItem,
    updateStrategy,
    setStep,
    setOutcome,
    goHome,
    updateDecisionInfo,
    viewingUserId,
    setViewingUserId,
    loading,
    decisionStats,
    decisionStatsLoading,
    viewStep,
    setViewStep,
    decisionViewMode,
    isReadOnlyView,
    // Expose decisionItems and setDecisionItems for TaskContext and CommentContext
    decisionItems,
    setDecisionItems,
    currentDecisionId,
    getStepUnreadCount,
    getTaskUnreadTotal,
    getItemUnreadCount,
    markStepCommentsRead,
    fetchItems,
    refreshDecisionStats,
    fetchDecisionStats,
    fetchDecisionArchive
  };

  return (
    <DecisionContext.Provider value={value}>
      {children}
    </DecisionContext.Provider>
  );
};
