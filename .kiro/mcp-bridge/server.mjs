/**
 * SeraphimOS MCP Bridge Server
 *
 * Bridges SeraphimOS agents (running on AWS ECS) with Kiro (running in the IDE).
 * 
 * Architecture:
 * - Agents write task requests to S3: s3://seraphim-dashboard-live/mcp-bridge/requests/
 * - This MCP server polls S3 for new requests
 * - When a request is found, it exposes it as an MCP tool result
 * - Kiro executes the task and writes results back to S3
 * - Agents poll S3 for results
 *
 * Tools exposed to Kiro:
 * - check_agent_tasks: Poll for pending tasks from agents
 * - complete_task: Mark a task as completed with results
 * - fail_task: Mark a task as failed with error
 * - get_task_details: Get full details of a specific task
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = 'seraphim-dashboard-live';
const REQUEST_PREFIX = 'mcp-bridge/requests/';
const RESULT_PREFIX = 'mcp-bridge/results/';
const REGION = 'us-east-1';

const s3 = new S3Client({ region: REGION });

// Create MCP server
const server = new Server(
  { name: 'seraphim-mcp-bridge', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'check_agent_tasks',
      description: 'Check for pending tasks dispatched by SeraphimOS agents. Returns a list of tasks waiting for execution.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_task_details',
      description: 'Get the full details of a specific agent task by its ID.',
      inputSchema: {
        type: 'object',
        properties: { taskId: { type: 'string', description: 'The task ID to retrieve' } },
        required: ['taskId'],
      },
    },
    {
      name: 'complete_task',
      description: 'Mark an agent task as completed and write results back for the agent to read.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to complete' },
          result: { type: 'string', description: 'The execution result/summary' },
          filesChanged: { type: 'array', items: { type: 'string' }, description: 'List of files that were modified' },
        },
        required: ['taskId', 'result'],
      },
    },
    {
      name: 'fail_task',
      description: 'Mark an agent task as failed with an error message.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID that failed' },
          error: { type: 'string', description: 'The error message/reason for failure' },
        },
        required: ['taskId', 'error'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'check_agent_tasks': {
      try {
        const response = await s3.send(new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: REQUEST_PREFIX,
        }));
        const tasks = (response.Contents || [])
          .filter(obj => obj.Key && obj.Key.endsWith('.json'))
          .map(obj => ({
            taskId: obj.Key.replace(REQUEST_PREFIX, '').replace('.json', ''),
            createdAt: obj.LastModified?.toISOString(),
            size: obj.Size,
          }));
        return {
          content: [{
            type: 'text',
            text: tasks.length > 0
              ? `Found ${tasks.length} pending task(s):\n${tasks.map(t => `- ${t.taskId} (created: ${t.createdAt})`).join('\n')}`
              : 'No pending tasks from agents.',
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error checking tasks: ${err.message}` }] };
      }
    }

    case 'get_task_details': {
      try {
        const taskId = args.taskId;
        const response = await s3.send(new GetObjectCommand({
          Bucket: BUCKET,
          Key: `${REQUEST_PREFIX}${taskId}.json`,
        }));
        const body = await response.Body.transformToString();
        const task = JSON.parse(body);
        return {
          content: [{
            type: 'text',
            text: `Task: ${task.title}\nAgent: ${task.agent}\nPriority: ${task.priority}\nDescription: ${task.description}\nInstructions:\n${(task.instructions || []).map((s, i) => `${i+1}. ${s}`).join('\n')}\nCriteria:\n${(task.criteria || []).map(c => `- ${c}`).join('\n')}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error getting task: ${err.message}` }] };
      }
    }

    case 'complete_task': {
      try {
        const { taskId, result, filesChanged } = args;
        // Write result to S3
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: `${RESULT_PREFIX}${taskId}.json`,
          Body: JSON.stringify({ taskId, status: 'completed', result, filesChanged: filesChanged || [], completedAt: new Date().toISOString() }),
          ContentType: 'application/json',
        }));
        // Delete the request
        await s3.send(new DeleteObjectCommand({
          Bucket: BUCKET,
          Key: `${REQUEST_PREFIX}${taskId}.json`,
        }));
        return { content: [{ type: 'text', text: `Task ${taskId} marked as completed. Result written to S3.` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error completing task: ${err.message}` }] };
      }
    }

    case 'fail_task': {
      try {
        const { taskId, error } = args;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: `${RESULT_PREFIX}${taskId}.json`,
          Body: JSON.stringify({ taskId, status: 'failed', error, failedAt: new Date().toISOString() }),
          ContentType: 'application/json',
        }));
        await s3.send(new DeleteObjectCommand({
          Bucket: BUCKET,
          Key: `${REQUEST_PREFIX}${taskId}.json`,
        }));
        return { content: [{ type: 'text', text: `Task ${taskId} marked as failed. Error: ${error}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error failing task: ${err.message}` }] };
      }
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('SeraphimOS MCP Bridge running');
}

main().catch(console.error);
