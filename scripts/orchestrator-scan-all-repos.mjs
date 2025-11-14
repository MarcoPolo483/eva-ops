#!/usr/bin/env node
/**
 * Multi-Repo Orchestrator Scanner
 * 
 * Purpose: Act as Chief Orchestrator / Agile Scrum Master
 * - Scans all 17 EVA 2.0 repositories in circular order
 * - Analyzes test failures, performance issues, technical debt
 * - Assigns work to agents based on capacity and velocity
 * - Creates GitHub Issues with proper labels and project board cards
 * - Generates real-time metrics for live dashboards
 * 
 * Usage:
 *   node scripts/orchestrator-scan-all-repos.mjs
 *   node scripts/orchestrator-scan-all-repos.mjs --repo eva-core
 *   node scripts/orchestrator-scan-all-repos.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'yaml';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const WORKSPACE_ROOT = 'c:\\Users\\marco\\dev';
const CONFIG_PATH = path.join(process.cwd(), 'orchestrator.yml');
const METRICS_DIR = path.join(process.cwd(), 'metrics');
const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_REPO = process.argv.find(arg => arg.startsWith('--repo='))?.split('=')[1];

let config = null;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function log(level, msg, data = {}) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    console.log(prefix, msg, Object.keys(data).length ? JSON.stringify(data, null, 2) : '');
}

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error(`Config not found: ${CONFIG_PATH}`);
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = yaml.parse(raw);
    log('info', 'Loaded orchestrator config', {
        repos: config.repositories?.length,
        agents: config.agents?.length
    });
}

function getAgentCapacity(agentId) {
    const agent = config.agents.find(a => a.id === agentId);
    if (!agent) return 0;

    // Query GitHub for agent's current active issues
    try {
        const result = execSync(`gh issue list --assignee ${agentId} --state open --json number`, { encoding: 'utf8' });
        const issues = JSON.parse(result);
        const active = issues.length;
        const capacity = agent.max_active_issues - active;

        log('debug', `Agent ${agentId} capacity`, { active, max: agent.max_active_issues, available: capacity });
        return Math.max(0, capacity);
    } catch (e) {
        log('warn', `Failed to check capacity for ${agentId}`, { error: e.message });
        return agent.max_active_issues;
    }
}

function calculateStoryPoints(task) {
    // Analyze task complexity and return story points
    const { type, files_affected = 1, lines_changed = 50 } = task;

    if (type === 'security' || type === 'critical') return 5;
    if (files_affected >= 5 || lines_changed > 500) return 8;
    if (files_affected >= 3 || lines_changed > 200) return 5;
    if (files_affected >= 2 || lines_changed > 100) return 3;
    if (lines_changed > 50) return 2;
    return 1;
}

function assignAgent(task, repoName) {
    // Find best agent based on ownership, capacity, and specialties
    const ownership = config.ownership || {};
    const agents = config.agents || [];

    // Check ownership rules first
    for (const [domain, assignees] of Object.entries(ownership)) {
        if (task.domain === domain) {
            for (const agentId of assignees) {
                const capacity = getAgentCapacity(agentId);
                if (capacity > 0) {
                    return agentId;
                }
            }
        }
    }

    // Fall back to any agent with capacity
    for (const agent of agents) {
        const capacity = getAgentCapacity(agent.id);
        if (capacity > 0) {
            return agent.id;
        }
    }

    log('warn', 'No agent has capacity', { repo: repoName });
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// REPOSITORY SCANNING
// ═══════════════════════════════════════════════════════════════════════════

function scanRepository(repo) {
    log('info', `Scanning repository: ${repo.name}`);

    const repoPath = path.join(WORKSPACE_ROOT, repo.name);
    if (!fs.existsSync(repoPath)) {
        log('warn', `Repository not found: ${repoPath}`);
        return { repo: repo.name, tasks: [] };
    }

    const tasks = [];

    // 1. Check for test failures
    try {
        const testResult = execSync('npm test -- --reporter=json', {
            cwd: repoPath,
            encoding: 'utf8',
            stdio: 'pipe'
        });
        const testData = JSON.parse(testResult);

        if (testData.numFailedTests > 0) {
            tasks.push({
                type: 'test_failure',
                severity: 'high',
                summary: `Fix ${testData.numFailedTests} failing test(s)`,
                domain: 'testing',
                files_affected: testData.numFailedTests,
                details: testData.testResults
            });
        }
    } catch (e) {
        // Tests failed or not configured
        log('debug', `Test scan failed for ${repo.name}`, { error: e.message });
    }

    // 2. Check for lint errors
    try {
        execSync('npm run lint', { cwd: repoPath, stdio: 'pipe' });
    } catch (e) {
        tasks.push({
            type: 'lint_error',
            severity: 'medium',
            summary: 'Fix linting errors',
            domain: 'quality',
            files_affected: 1
        });
    }

    // 3. Check for outdated dependencies
    try {
        const outdated = execSync('npm outdated --json', { cwd: repoPath, encoding: 'utf8' });
        const deps = JSON.parse(outdated);
        const count = Object.keys(deps).length;

        if (count > 0) {
            tasks.push({
                type: 'dependency_update',
                severity: 'low',
                summary: `Update ${count} outdated dependencies`,
                domain: 'maintenance',
                files_affected: 1
            });
        }
    } catch (e) {
        // No outdated deps or npm issue
    }

    // 4. Check for TODO/FIXME comments (technical debt)
    try {
        const result = execSync('git grep -i -n "TODO\\|FIXME" -- "*.ts" "*.js"', {
            cwd: repoPath,
            encoding: 'utf8'
        });
        const lines = result.split('\n').filter(l => l.trim());

        if (lines.length > 10) {
            tasks.push({
                type: 'technical_debt',
                severity: 'low',
                summary: `Address ${lines.length} TODO/FIXME comments`,
                domain: 'refactoring',
                files_affected: Math.ceil(lines.length / 5)
            });
        }
    } catch (e) {
        // No TODOs found (good!)
    }

    log('info', `Found ${tasks.length} tasks in ${repo.name}`);
    return { repo: repo.name, tasks };
}

// ═══════════════════════════════════════════════════════════════════════════
// ISSUE CREATION
// ═══════════════════════════════════════════════════════════════════════════

function createGitHubIssue(task, repoName, assignee) {
    const storyPoints = calculateStoryPoints(task);
    const title = `[${task.severity.toUpperCase()}] ${task.summary}`;

    const labels = [
        config.issue_labels?.autogenerated || 'ai2/autogen',
        config.issue_labels?.sprint_ready || 'sprint-ready',
        `severity:${task.severity}`,
        `type:${task.type}`
    ].join(',');

    const body = [
        `**Repository:** ${repoName}`,
        `**Type:** ${task.type}`,
        `**Severity:** ${task.severity}`,
        `**Story Points:** ${storyPoints}`,
        `**Domain:** ${task.domain}`,
        '',
        '## Description',
        task.summary,
        '',
        '## Details',
        task.details ? `\`\`\`json\n${JSON.stringify(task.details, null, 2)}\n\`\`\`` : '_No additional details_',
        '',
        '## Acceptance Criteria',
        '- [ ] Task completed',
        '- [ ] Tests passing',
        '- [ ] Code review approved',
        '',
        '_Generated by orchestrator-scan-all-repos.mjs_'
    ].join('\n');

    if (DRY_RUN) {
        log('info', '[DRY-RUN] Would create issue', { title, assignee, labels });
        return;
    }

    try {
        const repoPath = path.join(WORKSPACE_ROOT, repoName);
        const cmd = `gh issue create --repo MarcoPolo483/${repoName} --title "${escapeShell(title)}" --body "${escapeShell(body)}" --label "${labels}" --assignee "${assignee}"`;

        const result = execSync(cmd, { cwd: repoPath, encoding: 'utf8' });
        log('info', 'Created issue', { repo: repoName, url: result.trim() });
    } catch (e) {
        log('error', 'Failed to create issue', { error: e.message, repo: repoName });
    }
}

function escapeShell(s) {
    return s.replace(/(["$`\\])/g, '\\$1');
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS & REPORTING
// ═══════════════════════════════════════════════════════════════════════════

function saveMetrics(scanResults) {
    if (!fs.existsSync(METRICS_DIR)) {
        fs.mkdirSync(METRICS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `scan-${timestamp}.json`;
    const filepath = path.join(METRICS_DIR, filename);

    const metrics = {
        scan_time: new Date().toISOString(),
        total_repos: scanResults.length,
        total_tasks: scanResults.reduce((sum, r) => sum + r.tasks.length, 0),
        by_repo: scanResults.map(r => ({
            repo: r.repo,
            tasks: r.tasks.length
        })),
        by_severity: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
        }
    };

    for (const result of scanResults) {
        for (const task of result.tasks) {
            metrics.by_severity[task.severity] = (metrics.by_severity[task.severity] || 0) + 1;
        }
    }

    fs.writeFileSync(filepath, JSON.stringify(metrics, null, 2));
    log('info', 'Saved metrics', { file: filename });

    // Keep only last 100 metric files
    const files = fs.readdirSync(METRICS_DIR).filter(f => f.startsWith('scan-'));
    if (files.length > 100) {
        files.sort().slice(0, files.length - 100).forEach(f => {
            fs.unlinkSync(path.join(METRICS_DIR, f));
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATION LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
    log('info', '═══════════════════════════════════════════════════════════');
    log('info', 'EVA 2.0 Chief Orchestrator - Multi-Repo Scanner');
    log('info', '═══════════════════════════════════════════════════════════');

    loadConfig();

    if (DRY_RUN) {
        log('info', 'DRY-RUN MODE: No issues will be created');
    }

    const repos = SINGLE_REPO
        ? config.repositories.filter(r => r.name === SINGLE_REPO)
        : config.repositories;

    if (repos.length === 0) {
        log('error', `No repositories to scan (filter: ${SINGLE_REPO})`);
        process.exit(1);
    }

    log('info', `Scanning ${repos.length} repositories...`);

    const scanResults = [];

    for (const repo of repos) {
        const result = scanRepository(repo);
        scanResults.push(result);

        // Assign work for each task found
        for (const task of result.tasks) {
            const assignee = assignAgent(task, repo.name);

            if (assignee) {
                createGitHubIssue(task, repo.name, assignee);
            } else {
                log('warn', 'Task postponed (no capacity)', {
                    repo: repo.name,
                    task: task.summary
                });
            }
        }
    }

    saveMetrics(scanResults);

    log('info', '═══════════════════════════════════════════════════════════');
    log('info', 'Scan complete', {
        repos: scanResults.length,
        tasks: scanResults.reduce((sum, r) => sum + r.tasks.length, 0)
    });
    log('info', '═══════════════════════════════════════════════════════════');
}

main().catch(err => {
    log('error', 'Fatal error', { error: err.message, stack: err.stack });
    process.exit(1);
});
