import { useCallback } from 'react';

/**
 * Custom hook for optimistic updates with automatic rollback on error
 * Designed for nested state structure like decisionItems[decisionId][listKey]
 * 
 * @param {Function} setState - State setter function
 * @param {Function} fetchData - Function to refetch data on error (for rollback)
 * @returns {Object} - Object with optimistic update functions
 */
export const useOptimisticUpdate = (setState, fetchData) => {
  /**
   * Optimistically add an item to a nested list, then sync with server
   * 
   * @param {*} parentId - Parent ID (e.g., currentDecisionId)
   * @param {string} listKey - Key in the nested object (e.g., 'pros', 'cons', 'tasks', 'comments')
   * @param {Object} tempItem - Item to add optimistically (will get temp ID)
   * @param {Function} apiCall - Async function that returns { data, error }
   * @returns {Promise} - Promise that resolves with server data or rejects with error
   */
  const optimisticAdd = useCallback(async (parentId, listKey, tempItem, apiCall) => {
    if (!parentId) return;

    const tempId = Date.now();
    const tempItemWithId = { ...tempItem, id: tempId };

    // Optimistic update
    setState(prev => {
      const current = prev[parentId] || {};
      return {
        ...prev,
        [parentId]: {
          ...current,
          [listKey]: [...(current[listKey] || []), tempItemWithId]
        }
      };
    });

    try {
      const { data, error } = await apiCall();

      if (error) {
        // Rollback on error
        if (fetchData) {
          fetchData();
        } else {
          // Manual rollback - remove temp item
          setState(prev => {
            const current = prev[parentId] || {};
            return {
              ...prev,
              [parentId]: {
                ...current,
                [listKey]: (current[listKey] || []).filter(item => item.id !== tempId)
              }
            };
          });
        }
        throw error;
      }

      // Replace temp item with real data
      setState(prev => {
        const current = prev[parentId] || {};
        return {
          ...prev,
          [parentId]: {
            ...current,
            [listKey]: (current[listKey] || []).map(item => 
              item.id === tempId ? data : item
            )
          }
        };
      });

      return data;
    } catch (error) {
      console.error('Optimistic add failed:', error);
      throw error;
    }
  }, [setState, fetchData]);

  /**
   * Optimistically update an item in a nested list, then sync with server
   * 
   * @param {*} parentId - Parent ID (e.g., currentDecisionId)
   * @param {string} listKey - Key in the nested object
   * @param {*} itemId - ID of item to update
   * @param {Object} updates - Updates to apply
   * @param {Function} apiCall - Async function that returns { error }
   * @returns {Promise} - Promise that resolves or rejects with error
   */
  const optimisticUpdate = useCallback(async (parentId, listKey, itemId, updates, apiCall) => {
    if (!parentId) return;

    // Store previous item for rollback
    let previousItem = null;

    // Optimistic update
    setState(prev => {
      const current = prev[parentId] || {};
      const list = current[listKey] || [];
      const item = list.find(i => i.id === itemId);
      if (item) {
        previousItem = { ...item };
      }

      return {
        ...prev,
        [parentId]: {
          ...current,
          [listKey]: list.map(i => i.id === itemId ? { ...i, ...updates } : i)
        }
      };
    });

    try {
      const { error } = await apiCall();

      if (error) {
        // Rollback on error
        if (fetchData) {
          fetchData();
        } else if (previousItem) {
          // Manual rollback
          setState(prev => {
            const current = prev[parentId] || {};
            return {
              ...prev,
              [parentId]: {
                ...current,
                [listKey]: (current[listKey] || []).map(i => 
                  i.id === itemId ? previousItem : i
                )
              }
            };
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Optimistic update failed:', error);
      throw error;
    }
  }, [setState, fetchData]);

  /**
   * Optimistically delete an item from a nested list, then sync with server
   * 
   * @param {*} parentId - Parent ID (e.g., currentDecisionId)
   * @param {string} listKey - Key in the nested object
   * @param {*} itemId - ID of item to delete
   * @param {Function} apiCall - Async function that returns { error }
   * @returns {Promise} - Promise that resolves or rejects with error
   */
  const optimisticDelete = useCallback(async (parentId, listKey, itemId, apiCall) => {
    if (!parentId) return;

    // Store previous item for rollback
    let previousItem = null;

    // Optimistic delete
    setState(prev => {
      const current = prev[parentId] || {};
      const list = current[listKey] || [];
      const item = list.find(i => i.id === itemId);
      if (item) {
        previousItem = { ...item };
      }

      return {
        ...prev,
        [parentId]: {
          ...current,
          [listKey]: list.filter(i => i.id !== itemId)
        }
      };
    });

    try {
      const { error } = await apiCall();

      if (error) {
        // Rollback on error
        if (fetchData) {
          fetchData();
        } else if (previousItem) {
          // Manual rollback - restore item
          setState(prev => {
            const current = prev[parentId] || {};
            return {
              ...prev,
              [parentId]: {
                ...current,
                [listKey]: [...(current[listKey] || []), previousItem]
              }
            };
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Optimistic delete failed:', error);
      throw error;
    }
  }, [setState, fetchData]);

  return {
    optimisticAdd,
    optimisticUpdate,
    optimisticDelete
  };
};
