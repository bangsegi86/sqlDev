import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { api } from '../api/client.js';

const AppContext = createContext(null);

const initialState = {
  connections: [],
  connectionStatuses: {},
  activeConnectionId: null,
  selectedSchema: null,
  expandedNodes: new Set(),
  tabs: [],
  activeTabId: null,
  statusMessage: '',
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTIONS':
      return { ...state, connections: action.payload };
    case 'ADD_CONNECTION':
      return { ...state, connections: [...state.connections, action.payload] };
    case 'UPDATE_CONNECTION':
      return {
        ...state,
        connections: state.connections.map(c => c.id === action.payload.id ? action.payload : c),
      };
    case 'REMOVE_CONNECTION': {
      const tabs = state.tabs.filter(t => t.connectionId !== action.payload);
      const activeTabId = tabs.find(t => t.id === state.activeTabId) ? state.activeTabId : (tabs[tabs.length - 1]?.id || null);
      const activeConnectionId = state.activeConnectionId === action.payload ? null : state.activeConnectionId;
      return {
        ...state,
        connections: state.connections.filter(c => c.id !== action.payload),
        tabs,
        activeTabId,
        activeConnectionId,
        selectedSchema: state.selectedSchema?.connectionId === action.payload ? null : state.selectedSchema,
      };
    }
    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        connectionStatuses: { ...state.connectionStatuses, [action.payload.id]: action.payload.status },
      };
    case 'SET_STATUS_MAP': {
      const statuses = { ...state.connectionStatuses };
      for (const [id, info] of Object.entries(action.payload)) {
        statuses[id] = info.connected ? 'connected' : 'disconnected';
      }
      return { ...state, connectionStatuses: statuses };
    }
    case 'SET_ACTIVE_CONNECTION':
      return { ...state, activeConnectionId: action.payload };
    case 'SET_SELECTED_SCHEMA':
      return { ...state, selectedSchema: action.payload };
    case 'TOGGLE_NODE': {
      const next = new Set(state.expandedNodes);
      if (next.has(action.payload)) next.delete(action.payload);
      else next.add(action.payload);
      return { ...state, expandedNodes: next };
    }
    case 'OPEN_TAB': {
      const exists = state.tabs.find(t => t.id === action.payload.id);
      if (exists) return { ...state, activeTabId: action.payload.id };
      return { ...state, tabs: [...state.tabs, action.payload], activeTabId: action.payload.id };
    }
    case 'CLOSE_TAB': {
      const tabs = state.tabs.filter(t => t.id !== action.payload);
      let activeTabId = state.activeTabId;
      if (activeTabId === action.payload) {
        const idx = state.tabs.findIndex(t => t.id === action.payload);
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id || null;
      }
      return { ...state, tabs, activeTabId };
    }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: action.payload };
    case 'UPDATE_TAB_CONTENT':
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === action.payload.tabId ? { ...t, content: { ...t.content, ...action.payload.content } } : t),
      };
    case 'SET_STATUS':
      return { ...state, statusMessage: action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef(null);

  useEffect(() => {
    api.getConnections()
      .then(conns => dispatch({ type: 'SET_CONNECTIONS', payload: conns }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      api.getStatus()
        .then(statusMap => dispatch({ type: 'SET_STATUS_MAP', payload: statusMap }))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function openTab(dispatch, state, tabSpec) {
  const exists = state.tabs.find(t => t.id === tabSpec.id);
  if (exists) {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tabSpec.id });
  } else {
    dispatch({ type: 'OPEN_TAB', payload: tabSpec });
  }
}
