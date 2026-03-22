import React, { createContext, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { DEFAULT_RUNTIME_CONFIG, loadRuntimeConfig } from "../config/runtimeConfig";

const RuntimeConfigContext = createContext({
  config: DEFAULT_RUNTIME_CONFIG,
  source: "fallback",
  status: "loading",
});

export function RuntimeConfigProvider({ children }) {
  const [state, setState] = useState({
    config: DEFAULT_RUNTIME_CONFIG,
    source: "fallback",
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    void loadRuntimeConfig().then(({ config, source }) => {
      if (!cancelled) {
        setState({
          config,
          source,
          status: source === "bootstrap" ? "ready" : "fallback",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <RuntimeConfigContext.Provider value={state}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig() {
  return useContext(RuntimeConfigContext).config;
}

export function useRuntimeConfigState() {
  return useContext(RuntimeConfigContext);
}

RuntimeConfigProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
