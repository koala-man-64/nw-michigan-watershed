export function getRuntimeEnv() {
  const processEnv = globalThis.process?.env || {};
  const viteEnv = import.meta.env || {};

  return {
    ...processEnv,
    ...viteEnv,
  };
}

export function getRuntimeEnvString(name, fallback = "") {
  return String(getRuntimeEnv()[name] ?? fallback).trim();
}
