export { retrieveKnowledge } from './knowledgeTool.js';
export { getCurrentTime } from './timeTool.js';
export { queryPrometheusAlerts } from './queryMetricsAlerts.js';

import { retrieveKnowledge } from './knowledgeTool.js';
import { getCurrentTime } from './timeTool.js';
import { queryPrometheusAlerts } from './queryMetricsAlerts.js';

export const defaultLocalAgentTools = [retrieveKnowledge, getCurrentTime, queryPrometheusAlerts];
