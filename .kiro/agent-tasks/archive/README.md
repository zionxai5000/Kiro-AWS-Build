# Agent Tasks Queue

This directory is the handoff point between SeraphimOS agents and Kiro.

## How it works:
1. An agent proposes work in the dashboard chat
2. The King approves the task
3. The agent writes a task file here
4. A Kiro hook detects the new file and executes it
5. Completed tasks move to `completed/`
6. Failed tasks move to `failed/`

## Task file format:
See any `.md` file in this directory for the structure.
