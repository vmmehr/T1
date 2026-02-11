import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../apiClient';

const DecisionContext = createContext();

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

  // Local state for items of the current decision to avoid constant refetching
  // Structure: { [decisionId]: { pros: [], cons: [], tasks: [], comments: [] } }
  const [decisionItems, setDecisionItems] = useState({});
  const activeUserId = viewingUserId || currentUser?.id;

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

  const fetchItems = useCallback(async (decisionId) => {
    try {
      const { items = [], tasks = [], comments = [] } = await api.decisions.details(decisionId);
      const pros = items.filter(i => i.type === 'pro');
      const cons = items.filter(i => i.type === 'con');

      setDecisionItems(prev => ({
        ...prev,
        [decisionId]: { pros, cons, tasks, comments }
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
    }
  }, [currentUser, activeUserId, fetchDecisions]);

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
    if (!currentUser) return;

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
    // Initialize empty items
    setDecisionItems(prev => ({ ...prev, [data.id]: { pros: [], cons: [], tasks: [], comments: [] } }));
  };

  const selectDecision = (id) => {
    setCurrentDecisionId(id);
    setViewStep(null); // Reset to default (decision's current step) or calculate later
  };

  const updateDecision = async (id, updates) => {
    // Optimistic update for decision fields
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));

    try {
      await api.decisions.update(id, updates);
    } catch (error) {
      console.error('Error updating decision:', error);
      fetchDecisions(activeUserId);
    }
  };

  const deleteDecision = async (id) => {
    setDecisions(prev => prev.filter(d => d.id !== id));
    if (currentDecisionId === id) {
      setCurrentDecisionId(null);
    }

    try {
      await api.decisions.delete(id);
    } catch (error) {
      console.error('Error deleting decision:', error);
      fetchDecisions(activeUserId);
    }
  };

  const addItem = async (type, text, weight = 0) => {
    if (!currentDecisionId) return;

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
      const current = prev[currentDecisionId] || { pros: [], cons: [], comments: [] };
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
    if (!currentDecisionId) return;

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
    if (!currentDecisionId) return;

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
    setViewStep(step); // Sync view immediately
    updateDecision(currentDecisionId, { step });
  };

  const setOutcome = (status, reason) => {
    if (!currentDecisionId) return;
    updateDecision(currentDecisionId, { status, outcome_reason: reason });
  };

  const goHome = () => {
    setCurrentDecisionId(null);
    setViewStep(null);
    // Do NOT reset viewingUserId here, so consultant stays on client's list
  };

  const updateDecisionInfo = (title, description) => {
    if (!currentDecisionId) return;
    updateDecision(currentDecisionId, { title, description });
  };

  const value = {
    decisions,
    currentDecision,
    createDecision,
    selectDecision,
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
    viewStep,
    setViewStep,
    // Expose decisionItems and setDecisionItems for TaskContext and CommentContext
    decisionItems,
    setDecisionItems,
    currentDecisionId,
    fetchItems
  };

  return (
    <DecisionContext.Provider value={value}>
      {children}
    </DecisionContext.Provider>
  );
};
