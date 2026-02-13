import { createContext, useContext } from 'react';
import { useDecision } from './DecisionContext';
import { api } from '../apiClient';
import { useOptimisticUpdate } from '../hooks/useOptimisticUpdate';

const TaskContext = createContext();

export const useTask = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTask must be used within a TaskProvider');
  }
  return context;
};

export const TaskProvider = ({ children }) => {
  const { currentDecisionId, decisionItems, setDecisionItems, fetchItems, isReadOnlyView } = useDecision();

  const optimisticUpdate = useOptimisticUpdate(
    setDecisionItems,
    () => currentDecisionId && fetchItems(currentDecisionId)
  );

  const addTask = async (decisionItemId, content) => {
    if (!currentDecisionId || isReadOnlyView) return;

    const newTask = {
      decision_item_id: decisionItemId,
      content,
      is_completed: false
    };

    return optimisticUpdate.optimisticAdd(
      currentDecisionId,
      'tasks',
      newTask,
      async () => {
        try {
          const data = await api.tasks.create(newTask);
          return { data, error: null };
        } catch (error) {
          return { data: null, error };
        }
      }
    );
  };

  const updateTask = async (taskId, updates) => {
    if (!currentDecisionId || isReadOnlyView) return;

    return optimisticUpdate.optimisticUpdate(
      currentDecisionId,
      'tasks',
      taskId,
      updates,
      async () => {
        try {
          await api.tasks.update(taskId, updates);
          return { error: null };
        } catch (error) {
          return { error };
        }
      }
    );
  };

  const deleteTask = async (taskId) => {
    if (!currentDecisionId || isReadOnlyView) return;

    return optimisticUpdate.optimisticDelete(
      currentDecisionId,
      'tasks',
      taskId,
      async () => {
        try {
          await api.tasks.delete(taskId);
          return { error: null };
        } catch (error) {
          return { error };
        }
      }
    );
  };

  const getTasks = (decisionId) => {
    return decisionItems[decisionId]?.tasks || [];
  };

  const value = {
    addTask,
    updateTask,
    deleteTask,
    getTasks
  };

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};
