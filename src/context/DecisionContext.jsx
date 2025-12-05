import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../supabaseClient';

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

  useEffect(() => {
    if (currentUser) {
      // If viewingUserId is set (consultant viewing client), fetch that user's decisions
      // Otherwise fetch current user's decisions
      fetchDecisions(viewingUserId || currentUser.id);
    } else {
      setDecisions([]);
      setCurrentDecisionId(null);
      setDecisionItems({});
      setViewingUserId(null);
    }
  }, [currentUser, viewingUserId]);

  // Fetch items when current decision changes
  useEffect(() => {
    if (currentDecisionId) {
      fetchItems(currentDecisionId);
    }
  }, [currentDecisionId]);

  const fetchDecisions = async (userId) => {
    if (!userId && !currentUser) return;
    const targetUserId = userId || currentUser.id;

    setLoading(true);
    const { data, error } = await supabase
      .from('decisions')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching decisions:', error);
    } else {
      setDecisions(data || []);
    }
    setLoading(false);
  };

  const fetchItems = async (decisionId) => {
    const { data, error } = await supabase
      .from('decision_items')
      .select('*')
      .eq('decision_id', decisionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching items:', error);
      return;
    }

    const pros = data.filter(i => i.type === 'pro');
    const cons = data.filter(i => i.type === 'con');

    // Fetch tasks
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .in('decision_item_id', data.map(i => i.id))
      .order('created_at', { ascending: true });

    let tasks = [];
    if (!tasksError && tasksData) {
      tasks = tasksData;
    }

    // Fetch comments
    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select('*, profiles(*)')
      .eq('decision_id', decisionId)
      .order('created_at', { ascending: true });

    let comments = [];
    if (!commentsError && commentsData) {
      comments = commentsData;
    }

    setDecisionItems(prev => ({
      ...prev,
      [decisionId]: { pros, cons, tasks, comments }
    }));
  };

  const currentDecision = decisions.find(d => d.id === currentDecisionId)
    ? {
      ...decisions.find(d => d.id === currentDecisionId),
      pros: decisionItems[currentDecisionId]?.pros || [],
      cons: decisionItems[currentDecisionId]?.cons || []
    }
    : null;

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

    const { data, error } = await supabase
      .from('decisions')
      .insert([newDecision])
      .select()
      .single();

    if (error) {
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

    const { error } = await supabase
      .from('decisions')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating decision:', error);
      fetchDecisions();
    }
  };

  const deleteDecision = async (id) => {
    setDecisions(prev => prev.filter(d => d.id !== id));
    if (currentDecisionId === id) {
      setCurrentDecisionId(null);
    }

    const { error } = await supabase
      .from('decisions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting decision:', error);
      fetchDecisions();
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

    const { data, error } = await supabase
      .from('decision_items')
      .insert([newItem])
      .select()
      .single();

    if (error) {
      console.error('Error adding item:', error);
      // Revert logic would go here
      fetchItems(currentDecisionId);
    } else {
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

    const { error } = await supabase
      .from('decision_items')
      .update(updates)
      .eq('id', itemId);

    if (error) {
      console.error('Error updating item:', error);
      fetchItems(currentDecisionId);
    }
  };

  const updateItemWeight = (type, itemId, weight) => updateItem(type === 'pros' ? 'pro' : 'con', itemId, { weight });
  const updateStrategy = (type, itemId, strategy) => updateItem(type === 'pros' ? 'pro' : 'con', itemId, { strategy });

  const addTask = async (decisionItemId, content) => {
    if (!currentDecisionId) return;

    const newTask = {
      decision_item_id: decisionItemId,
      content,
      is_completed: false
    };

    // Optimistic
    const tempId = Date.now();
    setDecisionItems(prev => {
      const current = prev[currentDecisionId] || { pros: [], cons: [], tasks: [], comments: [] };
      return {
        ...prev,
        [currentDecisionId]: {
          ...current,
          tasks: [...(current.tasks || []), { ...newTask, id: tempId }]
        }
      };
    });

    const { data, error } = await supabase
      .from('tasks')
      .insert([newTask])
      .select()
      .single();

    if (error) {
      console.error('Error adding task:', error);
      fetchItems(currentDecisionId);
    } else {
      setDecisionItems(prev => {
        const current = prev[currentDecisionId];
        return {
          ...prev,
          [currentDecisionId]: {
            ...current,
            tasks: (current.tasks || []).map(t => t.id === tempId ? data : t)
          }
        };
      });
    }
  };

  const updateTask = async (taskId, updates) => {
    if (!currentDecisionId) return;

    // Optimistic
    setDecisionItems(prev => {
      const current = prev[currentDecisionId];
      return {
        ...prev,
        [currentDecisionId]: {
          ...current,
          tasks: (current.tasks || []).map(t => t.id === taskId ? { ...t, ...updates } : t)
        }
      };
    });

    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId);

    if (error) {
      console.error('Error updating task:', error);
      fetchItems(currentDecisionId);
    }
  };

  const deleteTask = async (taskId) => {
    if (!currentDecisionId) return;

    // Optimistic
    setDecisionItems(prev => {
      const current = prev[currentDecisionId];
      return {
        ...prev,
        [currentDecisionId]: {
          ...current,
          tasks: (current.tasks || []).filter(t => t.id !== taskId)
        }
      };
    });

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      console.error('Error deleting task:', error);
      fetchItems(currentDecisionId);
    }
  };

  const removeItem = async (type, itemId) => {
    if (!currentDecisionId) return;

    const typeKey = type === 'pros' ? 'pro' : 'con';

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

    const { error } = await supabase
      .from('decision_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error('Error deleting item:', error);
      fetchItems(currentDecisionId);
    }
  };

  const addComment = async (decisionId, content, targetItemId = null, visibility = 'public', section = 'general') => {
    if (!currentUser) return;

    const newComment = {
      decision_id: decisionId,
      user_id: currentUser.id,
      content,
      target_item_id: section === 'task' ? null : targetItemId,
      task_id: section === 'task' ? targetItemId : null, // If commenting on a task, targetItemId is actually taskId
      visibility,
      section: section === 'task' ? 'strategy' : (targetItemId ? null : section) // Flatten logic suitable for current schema usage
    };

    // Correct payload adjustment:
    // If we are commenting on a TASK, targetItemId passed here is treated as Task ID?
    // The previous design used target_item_id for Decision Items (Pros/Cons).
    // Now we have tasks.
    // Let's clarify argument usage:
    // If commenting on Pro/Con: targetItemId = item.id, section = null
    // If commenting on Task: targetItemId = task.id, BUT we need to store it in task_id column?
    // To keep API simple, let's look at the 'section' arg or infer.

    const dbPayload = { ...newComment };
    if (section === 'task') {
      dbPayload.target_item_id = null;
      dbPayload.task_id = targetItemId;
      dbPayload.section = 'strategy'; // Tasks are part of strategy
    } else {
      dbPayload.task_id = null;
    }

    // Optimistic update
    const tempId = Date.now();
    const commentWithUser = {
      ...newComment,
      id: tempId,
      created_at: new Date().toISOString(),
      profiles: currentUser // Mock profile for immediate display
    };

    setDecisionItems(prev => {
      const current = prev[decisionId] || { pros: [], cons: [], tasks: [], comments: [] };
      return {
        ...prev,
        [decisionId]: {
          ...current,
          comments: [...(current.comments || []), commentWithUser]
        }
      };
    });

    const { data, error } = await supabase
      .from('comments')
      .insert([dbPayload])
      .select('*, profiles(*)')
      .single();

    if (error) {
      console.error('Error adding comment:', error);
      // Revert logic
      fetchItems(decisionId);
    } else {
      setDecisionItems(prev => {
        const current = prev[decisionId];
        return {
          ...prev,
          [decisionId]: {
            ...current,
            comments: (current.comments || []).map(c => c.id === tempId ? data : c)
          }
        };
      });
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
    // Comments
    addComment,
    getComments: (decisionId) => decisionItems[decisionId]?.comments || [],
    getTasks: (decisionId) => decisionItems[decisionId]?.tasks || [],
    addTask,
    updateTask,
    deleteTask,
  };

  return (
    <DecisionContext.Provider value={value}>
      {children}
    </DecisionContext.Provider>
  );
};
