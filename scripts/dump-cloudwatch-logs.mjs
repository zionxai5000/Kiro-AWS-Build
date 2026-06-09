import { CloudWatchLogsClient, GetLogEventsCommand, DescribeLogStreamsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { writeFile } from 'node:fs/promises';

const cli = new CloudWatchLogsClient({ region: 'us-east-1' });
const lg = '/seraphim/agent-runtime';

const streams = await cli.send(new DescribeLogStreamsCommand({
  logGroupName: lg,
  orderBy: 'LastEventTime',
  descending: true,
  limit: 1,
}));
const stream = streams.logStreams?.[0]?.logStreamName;
if (!stream) { console.error('no streams'); process.exit(1); }
console.log('stream:', stream);

const events = await cli.send(new GetLogEventsCommand({
  logGroupName: lg,
  logStreamName: stream,
  limit: 300,
  startFromHead: false,
}));
const lines = events.events?.map((e) => `${new Date(e.timestamp ?? 0).toISOString()} ${e.message?.replace(/\s+/g, ' ').slice(0, 280)}`) ?? [];
await writeFile('.latest-logs.txt', lines.join('\n'), 'utf-8');
console.log(`wrote ${lines.length} lines`);
