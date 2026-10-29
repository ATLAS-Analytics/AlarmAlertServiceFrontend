import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { ClientOptions } from '@elastic/elasticsearch';

export interface Preference {
  name: string;
  type: 'boolean' | 'number' | 'email';
  default_value: boolean | number | string;
}

export interface Config {
  ES_HOST: ClientOptions;
  TITLE?: string;
  SESSION_SECRET?: string;
  TOPOLOGY_FIELDS: string[];
  REQUIRED_ALARM_FIELDS: string[];
  OPTIONAL_ALARM_FIELDS: string[];
  REQUIRED_ALARM_TOPOLOGY_FIELDS: string[];
  REQUIRED_HEARTBEAT_FIELDS: string[];
  OPTIONAL_HEARTBEAT_FIELDS: string[];
  REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS: string[];
  PREFERENCES: Record<string, Preference>;
}

export interface GlobusConfig {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  REDIRECT_LINK: string;
  AUTHORIZE_URI: string;
  TOKEN_URI: string;
  LOGOUT_URI: string;
}

// Same location as before (mounted from k8s secrets); override for local development.
const CONFIG_DIR = process.env.AAASF_CONFIG_DIR ?? '/etc/aaasf';

function readJson<T>(file: string): T {
  // read at runtime from outside the app; nothing for the build to trace.
  const filePath = path.join(/* turbopackIgnore: true */ CONFIG_DIR, file);
  return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ filePath, 'utf8')) as T;
}

let config: Config | undefined;
let globusConfig: GlobusConfig | undefined;

export function getConfig(): Config {
  if (!config) {
    const raw = readJson<Config>('config.json');
    const topology = raw.TOPOLOGY_FIELDS;
    // topology fields are always required, both for documents and for their registration.
    config = {
      ...raw,
      REQUIRED_ALARM_FIELDS: [...new Set([...raw.REQUIRED_ALARM_FIELDS, ...topology])],
      REQUIRED_ALARM_TOPOLOGY_FIELDS: [...new Set([...raw.REQUIRED_ALARM_TOPOLOGY_FIELDS, ...topology])],
      REQUIRED_HEARTBEAT_FIELDS: [...new Set([...raw.REQUIRED_HEARTBEAT_FIELDS, ...topology])],
      REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS: [...new Set([...raw.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS, ...topology])],
    };
  }
  return config;
}

export function getGlobusConfig(): GlobusConfig {
  if (!globusConfig) globusConfig = readJson<GlobusConfig>('globus-config.json');
  return globusConfig;
}
