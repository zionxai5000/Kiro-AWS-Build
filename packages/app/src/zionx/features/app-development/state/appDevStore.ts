/**
 * Zustand store for the App Development feature.
 *
 * Uses persist middleware with MMKV adapter for fast, synchronous persistence
 * on React Native. One store per feature — no Context API for high-frequency
 * updates (generation streaming).
 *
 * Note: In this monorepo (Node.js backend), zustand and react-native-mmkv are
 * not installed. This file defines the store structure and will be consumed
 * by the React Native app at runtime. The implementation is valid Zustand code
 * that compiles with the correct dependencies present.
 */

import type {
  AppDevState,
  AppDevActions,
  ChatMessage,
  GeneratedFile,
  HookExecution,
  PendingPrompt,
  Project,
  ProjectError,
  ProjectStatus,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

export const INITIAL_STATE: AppDevState = {
  projects: {},
  activeProjectId: null,
  messages: [],
  pendingPrompt: null,
  hookExecutions: [],
  isGenerating: false,
  isBuilding: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Store Creator (framework-agnostic logic)
// ---------------------------------------------------------------------------

/**
 * Creates the store actions given a `set` and `get` function.
 * This is the Zustand pattern: create((set, get) => ({ ...state, ...actions }))
 *
 * When integrated into the React Native app, wrap with:
 *   import { create } from 'zustand';
 *   import { persist, createJSONStorage } from 'zustand/middleware';
 *   import { MMKV } from 'react-native-mmkv';
 *
 *   const storage = new MMKV({ id: 'app-dev-store' });
 *   const mmkvStorage = createJSONStorage(() => ({
 *     getItem: (key) => storage.getString(key) ?? null,
 *     setItem: (key, value) => storage.set(key, value),
 *     removeItem: (key) => storage.delete(key),
 *   }));
 *
 *   export const useAppDevStore = create(
 *     persist(createAppDevStore, { name: 'app-dev-store', storage: mmkvStorage })
 *   );
 */
export function createAppDevStore(
  set: (partial: Partial<AppDevState> | ((state: AppDevState) => Partial<AppDevState>)) => void,
  get: () => AppDevState,
): AppDevState & AppDevActions {
  return {
    ...INITIAL_STATE,

    createProject(name: string, description: string): string {
      const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const project: Project = {
        id,
        name,
        description,
        status: 'idle',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        platform: 'both',
        files: [],
      };
      set((state) => ({
        projects: { ...state.projects, [id]: project },
        activeProjectId: id,
      }));
      return id;
    },

    setActiveProject(projectId: string): void {
      set({ activeProjectId: projectId });
    },

    addMessage(message: ChatMessage): void {
      set((state) => ({
        messages: [...state.messages, message],
      }));
    },

    setPendingPrompt(prompt: PendingPrompt | null): void {
      set({ pendingPrompt: prompt });
    },

    updateProjectStatus(projectId: string, status: ProjectStatus): void {
      set((state) => {
        const project = state.projects[projectId];
        if (!project) return {};
        return {
          projects: {
            ...state.projects,
            [projectId]: {
              ...project,
              status,
              updatedAt: new Date().toISOString(),
            },
          },
          isGenerating: status === 'generating',
          isBuilding: status === 'building',
        };
      });
    },

    addGeneratedFiles(projectId: string, files: GeneratedFile[]): void {
      set((state) => {
        const project = state.projects[projectId];
        if (!project) return {};
        return {
          projects: {
            ...state.projects,
            [projectId]: {
              ...project,
              files: [...project.files, ...files],
              updatedAt: new Date().toISOString(),
            },
          },
        };
      });
    },

    setError(error: ProjectError | null): void {
      set({ error });
    },

    logHookExecution(execution: HookExecution): void {
      set((state) => ({
        hookExecutions: [...state.hookExecutions.slice(-99), execution], // keep last 100
      }));
    },

    reset(): void {
      set(INITIAL_STATE);
    },
  };
}
