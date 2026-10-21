import { join } from 'node:path';
import type { DoctorCheck } from '@foundry/core/types/doctor.js';
import type { DoctorDeps } from '../deps.js';

export function checkFoundryInstall(deps: DoctorDeps): DoctorCheck {
  const version = /^v(\d+)\.(\d+)\.(\d+)$/.exec(deps.nodeVersion);
  const major = version ? Number(version[1]) : 0;
  const minor = version ? Number(version[2]) : 0;
  if (major < 22 || (major === 22 && minor < 13)) {
    return {
      id: 'foundry-install',
      status: 'fail',
      message: `Node ${deps.nodeVersion} — requires Node ≥22.13.0.`,
      repair: 'Upgrade Node.js to version 22.13.0 or later.',
    };
  }

  const cliPath = join(deps.foundryRoot, 'packages', 'cli', 'dist', 'cli.js');
  if (!deps.fileExists(cliPath)) {
    return {
      id: 'foundry-install',
      status: 'fail',
      message: 'Foundry CLI not built (dist/cli.js missing).',
      repair: 'Run `npm run build` in the Foundry repo.',
    };
  }

  return {
    id: 'foundry-install',
    status: 'pass',
    message: `Node ${deps.nodeVersion}, CLI built`,
  };
}
