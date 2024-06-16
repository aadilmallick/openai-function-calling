import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";

type OpenAIOptions = {
  model?: OpenAI.Chat.ChatModel;
};

class OpenAIModel {
  private model = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  constructor() {}

  async chat(
    messages: ChatCompletionMessageParam[],
    options: OpenAIOptions = {}
  ) {
    const response = await this.model.chat.completions.create({
      model: options.model || "gpt-3.5-turbo",
      messages,
      ...options,
    });

    return {
      content: response.choices[0].message.content,
      finish_reason: response.choices[0].finish_reason,
    };
  }

  async chatWithToolCall({
    cb,
    functions,
    messages,
    options = {},
  }: {
    messages: ChatCompletionMessageParam[];
    functions: OpenAI.FunctionDefinition[];
    cb: (obj: Record<string, any>) => string;
    options?: OpenAIOptions;
  }) {
    const tools = functions.map((func) => ({
      function: {
        ...func,
      },
      type: "function",
    })) as OpenAI.Chat.Completions.ChatCompletionTool[];
    const response = await this.model.chat.completions.create({
      model: options.model || "gpt-3.5-turbo",
      messages,
      tools,
      tool_choice: "auto", // the engine will decide which tool to use,
      ...options,
    });

    const willInvokeFunction =
      response.choices[0].finish_reason == "tool_calls";
    const toolCall = response.choices[0].message.tool_calls![0];

    if (willInvokeFunction) {
      const toolName = toolCall.function.name;
      let returnValue!: Awaited<ReturnType<OpenAIModel["chat"]>>;
      const promises = functions.map(async (func) => {
        // if function name equals toolName, then invoke function, pass arguments into it
        if (func.name === toolName) {
          const rawArgument = toolCall.function.arguments;
          const parsedArguments = JSON.parse(rawArgument);

          // call user callback
          const funcReturnValue = cb(parsedArguments);

          // invoke model again
          const context = [...messages];
          context.push(response.choices[0].message);
          context.push({
            role: "tool",
            content: funcReturnValue,
            tool_call_id: toolCall.id,
          });

          const secondResponse = await this.chat(context, options);
          returnValue = secondResponse;
        }
      });
      await Promise.all(promises);
      return returnValue;
    }
    // model is called normally, does not opt to use function
    else {
      return {
        content: response.choices[0].message.content,
        finish_reason: response.choices[0].finish_reason,
      };
    }
  }
}

function getTime(now = false) {
  if (now === true) {
    return String(new Date());
  }
  return "5:45";
}

const model = new OpenAIModel();
const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: "You are a helpful assistant.",
  },
  {
    role: "user",
    content: "what is the current time?",
  },
];
const functions = [
  {
    name: "getTime",
    description: "use this for when you want to get the time, current or not.",
    parameters: {
      type: "object",
      properties: {
        now: {
          type: "boolean",
          description: "whether or not to get the current time",
        },
      },
      required: [],
    },
  },
];
const response = await model.chatWithToolCall({
  messages,
  functions,
  cb: (obj: Record<string, any>) => {
    return getTime(obj["now"]);
  },
});
console.log(response.content);
