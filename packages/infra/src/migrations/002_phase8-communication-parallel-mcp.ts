/**
 * Phase 8 migration: Parallel Agent Orchestration, MCP Integration,
 * and Unified Communication Layer.
 *
 * Creates tables for:
 * - chat_messages: persistent chat history per agent
 * - context_share_events: cross-agent context propagation log
 * - notification_rules: per-user notification routing rules
 * - notification_deliveries: notification delivery tracking
 * - telegram_account_links: Telegram ↔ SeraphimOS account linking
 * - mcp_tool_registry: unified MCP tool registry
 * - parallel_execution_dags: parallel execution DAG tracking
 *
 * Validates: Requirements 35c.8, 36c.10, 37a.2, 37c.12, 38c.7, 41.1
 */

import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Apply Phase 8 schema: communication, MCP, and parallel execution tables.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // ---------------------------------------------------------------
  // Chat Messages
  // ---------------------------------------------------------------
  pgm.createTable('chat_messages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    agent_id: { type: 'varchar(100)', notNull: true },
    user_id: { type: 'uuid', references: 'tenants(id)' },
    sender_type: { type: 'varchar(10)', notNull: true },
    sender_name: { type: 'varchar(255)', notNull: true },
    content: { type: 'text', notNull: true },
    priority: { type: 'varchar(10)', default: "'normal'" },
    source: { type: 'varchar(20)', notNull: true },
    metadata: { type: 'jsonb', default: "'{}'" },
    reply_to: { type: 'uuid', references: 'chat_messages(id)' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('chat_messages', 'chat_messages_sender_type_check', {
    check: "sender_type IN ('user', 'agent')",
  });

  pgm.addConstraint('chat_messages', 'chat_messages_priority_check', {
    check: "priority IN ('low', 'normal', 'high', 'critical')",
  });

  pgm.addConstraint('chat_messages', 'chat_messages_source_check', {
    check: "source IN ('dashboard', 'telegram', 'api')",
  });

  pgm.createIndex('chat_messages', ['tenant_id', 'agent_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'idx_chat_agent_time',
  });

  pgm.createIndex('chat_messages', ['tenant_id', 'user_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'idx_chat_user_time',
  });

  pgm.createIndex('chat_messages', ['source', { name: 'created_at', sort: 'DESC' }], {
    name: 'idx_chat_source',
  });

  // ---------------------------------------------------------------
  // Context Share Events
  // ---------------------------------------------------------------
  pgm.createTable('context_share_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    from_agent_id: { type: 'varchar(100)', notNull: true },
    to_agent_id: { type: 'varchar(100)', notNull: true },
    message_id: { type: 'uuid', references: 'chat_messages(id)' },
    reason: { type: 'varchar(20)', notNull: true },
    relevance_score: { type: 'decimal(3, 2)' },
    shared_content: { type: 'text', notNull: true },
    acknowledged: { type: 'boolean', default: false },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('context_share_events', 'context_share_reason_check', {
    check: "reason IN ('auto_detected', 'explicit_tag', 'handoff')",
  });

  pgm.createIndex('context_share_events', ['tenant_id', 'to_agent_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'idx_context_share_agent',
  });

  // ---------------------------------------------------------------
  // Notification Routing Rules
  // ---------------------------------------------------------------
  pgm.createTable('notification_rules', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    user_id: { type: 'uuid', notNull: true },
    conditions: { type: 'jsonb', notNull: true },
    channels: { type: 'text[]', notNull: true },
    escalation: { type: 'jsonb' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  // ---------------------------------------------------------------
  // Notification Deliveries
  // ---------------------------------------------------------------
  pgm.createTable('notification_deliveries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    notification_id: { type: 'uuid', notNull: true },
    user_id: { type: 'uuid', notNull: true },
    channel: { type: 'varchar(20)', notNull: true },
    status: { type: 'varchar(20)', notNull: true },
    delivered_at: { type: 'timestamptz' },
    acknowledged_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('notification_deliveries', 'notif_delivery_status_check', {
    check: "status IN ('pending', 'delivered', 'acknowledged', 'escalated', 'failed')",
  });

  pgm.createIndex('notification_deliveries', ['tenant_id', 'user_id', 'status'], {
    name: 'idx_notif_delivery_user',
  });

  // ---------------------------------------------------------------
  // Telegram Account Links
  // ---------------------------------------------------------------
  pgm.createTable('telegram_account_links', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    user_id: { type: 'uuid', notNull: true },
    telegram_user_id: { type: 'bigint', notNull: true, unique: true },
    telegram_username: { type: 'varchar(255)' },
    linked_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  // ---------------------------------------------------------------
  // MCP Tool Registry
  // ---------------------------------------------------------------
  pgm.createTable('mcp_tool_registry', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tool_name: { type: 'varchar(255)', notNull: true },
    description: { type: 'text', notNull: true },
    source: { type: 'varchar(20)', notNull: true },
    agent_id: { type: 'varchar(100)' },
    server_url: { type: 'varchar(500)' },
    input_schema: { type: 'jsonb', notNull: true },
    output_schema: { type: 'jsonb' },
    required_authority: { type: 'varchar(5)' },
    cost_estimate: { type: 'decimal(10, 6)' },
    availability: { type: 'varchar(20)', default: "'available'" },
    last_health_check: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('mcp_tool_registry', 'mcp_tool_source_check', {
    check: "source IN ('internal', 'external')",
  });

  pgm.createIndex('mcp_tool_registry', ['source', 'availability'], {
    name: 'idx_mcp_tools_source',
  });

  pgm.createIndex('mcp_tool_registry', ['agent_id'], {
    name: 'idx_mcp_tools_agent',
  });

  // ---------------------------------------------------------------
  // Parallel Execution DAGs
  // ---------------------------------------------------------------
  pgm.createTable('parallel_execution_dags', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    created_by: { type: 'varchar(100)', notNull: true },
    tasks: { type: 'jsonb', notNull: true },
    edges: { type: 'jsonb', notNull: true },
    status: { type: 'varchar(20)', default: "'pending'" },
    metadata: { type: 'jsonb', default: "'{}'" },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    completed_at: { type: 'timestamptz' },
  });

  pgm.addConstraint('parallel_execution_dags', 'dag_status_check', {
    check: "status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')",
  });

  pgm.createIndex('parallel_execution_dags', ['tenant_id', 'status'], {
    name: 'idx_dag_status',
  });
}

/**
 * Rollback Phase 8 schema: drop all tables in reverse order.
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('parallel_execution_dags', { ifExists: true });
  pgm.dropTable('mcp_tool_registry', { ifExists: true });
  pgm.dropTable('telegram_account_links', { ifExists: true });
  pgm.dropTable('notification_deliveries', { ifExists: true });
  pgm.dropTable('notification_rules', { ifExists: true });
  pgm.dropTable('context_share_events', { ifExists: true });
  pgm.dropTable('chat_messages', { ifExists: true });
}
