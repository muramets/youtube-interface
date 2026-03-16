Create an engineering task document for the feature we've been discussing in this conversation.

Use the task-architect agent pattern from `.claude/agents/task-architect.md` and follow the project's agentic task document conventions from CLAUDE.md.

The task document should be created in `docs/features/` alongside the feature doc, and must include:
1. Quick Context Recovery (3-5 files)
2. Key Decisions (carry forward)
3. Agent Orchestration Strategy
4. Phase Status Table
5. Current Test Count (run `npm run test:run` to get real numbers)
6. Per-phase tasks with checkboxes, parallelization plans, verification commands
7. Review Gates after each phase
8. FINAL double review cycle (R1 Architecture + R2 Production Readiness)

Reference implementation: `docs/archive/tasks/chat/competitive-intelligence-stage2-3-tasks.md`
