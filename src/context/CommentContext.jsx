import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useDecision } from './DecisionContext';
import { api } from '../apiClient';
import { useOptimisticUpdate } from '../hooks/useOptimisticUpdate';

const CommentContext = createContext();

export const useComment = () => {
  const context = useContext(CommentContext);
  if (!context) {
    throw new Error('useComment must be used within a CommentProvider');
  }
  return context;
};

export const CommentProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { decisionItems, setDecisionItems, fetchItems } = useDecision();

  // Note: We don't use fetchData in the hook because decisionId varies per call
  // Manual rollback will be handled by the hook, and we'll refetch on error if needed
  const optimisticUpdate = useOptimisticUpdate(setDecisionItems, null);

  const addComment = async (decisionId, content, targetItemId = null, visibility = 'public', section = 'general') => {
    if (!currentUser) return;

    const newComment = {
      decision_id: decisionId,
      user_id: currentUser.id,
      content,
      target_item_id: section === 'task' ? null : targetItemId,
      task_id: section === 'task' ? targetItemId : null,
      visibility,
      section: section === 'task' ? 'strategy' : (targetItemId ? null : section)
    };

    const dbPayload = { ...newComment };
    if (section === 'task') {
      dbPayload.target_item_id = null;
      dbPayload.task_id = targetItemId;
      dbPayload.section = 'strategy';
    } else {
      dbPayload.task_id = null;
    }

    // Create temp comment with user profile for immediate display
    const tempComment = {
      ...newComment,
      id: Date.now(),
      created_at: new Date().toISOString(),
      profiles: currentUser
    };

    try {
      return await optimisticUpdate.optimisticAdd(
        decisionId,
        'comments',
        tempComment,
        async () => {
          try {
            const data = await api.comments.create(dbPayload);
            return { data, error: null };
          } catch (error) {
            return { data: null, error };
          }
        }
      );
    } catch (error) {
      // Refetch to ensure consistency after error
      fetchItems(decisionId);
      throw error;
    }
  };

  const getComments = (decisionId) => {
    return decisionItems[decisionId]?.comments || [];
  };

  const value = {
    addComment,
    getComments
  };

  return (
    <CommentContext.Provider value={value}>
      {children}
    </CommentContext.Provider>
  );
};
