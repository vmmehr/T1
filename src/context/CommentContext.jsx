import { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
  const [threadSeenCounts, setThreadSeenCounts] = useState({});

  // Note: We don't use fetchData in the hook because decisionId varies per call
  // Manual rollback will be handled by the hook, and we'll refetch on error if needed
  const optimisticUpdate = useOptimisticUpdate(setDecisionItems, null);

  useEffect(() => {
    setThreadSeenCounts({});
  }, [currentUser?.id]);

  const addComment = async (decisionId, content, targetItemId = null, visibility = 'public', section = 'general') => {
    if (!currentUser) return;

    const isTaskComment = section === 'task';
    if (isTaskComment) {
      const tasks = decisionItems[decisionId]?.tasks || [];
      const task = tasks.find((item) => item.id === targetItemId);

      if (!task) {
        await fetchItems(decisionId);
        throw new Error('Task context is stale. Please try again.');
      }

      if (!task.created_at) {
        throw new Error('Task is still being saved. Please retry in a second.');
      }
    }

    const normalizedSection = isTaskComment ? 'strategy' : (section || 'general');
    const normalizedTargetItemId = isTaskComment ? null : targetItemId;
    const normalizedTaskId = isTaskComment ? targetItemId : null;

    const newComment = {
      decision_id: decisionId,
      user_id: currentUser.id,
      content,
      target_item_id: normalizedTargetItemId,
      task_id: normalizedTaskId,
      visibility,
      section: normalizedSection,
    };

    const dbPayload = { ...newComment };

    // Create temp comment with user profile for immediate display
    const tempComment = {
      ...newComment,
      id: Date.now(),
      created_at: new Date().toISOString(),
      is_pending: true,
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

  const deleteComment = async (decisionId, commentId) => {
    if (!currentUser || !decisionId || !commentId) return;

    const currentComments = decisionItems[decisionId]?.comments || [];
    const targetComment = currentComments.find((comment) => String(comment.id) === String(commentId));
    if (!targetComment) return;

    if (String(targetComment.user_id) !== String(currentUser.id)) {
      throw new Error('You can only delete your own comments.');
    }
    if (typeof window !== 'undefined' && !window.confirm('آیا از حذف این یادداشت مطمئن هستید؟')) return;

    try {
      await optimisticUpdate.optimisticDelete(
        decisionId,
        'comments',
        commentId,
        async () => {
          try {
            await api.comments.delete(commentId);
            return { error: null };
          } catch (error) {
            return { error };
          }
        }
      );

      // Keep unread badges in sync after deletions.
      await fetchItems(decisionId);
    } catch (error) {
      fetchItems(decisionId);
      throw error;
    }
  };

  const getComments = (decisionId) => {
    return decisionItems[decisionId]?.comments || [];
  };

  const markTaskCommentsRead = async (decisionId, taskId) => {
    if (!currentUser || !decisionId || !taskId) return;

    setDecisionItems((prev) => {
      const current = prev[decisionId] || {};
      const taskUnreadCounts = { ...(current.taskUnreadCounts || {}) };
      taskUnreadCounts[taskId] = 0;
      return {
        ...prev,
        [decisionId]: {
          ...current,
          taskUnreadCounts,
        },
      };
    });

    try {
      await api.comments.markTaskRead(taskId);
    } catch (error) {
      fetchItems(decisionId);
      throw error;
    }
  };

  const markItemCommentsRead = async (decisionId, itemId) => {
    if (!currentUser || !decisionId || !itemId) return;

    setDecisionItems((prev) => {
      const current = prev[decisionId] || {};
      const itemUnreadCounts = { ...(current.itemUnreadCounts || {}) };
      itemUnreadCounts[itemId] = 0;
      return {
        ...prev,
        [decisionId]: {
          ...current,
          itemUnreadCounts,
        },
      };
    });

    try {
      await api.comments.markDecisionItemRead(itemId);
    } catch (error) {
      fetchItems(decisionId);
      throw error;
    }
  };

  const getThreadSeenCount = useCallback((threadKey) => {
    if (!threadKey) return undefined;
    if (!Object.prototype.hasOwnProperty.call(threadSeenCounts, threadKey)) {
      return undefined;
    }
    return Number(threadSeenCounts[threadKey] || 0);
  }, [threadSeenCounts]);

  const markThreadSeen = useCallback((threadKey, seenCount) => {
    if (!threadKey) return;
    const normalizedSeenCount = Math.max(Number(seenCount) || 0, 0);

    setThreadSeenCounts((prev) => {
      const previousSeenCount = Number(prev[threadKey] || 0);
      if (previousSeenCount === normalizedSeenCount) return prev;
      return {
        ...prev,
        [threadKey]: normalizedSeenCount,
      };
    });
  }, []);

  const value = {
    addComment,
    deleteComment,
    getComments,
    markTaskCommentsRead,
    markItemCommentsRead,
    getThreadSeenCount,
    markThreadSeen
  };

  return (
    <CommentContext.Provider value={value}>
      {children}
    </CommentContext.Provider>
  );
};
