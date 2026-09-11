#!/usr/bin/env node

/**
 * CVMorph Unified Multi-Environment Deployment Script
 *
 * Allows seamless deployment to Dev, Production, or Both without
 * manual project linking/unlinking and without requiring GitHub integration.
 *
 * Usage:
 *   node scripts/deploy.mjs dev        # Deploy only to Dev
 *   node scripts/deploy.mjs prod       # Deploy only to Production
 *   node scripts/deploy.mjs all        # Deploy to Dev, then Production
 *   node scripts/deploy.mjs            # Interactive selection menu
 */

import { spawnSync, spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const VERCEL_DIR = resolve(ROOT_DIR, '.vercel');

// ── Environment Configuration ────────────────────────────────────────────────
const ENV_CONFIG = {
  prod: {
    key: 'prod',
    name: process.env.VERCEL_PROD_PROJECT || 'cvmorph',
    label: 'Production',
    domainHint: 'https://cvmorph-fawn.vercel.app (or custom domain)',
    backupConfig: resolve(VERCEL_DIR, 'project.prod.json'),
  },
  dev: {
    key: 'dev',
    name: process.env.VERCEL_DEV_PROJECT || process.env.VERCEL_STAGING_PROJECT || 'cvmorph-dev',
    label: 'Development (Dev)',
    domainHint: 'https://cvmorph-dev.vercel.app',
    backupConfig: resolve(VERCEL_DIR, 'project.dev.json'),
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function log(msg, color = '\x1b[36m') {
  console.log(`${color}${msg}\x1b[0m`);
}

function success(msg) {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function error(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
}

function warn(msg) {
  console.warn(`\x1b[33m⚠ ${msg}\x1b[0m`);
}

function checkVercelAuth() {
  try {
    const stdout = execSync('vercel whoami', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const username = stdout.trim().split('\n').pop();
    return username;
  } catch {
    error('You are not authenticated with Vercel CLI.');
    log('Please run `vercel login` first.', '\x1b[33m');
    process.exit(1);
  }
}

function ensureVercelProjectExists(projectName) {
  try {
    execSync(`vercel deploy --dry --project ${projectName}`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = (err.stderr || '').toString();
    const stdout = (err.stdout || '').toString();
    if (stderr.includes('not found') || stdout.includes('not found')) {
      log(`Project "${projectName}" does not exist in your Vercel account yet. Creating it...`, '\x1b[33m');
      try {
        execSync(`vercel project add ${projectName}`, {
          cwd: ROOT_DIR,
          stdio: 'inherit',
        });
        success(`Created Vercel project: ${projectName}`);
      } catch {
        warn(`Could not automatically create "${projectName}". Continuing deployment anyway...`);
      }
    }
  }
}

function syncProjectJson(targetConfig) {
  if (!existsSync(VERCEL_DIR)) {
    mkdirSync(VERCEL_DIR, { recursive: true });
  }

  const currentProjectJsonPath = resolve(VERCEL_DIR, 'project.json');

  // If a backup config exists for this target, restore it to project.json
  if (existsSync(targetConfig.backupConfig)) {
    try {
      const data = readFileSync(targetConfig.backupConfig, 'utf8');
      writeFileSync(currentProjectJsonPath, data, 'utf8');
    } catch {
      // Ignore copy error
    }
  } else if (existsSync(currentProjectJsonPath)) {
    // Save existing project.json as backup if it matches this project
    try {
      const current = JSON.parse(readFileSync(currentProjectJsonPath, 'utf8'));
      if (current.projectName === targetConfig.name) {
        writeFileSync(targetConfig.backupConfig, JSON.stringify(current, null, 2), 'utf8');
      }
    } catch {
      // Ignore read error
    }
  }
}

function backupProjectJsonAfterDeploy(targetConfig) {
  const currentProjectJsonPath = resolve(VERCEL_DIR, 'project.json');
  if (existsSync(currentProjectJsonPath)) {
    try {
      const current = JSON.parse(readFileSync(currentProjectJsonPath, 'utf8'));
      if (current.projectName === targetConfig.name) {
        writeFileSync(targetConfig.backupConfig, JSON.stringify(current, null, 2), 'utf8');
      }
    } catch {
      // Ignore
    }
  }
}

function prepareEnvFiles(envKey) {
  log(`Applying environment configuration for [${envKey.toUpperCase()}]...`, '\x1b[36m');

  // apps/web (.env.dev / .env.prod -> .env)
  const webTargetEnv = resolve(ROOT_DIR, 'apps', 'web', `.env.${envKey}`);
  const webActiveEnv = resolve(ROOT_DIR, 'apps', 'web', '.env');
  if (existsSync(webTargetEnv)) {
    try {
      copyFileSync(webTargetEnv, webActiveEnv);
      success(`Injected apps/web/.env from .env.${envKey}`);
    } catch (e) {
      warn(`Failed to copy apps/web/.env.${envKey}: ${e.message}`);
    }
  }

  // apps/api (.env.dev / .env.prod -> .env)
  const apiTargetEnv = resolve(ROOT_DIR, 'apps', 'api', `.env.${envKey}`);
  const apiActiveEnv = resolve(ROOT_DIR, 'apps', 'api', '.env');
  if (existsSync(apiTargetEnv)) {
    try {
      copyFileSync(apiTargetEnv, apiActiveEnv);
      success(`Injected apps/api/.env from .env.${envKey}`);
    } catch (e) {
      warn(`Failed to copy apps/api/.env.${envKey}: ${e.message}`);
    }
  }
}

async function runDeploy(envKey) {
  const target = ENV_CONFIG[envKey];
  if (!target) {
    error(`Unknown deployment target: ${envKey}`);
    return false;
  }

  log(`\n===============================================================`, '\x1b[35m');
  log(`  Deploying to [${target.label.toUpperCase()}] -> Project: ${target.name}`, '\x1b[35m');
  log(`  Domain target: ${target.domainHint}`, '\x1b[90m');
  log(`===============================================================\n`, '\x1b[35m');

  prepareEnvFiles(target.key);
  ensureVercelProjectExists(target.name);
  syncProjectJson(target);

  return new Promise((resolvePromise) => {
    const deployCmd = `vercel deploy --project ${target.name} --prod --yes`;
    const child = spawn(deployCmd, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        backupProjectJsonAfterDeploy(target);
        success(`Successfully deployed to ${target.label} (${target.name})!`);
        resolvePromise(true);
      } else {
        error(`Deployment to ${target.label} failed with exit code ${code}.`);
        resolvePromise(false);
      }
    });

    child.on('error', (err) => {
      error(`Failed to launch Vercel CLI: ${err.message}`);
      resolvePromise(false);
    });
  });
}

function promptSelection() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n\x1b[36m╔═══════════════════════════════════════════════════════════╗');
  console.log('║           CVMorph Multi-Environment Deployment            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\x1b[0m\n');
  console.log('  \x1b[1m[1]\x1b[0m Development    (\x1b[33mcvmorph-dev\x1b[0m)');
  console.log('  \x1b[1m[2]\x1b[0m Production     (\x1b[32mcvmorph\x1b[0m)');
  console.log('  \x1b[1m[3]\x1b[0m Both           (\x1b[35mDev first, then Production\x1b[0m)');
  console.log('  \x1b[1m[4]\x1b[0m Cancel / Exit\n');

  rl.question('Select target [1-4]: ', async (ans) => {
    rl.close();
    const choice = ans.trim();

    if (choice === '1' || choice.toLowerCase() === 'dev' || choice.toLowerCase() === 'staging') {
      await runDeploy('dev');
    } else if (choice === '2' || choice.toLowerCase() === 'prod' || choice.toLowerCase() === 'production') {
      await runDeploy('prod');
    } else if (choice === '3' || choice.toLowerCase() === 'both' || choice.toLowerCase() === 'all') {
      log('\nDeploying to Dev first...');
      const ok = await runDeploy('dev');
      if (ok) {
        log('\nDev deployment completed. Now deploying to Production...');
        await runDeploy('prod');
      } else {
        error('Dev deployment failed. Aborting Production deployment.');
      }
    } else {
      log('Deployment cancelled.');
    }
  });
}

// ── Main Entrypoint ──────────────────────────────────────────────────────────
async function main() {
  const user = checkVercelAuth();
  log(`Logged in to Vercel as: \x1b[1m${user}\x1b[0m`, '\x1b[90m');

  const arg = (process.argv[2] || '').toLowerCase();

  if (arg === 'dev' || arg === 'development' || arg === 'staging' || arg === 'stage') {
    await runDeploy('dev');
  } else if (arg === 'prod' || arg === 'production') {
    await runDeploy('prod');
  } else if (arg === 'all' || arg === 'both') {
    log('\nDeploying to Dev first...');
    const ok = await runDeploy('dev');
    if (ok) {
      log('\nDev deployment completed. Now deploying to Production...');
      await runDeploy('prod');
    } else {
      error('Dev deployment failed. Aborting Production deployment.');
    }
  } else if (arg === 'help' || arg === '--help' || arg === '-h') {
    console.log(`
Usage:
  node scripts/deploy.mjs [target]
  npm run deploy:[target]

Targets:
  dev        Deploy exclusively to Development (cvmorph-dev)
  prod       Deploy exclusively to Production (cvmorph)
  all        Deploy sequentially to Dev then Production
  (none)     Interactive terminal menu
    `);
  } else {
    promptSelection();
  }
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
