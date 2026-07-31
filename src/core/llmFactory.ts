import { ChatOpenAI } from '@langchain/openai';
import { config, requireModelApiKey } from '../config.js';

export interface CreateChatModelOptions {
  model?: string;
  temperature?: number;
  streaming?: boolean;
}

export function createChatModel(options: CreateChatModelOptions = {}): ChatOpenAI {
  return new ChatOpenAI({
    model: options.model ?? config.langchainModel,
    temperature: options.temperature ?? 0.7,
    streaming: options.streaming ?? true,
    apiKey: requireModelApiKey(),
    configuration: { baseURL: config.baseUrl },
  });
}
